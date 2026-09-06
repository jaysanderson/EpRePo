#!/usr/bin/env python3
"""EpRePo corpus uploader - pushes ~/epilepsy_corpus into the research-portal-eprepo
knowledge box, 80 resources at a time, waiting for each batch to finish processing
before the next starts. Strategy: ~/Claude/EpRePo/docs/EPREPO-INGESTION.md

  python3 upload_corpus.py run [--batch 80] [--kinds article,xml,supp,media] [--limit N] [--dry-run]
  python3 upload_corpus.py status
  python3 upload_corpus.py watch
  python3 upload_corpus.py reconcile
  python3 upload_corpus.py retry-errors

Credentials come from ~/Claude/EpRePo/.env (ARAG_ZONE, ARAG_KB_EPREPO, ARAG_KB_EPREPO_TOKEN).
Python 3 standard library + requests. Resumable: state in .upload_state.json, and every start
reconciles against the box by resource slug so nothing is ever uploaded twice.
"""
import argparse, base64, csv, glob, json, logging, os, re, sys, time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
import requests

CORPUS = os.path.expanduser('~/epilepsy_corpus')
ENV_PATH = os.path.expanduser('~/Claude/EpRePo/.env')
MANIFEST = os.path.join(CORPUS, 'epilepsy_corpus_manifest.csv')
STATE_PATH = os.path.join(CORPUS, '.upload_state.json')
CACHE_PATH = os.path.join(CORPUS, 'metadata_cache.json')
LOG_PATH = os.path.join(CORPUS, 'upload.log')
UA = {'User-Agent': 'eprepo-corpus-uploader/1.0 (mailto:jay@vestedtechnology.com.au)'}
POLL_EVERY = 20          # seconds between status sweeps of a batch
BATCH_CEILING = 45 * 60  # seconds before a still-pending resource is marked stuck
UPLOAD_GAP = 1.0         # seconds between uploads
BACKOFF = [30, 60, 120]
KIND_ORDER = {'article': 0, 'xml': 1, 'supp': 2, 'media': 3}
KIND_LABEL = {'article': 'article', 'xml': 'article', 'supp': 'supplement', 'media': 'media'}
CONTENT_TYPES = {'.pdf': 'application/pdf', '.mp4': 'video/mp4', '.mov': 'video/quicktime',
                 '.wmv': 'video/x-ms-wmv', '.avi': 'video/x-msvideo', '.m4v': 'video/x-m4v'}
TOPIC_RULES = [  # first match wins; checked against title + keywords + MeSH
    (r'pregnan|teratogen|malformation|fetal|foetal|breastfe|lactation|in utero', 'pregnancy-teratogenicity'),
    (r'encephalitis|autoimmun|antibod|NMDAR|LGI1|CASPR2|GAD65', 'autoimmune-encephalitis'),
    (r'forecast|multiday|cycle|wearable|circadian|ultradian|seizure risk|prediction|diar', 'seizure-forecasting-cycles'),
    (r'\bgene|genetic|genom|variant|mutation|exome|sequencing|SCN\d|GABR|KCN|Dravet|encephalopath|familial|inherit', 'genetics-genomics'),
    (r'stimulat|implant|neurostim|deep brain|vagus|responsive|electrode|closed.loop|device', 'devices-neurostimulation'),
    (r'surg|resect|MRI|imaging|PET\b|lesion|dysplasia|stereo|SEEG|hippocamp|radiolog|tractograph', 'epilepsy-surgery-imaging'),
    (r'EEG|electroenceph|spike|high.frequency|oscillat|interictal|neurophysiol|intracranial|network', 'eeg-neurophysiology'),
    (r'psychiatr|depress|anxiety|functional seizure|psychogenic|PNES|dissociative|quality of life|cognit|memory|mood|stigma', 'psychiatry-functional-seizures'),
    (r'antiseizure|antiepileptic|anticonvulsant|drug|medication|cannabidiol|levetiracetam|lamotrigine|valpro|carbamazepine|pharmac|resistan|therap|treatment|trial', 'antiseizure-medications'),
]
DEFAULT_TOPIC = 'epidemiology-outcomes'

logging.basicConfig(filename=LOG_PATH, level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger()
now = lambda: datetime.now(timezone.utc).isoformat(timespec='seconds')


# --------------------------------------------------------------------------- platform client
def load_env():
    env = {}
    with open(ENV_PATH) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1); env[k] = v
    for k in ('ARAG_ZONE', 'ARAG_KB_EPREPO', 'ARAG_KB_EPREPO_TOKEN'):
        if not env.get(k): sys.exit(f'{k} missing from {ENV_PATH} - run `deno task provision -- eprepo` first')
    return env

class Client:
    def __init__(self, env):
        self.base = f"https://{env['ARAG_ZONE']}.rag.progress.cloud/api/v1/kb/{env['ARAG_KB_EPREPO']}"
        self.s = requests.Session()
        self.s.headers.update({**UA, 'x-nuclia-serviceaccount': f"Bearer {env['ARAG_KB_EPREPO_TOKEN']}"})

    def call(self, method, path, *, json_body=None, data=None, headers=None, timeout=120, ok404=False):
        for attempt in range(len(BACKOFF) + 1):
            try:
                r = self.s.request(method, self.base + path, json=json_body, data=data, headers=headers, timeout=timeout)
            except requests.RequestException as e:
                log.warning(f'{method} {path}: {e}')
                if attempt < len(BACKOFF): time.sleep(BACKOFF[attempt]); continue
                raise
            if r.status_code == 404 and ok404: return None
            if r.status_code in (429,) or r.status_code >= 500:
                log.warning(f'{method} {path} -> {r.status_code}, backoff {attempt}')
                if attempt < len(BACKOFF): time.sleep(BACKOFF[attempt]); continue
            if r.status_code >= 400:
                raise RuntimeError(f'{method} {path} -> {r.status_code}: {r.text[:300]}')
            try: return r.json()
            except ValueError: return {}
        raise RuntimeError(f'{method} {path}: exhausted backoff')

    def find_slug(self, slug):
        j = self.call('GET', f'/slug/{slug}?show=basic', ok404=True)
        if not j: return None
        return {'uuid': j.get('id') or j.get('uuid'), 'status': (j.get('metadata') or {}).get('status')}

    def upload(self, path, content_type):
        with open(path, 'rb') as f: data = f.read()
        fname = base64.b64encode(os.path.basename(path).encode('utf-8')).decode('ascii')
        j = self.call('POST', '/upload', data=data, timeout=600,
                      headers={'content-type': content_type, 'x-filename': fname})
        uuid = j.get('uuid') or j.get('resource')
        if not uuid: raise RuntimeError(f'upload returned no uuid: {json.dumps(j)[:200]}')
        return uuid

    def create_text(self, body): return (self.call('POST', '/resources', json_body=body) or {}).get('uuid')
    def patch(self, uuid, body): self.call('PATCH', f'/resource/{uuid}', json_body=body)
    def status(self, uuid):
        j = self.call('GET', f'/resource/{uuid}?show=basic', ok404=True)
        if j is None: return 'MISSING'
        return ((j.get('metadata') or {}).get('status') or 'PENDING').upper()
    def counters(self):
        try: return self.call('GET', '/counters') or {}
        except Exception as e: return {'error': str(e)[:80]}
    def ensure_kind_labelset(self):
        """The structural `format` labelset (what the file is). `kind` (study type) belongs to corpus analysis."""
        body = {'title': 'Format', 'color': '#6b5fa8', 'multiple': False, 'kind': ['RESOURCES'],
                'labels': [{'title': 'article', 'text': 'The published journal article itself'},
                           {'title': 'supplement', 'text': 'Supplementary material, data sheets or peer review history attached to an article'},
                           {'title': 'media', 'text': 'A video or audio file attached to an article'}]}
        for m in ('POST', 'PUT'):
            try: self.call(m, '/labelset/format', json_body=body); return True
            except RuntimeError as e: last = e
        log.warning(f'could not configure format labelset: {last}'); return False
    def topic_labels(self):
        try:
            ls = (self.call('GET', '/labelsets') or {}).get('labelsets', {})
            return [l['title'] for l in (ls.get('topic') or {}).get('labels', []) if l.get('title')]
        except Exception as e:
            log.warning(f'could not read topic labelset: {e}'); return []


# --------------------------------------------------------------------------- inventory
def read_manifest():
    with open(MANIFEST, newline='') as f: return list(csv.DictReader(f))

def inventory():
    """Every file that should be in the box, as {slug, kind, file, pmcid, row, n}."""
    items = []
    for row in read_manifest():
        st = row['download_status']
        if st not in ('ok', 'xml_only'): continue
        pmcid = row['pmcid']
        main = os.path.join(CORPUS, row['filename'])
        if os.path.isfile(main):
            items.append({'slug': pmcid, 'kind': 'xml' if main.endswith('.xml') else 'article', 'file': main, 'pmcid': pmcid, 'row': row, 'n': 0})
        for kind, tag in (('supp', '_supp_'), ('media', '_media_')):
            for n, p in enumerate(sorted(glob.glob(os.path.join(CORPUS, f'*_{pmcid}{tag}*'))), 1):
                if os.path.splitext(p)[1].lower() not in CONTENT_TYPES: continue
                items.append({'slug': f'{pmcid}-{kind}-{n}', 'kind': kind, 'file': p, 'pmcid': pmcid, 'row': row, 'n': n})
    def key(it):
        r = it['row']
        return (KIND_ORDER[it['kind']], 0 if 'dsouza' in r['author_group'] else 1, -int(r['year'] or 0), it['slug'])
    items.sort(key=key)
    return items


# --------------------------------------------------------------------------- metadata
def load_json(path, default):
    try:
        with open(path) as f: return json.load(f)
    except (OSError, ValueError): return default

def save_json(path, obj):
    tmp = path + '.tmp'
    with open(tmp, 'w') as f: json.dump(obj, f, indent=1)
    os.replace(tmp, path)

def fetch_europepmc(pmcids, cache):
    """abstract, keywords, MeSH, licence, dates per PMCID from Europe PMC (40 ids per call)."""
    missing = [p for p in pmcids if p not in cache]
    for i in range(0, len(missing), 40):
        batch = missing[i:i + 40]
        q = '(' + ' OR '.join(f'PMCID:{p}' for p in batch) + ')'
        try:
            r = requests.get('https://www.ebi.ac.uk/europepmc/webservices/rest/search',
                             params={'query': q, 'resultType': 'core', 'format': 'json', 'pageSize': 100}, headers=UA, timeout=90)
            results = r.json()['resultList']['result']
        except Exception as e:
            log.warning(f'europepmc batch failed: {e}'); results = []
        found = {}
        for x in results:
            found[x.get('pmcid')] = {
                'abstract': re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', x.get('abstractText') or '')).strip(),
                'keywords': (x.get('keywordList') or {}).get('keyword', []),
                'mesh': [m.get('descriptorName') for m in (x.get('meshHeadingList') or {}).get('meshHeading', []) if m.get('descriptorName')],
                'license': x.get('license') or '',
                'published': x.get('firstPublicationDate') or '',
                'pubTypes': (x.get('pubTypeList') or {}).get('pubType', []),
                'citedBy': x.get('citedByCount'),
            }
        for p in batch: cache[p] = found.get(p, {'abstract': '', 'keywords': [], 'mesh': [], 'license': '', 'published': ''})
        save_json(CACHE_PATH, cache); time.sleep(1.0)
    return cache

LIVE_TOPICS = []  # the box's current `topic` labels, read at start; empty = use the rule ids as they are
# When corpus analysis has redesigned the topics, the rule ids are mapped onto the nearest live id.
TOPIC_REMAP = {
    'genetics-genomics': ['genetic-studies', 'genetics'], 'antiseizure-medications': ['therapeutic-interventions', 'clinical-trials'],
    'pregnancy-teratogenicity': ['therapeutic-interventions'], 'epilepsy-surgery-imaging': ['neuroimaging'],
    'eeg-neurophysiology': ['biomarkers', 'neuroimaging'], 'devices-neurostimulation': ['therapeutic-interventions'],
    'seizure-forecasting-cycles': ['biomarkers'], 'autoimmune-encephalitis': ['epilepsy-research'],
    'psychiatry-functional-seizures': ['epilepsy-research'], 'epidemiology-outcomes': ['epilepsy-research'],
}

def pick_topic(row, meta):
    text = ' '.join([row['title']] + meta.get('keywords', []) + meta.get('mesh', []))
    topic = DEFAULT_TOPIC
    for rx, t in TOPIC_RULES:
        if re.search(rx, text, re.I): topic = t; break
    if not LIVE_TOPICS or topic in LIVE_TOPICS: return topic
    for alt in TOPIC_REMAP.get(topic, []):
        if alt in LIVE_TOPICS: return alt
    return LIVE_TOPICS[0]

def supplement_label(orig, n):
    low = orig.lower()
    if 'reviewer' in low or 'peer' in low or 'review_history' in low: return f'Peer review history ({n})'
    if 'datasheet' in low or 'data_sheet' in low or 'data sheet' in low: return f'Supplementary data sheet {n}'
    if 'table' in low: return f'Supplementary tables {n}'
    if 'figure' in low or 'fig' in low: return f'Supplementary figures {n}'
    if 'appendix' in low: return f'Appendix {n}'
    return f'Supplementary material {n}'

def jats_to_markdown(path, row):
    root = ET.parse(path).getroot()
    txt = lambda el: re.sub(r'\s+', ' ', ''.join(el.itertext())).strip() if el is not None else ''
    out = [f"# {row['title']}", '', f"*{row['authors']}*  ", f"*{row['journal']}, {row['year']}. {row['pmcid']}" + (f", doi:{row['doi']}" if row['doi'] else '') + '*', '']
    abstract = root.find('.//front//abstract')
    if abstract is not None:
        out += ['## Abstract', ''] + [txt(p) for p in abstract.iter('p') if txt(p)] + ['']
    def walk(sec, level):
        title = sec.find('title')
        if title is not None and txt(title): out.append('#' * min(level, 6) + ' ' + txt(title)); out.append('')
        for child in sec:
            if child.tag == 'p' and txt(child): out.append(txt(child)); out.append('')
            elif child.tag == 'sec': walk(child, level + 1)
            elif child.tag in ('fig', 'table-wrap'):
                cap = child.find('.//caption')
                if cap is not None and txt(cap): out.append(f'*{child.tag.replace("-wrap", "").title()}: {txt(cap)}*'); out.append('')
    body = root.find('body')
    if body is not None:
        for sec in body.findall('sec'): walk(sec, 2)
    return '\n'.join(out)

def build_metadata(it, meta):
    row, kind, n = it['row'], it['kind'], it['n']
    groups = [g for g in row['author_group'].split(',') if g]
    authors = [a.strip() for a in row['authors'].split(';') if a.strip()]
    published = meta.get('published') or (f"{row['year']}-01-01" if row['year'] else '')
    orig = os.path.basename(it['file'])
    if kind in ('article', 'xml'): title = row['title']
    elif kind == 'supp': title = f"{supplement_label(orig, n)}: {row['title']}"
    else: title = f"Video {n}: {row['title']}"
    kind_label = KIND_LABEL[kind]
    # Keywords and MeSH headings are subject terms, not facts: the portal shows
    # them as keywords and leaves key facts to the enrichment pass.
    keywords = list(dict.fromkeys((meta.get('keywords') or []) + (meta.get('mesh') or [])))[:12]
    key_facts = []
    # The portal reads extra.metadata.type as the viewer kind ('pdf' | 'video' | 'web' | anything else = document);
    # the article/supplement/media distinction lives in the `kind` label and origin.metadata.kind.
    viewer_type = 'video' if kind == 'media' else 'document' if kind == 'xml' else 'pdf'
    extra = {
        'summary': meta.get('abstract') or '', 'keyFacts': key_facts, 'topic': pick_topic(row, meta),
        'type': viewer_type, 'published': published, 'authors': authors, 'journal': row['journal'],
        'year': row['year'], 'doi': row['doi'], 'pmid': row['pmid'], 'pmcid': row['pmcid'],
        'license': meta.get('license') or '', 'authorGroup': groups, 'sourceFile': orig,
        'keywords': keywords, 'titleCurated': True,
    }
    if kind in ('supp', 'media'): extra['parentPmcid'] = row['pmcid']; extra['parentTitle'] = row['title']
    origin = {
        'source_id': 'pmc-oa', 'url': f"https://pmc.ncbi.nlm.nih.gov/articles/{row['pmcid']}/",
        'filename': orig, 'collaborators': authors[:50],
        'tags': groups + [t for t in (row['journal'], row['year'], meta.get('license') or '') if t],
        'metadata': {k: str(v) for k, v in {'doi': row['doi'], 'pmid': row['pmid'], 'pmcid': row['pmcid'], 'journal': row['journal'],
                     'year': row['year'], 'license': meta.get('license') or '', 'kind': kind_label, 'parent': row['pmcid']}.items() if v},
    }
    if published: origin['created'] = published + ('T00:00:00Z' if len(published) == 10 else '')
    classifications = [{'labelset': 'topic', 'label': extra['topic']}, {'labelset': 'format', 'label': kind_label}]
    return {'slug': it['slug'], 'title': title, 'origin': origin, 'extra': {'metadata': extra}, 'usermetadata': {'classifications': classifications}}


# --------------------------------------------------------------------------- state
def load_state(): return load_json(STATE_PATH, {'version': 1, 'items': {}, 'batches': [], 'run': None})
def save_state(st): save_json(STATE_PATH, st)

def sync_items(state, items):
    for it in items:
        rec = state['items'].setdefault(it['slug'], {'status': 'pending', 'attempts': 0, 'uuid': None, 'batch': None, 'error': None, 'updated': now()})
        rec.update({'file': os.path.basename(it['file']), 'kind': it['kind'], 'pmcid': it['pmcid']})
    return state

def reconcile(client, state, items, only_pending=True, quiet=False):
    """Adopt resources that already exist in the box (matched by slug)."""
    adopted = 0
    todo = [it for it in items if not only_pending or state['items'][it['slug']]['status'] in ('pending', 'error', 'uploaded', 'stuck') or not state['items'][it['slug']].get('uuid')]
    for i, it in enumerate(todo):
        rec = state['items'][it['slug']]
        found = client.find_slug(it['slug'])
        if found and found['uuid']:
            if rec.get('uuid') != found['uuid'] or rec['status'] in ('pending', 'error'): adopted += 1
            rec['uuid'] = found['uuid']
            s = (found['status'] or 'PENDING').upper()
            rec['status'] = 'processed' if s == 'PROCESSED' else 'error' if s == 'ERROR' else 'uploaded'
            rec['updated'] = now()
        elif rec['status'] in ('uploaded', 'processed', 'stuck') and rec.get('uuid'):
            # slug lookup failed but we hold a uuid - keep it, the poll will settle it
            pass
        if i % 50 == 49: save_state(state); time.sleep(0.2)
    save_state(state)
    if not quiet: print(f'reconcile: checked {len(todo)} slugs, adopted/updated {adopted} from the box')
    log.info(f'reconcile checked={len(todo)} adopted={adopted}')
    return adopted


# --------------------------------------------------------------------------- run
def upload_item(client, it, payload, dry):
    kind = it['kind']
    if dry: return 'dry-run'
    if kind == 'xml':
        body = {'slug': payload['slug'], 'title': payload['title'], 'icon': 'text/plain',
                'texts': {'body': {'body': jats_to_markdown(it['file'], it['row']), 'format': 'MARKDOWN'}},
                'origin': payload['origin'], 'extra': payload['extra'], 'usermetadata': payload['usermetadata']}
        return client.create_text(body)
    ctype = CONTENT_TYPES[os.path.splitext(it['file'])[1].lower()]
    uuid = client.upload(it['file'], ctype)
    client.patch(uuid, payload)
    return uuid

def run(args):
    env = load_env(); client = Client(env)
    items = [it for it in inventory() if it['kind'] in args.kinds]
    state = sync_items(load_state(), items)
    cache = fetch_europepmc(sorted({it['pmcid'] for it in items}), load_json(CACHE_PATH, {}))
    LIVE_TOPICS[:] = client.topic_labels()
    if not args.dry_run:
        reconcile(client, state, items)
        client.ensure_kind_labelset()
    if not args.dry_run:
        for slug, rec in state['items'].items():  # settle anything a previous run left in flight
            if rec['status'] == 'uploaded' and rec.get('uuid'):
                s_ = client.status(rec['uuid'])
                if s_ == 'PROCESSED': rec.update({'status': 'processed', 'updated': now()})
                elif s_ in ('ERROR', 'MISSING'): rec.update({'status': 'error', 'error': f'platform {s_}', 'updated': now()})
        save_state(state)
    pending = [it for it in items if state['items'][it['slug']]['status'] == 'pending']
    if args.limit: pending = pending[:args.limit]
    print(f'{len(items)} items in scope, {len(pending)} to upload, batch size {args.batch}' + (' (dry run)' if args.dry_run else ''))
    if args.dry_run:
        for it in pending[:args.batch]:
            p = build_metadata(it, cache.get(it['pmcid'], {}))
            print(f"  {it['kind']:7s} {it['slug']:22s} topic={p['extra']['metadata']['topic']:30s} abstract={'yes' if p['extra']['metadata']['summary'] else 'no ':3s} {p['title'][:60]}")
        return
    state['run'] = {'pid': os.getpid(), 'started': now()}; save_state(state)
    batch_no = len(state['batches'])
    while pending:
        batch, pending = pending[:args.batch], pending[args.batch:]
        batch_no += 1
        started = time.time()
        print(f"[{datetime.now():%H:%M:%S}] batch {batch_no}: uploading {len(batch)} ({batch[0]['kind']} … {batch[-1]['kind']})", flush=True)
        log.info(f'batch {batch_no} start count={len(batch)}')
        uuids = {}
        for it in batch:
            rec = state['items'][it['slug']]
            try:
                payload = build_metadata(it, cache.get(it['pmcid'], {}))
                uuid = upload_item(client, it, payload, False)
                rec.update({'uuid': uuid, 'status': 'uploaded', 'batch': batch_no, 'attempts': rec['attempts'] + 1, 'error': None, 'updated': now()})
                uuids[it['slug']] = uuid
                log.info(f"uploaded {it['slug']} -> {uuid} ({rec['file']})")
            except Exception as e:
                rec.update({'status': 'error', 'batch': batch_no, 'attempts': rec['attempts'] + 1, 'error': str(e)[:300], 'updated': now()})
                print(f"  ! upload failed {it['slug']}: {str(e)[:120]}", flush=True); log.error(f"upload failed {it['slug']}: {e}")
            save_state(state); time.sleep(UPLOAD_GAP)
        # wait for the whole batch to reach a terminal state
        open_set = dict(uuids)
        while open_set and time.time() - started < BATCH_CEILING:
            time.sleep(POLL_EVERY)
            for slug, uuid in list(open_set.items()):
                s = client.status(uuid); rec = state['items'][slug]
                if s == 'PROCESSED': rec.update({'status': 'processed', 'updated': now()}); open_set.pop(slug)
                elif s in ('ERROR', 'MISSING'): rec.update({'status': 'error', 'error': f'platform {s}', 'updated': now()}); open_set.pop(slug); log.error(f'{slug} {s}')
                time.sleep(0.1)
            save_state(state)
            done = len(uuids) - len(open_set)
            print(f"  … {done}/{len(uuids)} processed ({int(time.time()-started)}s)", flush=True)
        for slug in open_set:
            state['items'][slug].update({'status': 'stuck', 'updated': now()}); log.warning(f'{slug} stuck after batch ceiling')
        summary = {'n': batch_no, 'started': datetime.fromtimestamp(started, timezone.utc).isoformat(timespec='seconds'), 'finished': now(), 'count': len(batch),
                   'processed': sum(1 for it in batch if state['items'][it['slug']]['status'] == 'processed'),
                   'error': sum(1 for it in batch if state['items'][it['slug']]['status'] == 'error'), 'stuck': len(open_set)}
        state['batches'].append(summary); save_state(state)
        print(f"[{datetime.now():%H:%M:%S}] batch {batch_no} done: {summary['processed']} processed, {summary['error']} error, {summary['stuck']} stuck, {int(time.time()-started)}s", flush=True)
        log.info(f'batch {batch_no} done {summary}')
        # settle earlier stragglers
        for slug, rec in state['items'].items():
            if rec['status'] in ('stuck', 'uploaded') and rec.get('uuid') and rec.get('batch') != batch_no:
                s = client.status(rec['uuid'])
                if s == 'PROCESSED': rec.update({'status': 'processed', 'updated': now()})
                elif s in ('ERROR', 'MISSING'): rec.update({'status': 'error', 'error': f'platform {s}', 'updated': now()})
        save_state(state)
    state['run'] = None; save_state(state)
    print('=== LOAD COMPLETE ===' if not any(r['status'] in ('pending',) for r in state['items'].values()) else 'run finished (some items remain pending - see status)')
    log.info('run finished')


# --------------------------------------------------------------------------- status / watch
def status(args, once=True):
    env = load_env(); client = Client(env)
    items = inventory(); state = sync_items(load_state(), items)
    recs = state['items']
    kinds = ['article', 'xml', 'supp', 'media']; states = ['pending', 'uploaded', 'processed', 'error', 'stuck']
    lines = [f"EpRePo upload status  {datetime.now():%Y-%m-%d %H:%M:%S}   box {env['ARAG_KB_EPREPO'][:8]}…", '']
    lines.append(f"{'kind':8s}" + ''.join(f'{s:>10s}' for s in states) + f"{'total':>8s}")
    tot = {s: 0 for s in states}
    for k in kinds:
        row = {s: sum(1 for r in recs.values() if r['kind'] == k and r['status'] == s) for s in states}
        for s in states: tot[s] += row[s]
        lines.append(f'{k:8s}' + ''.join(f'{row[s]:>10d}' for s in states) + f"{sum(row.values()):>8d}")
    lines.append(f"{'all':8s}" + ''.join(f'{tot[s]:>10d}' for s in states) + f"{sum(tot.values()):>8d}")
    run = state.get('run')
    cur = state['batches'][-1] if state['batches'] else None
    lines.append('')
    if run:
        alive = os.path.exists(f"/proc/{run['pid']}") if os.path.isdir('/proc') else (os.system(f"kill -0 {run['pid']} 2>/dev/null") == 0)
        n = (cur['n'] + 1) if cur else 1
        inb = [r for r in recs.values() if r.get('batch') == n]
        lines.append(f"run: {'active' if alive else 'NOT RUNNING (stale)'} since {run['started']}  batch {n}: {sum(1 for r in inb if r['status']=='processed')}/{len(inb)} processed, {sum(1 for r in inb if r['status']=='uploaded')} in flight")
    else:
        lines.append('run: not active')
    if cur: lines.append(f"last batch {cur['n']}: {cur['processed']}/{cur['count']} processed, {cur['error']} error, {cur['stuck']} stuck, finished {cur['finished']}")
    # throughput over the last hour
    cutoff = time.time() - 3600
    recent = sum(1 for r in recs.values() if r['status'] == 'processed' and datetime.fromisoformat(r['updated']).timestamp() > cutoff)
    remaining = tot['pending'] + tot['uploaded']
    eta = f'{remaining / recent:.1f} h' if recent else 'n/a'
    lines.append(f'throughput last hour: {recent} processed   remaining: {remaining}   eta: {eta}')
    c = client.counters()
    lines.append(f"box counters: resources={c.get('resources')} paragraphs={c.get('paragraphs')} fields={c.get('fields', c.get('sentences'))}" + (f"  ({c['error']})" if 'error' in c else ''))
    errs = [(s, r) for s, r in recs.items() if r['status'] in ('error', 'stuck')]
    if errs:
        lines.append(''); lines.append(f'errors/stuck ({len(errs)}):')
        for s, r in errs[:10]: lines.append(f"  {s:22s} {r['status']:6s} {(r.get('error') or '')[:90]}")
        if len(errs) > 10: lines.append(f'  … {len(errs) - 10} more in {STATE_PATH}')
    text = '\n'.join(lines)
    if once: print(text)
    return text, (remaining == 0 and not run)

def watch(args):
    while True:
        text, complete = status(args, once=False)
        os.system('clear'); print(text); print('\n(refreshes every 30 s, Ctrl-C to stop)')
        if complete: print('\n=== LOAD COMPLETE ==='); return
        time.sleep(30)

def retry_errors(args):
    state = load_state(); n = 0
    for r in state['items'].values():
        if r['status'] == 'error': r.update({'status': 'pending', 'error': None, 'updated': now()}); n += 1
    save_state(state); print(f're-queued {n} errored items')

def repatch(args):
    """Re-send title/origin/extra/labels for every resource already uploaded (e.g. after a metadata rule change)."""
    env = load_env(); client = Client(env)
    items = inventory(); state = load_state(); cache = fetch_europepmc(sorted({it['pmcid'] for it in items}), load_json(CACHE_PATH, {}))
    LIVE_TOPICS[:] = client.topic_labels(); client.ensure_kind_labelset()
    print('live topics:', LIVE_TOPICS)
    todo = [it for it in items if (state['items'].get(it['slug']) or {}).get('uuid')]
    print(f'repatching metadata on {len(todo)} resources')
    n = 0
    for it in todo:
        uuid = state['items'][it['slug']]['uuid']
        try:
            client.patch(uuid, build_metadata(it, cache.get(it['pmcid'], {}))); n += 1
        except Exception as e:
            print(f"  ! {it['slug']}: {str(e)[:100]}")
        time.sleep(0.3)
    print(f'repatched {n}')

def reconcile_cmd(args):
    env = load_env(); client = Client(env); items = inventory(); state = sync_items(load_state(), items)
    reconcile(client, state, items, only_pending=False)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    r = sub.add_parser('run'); r.add_argument('--batch', type=int, default=80); r.add_argument('--kinds', default='article,xml,supp,media')
    r.add_argument('--limit', type=int, default=0); r.add_argument('--dry-run', action='store_true')
    sub.add_parser('status'); sub.add_parser('watch'); sub.add_parser('reconcile'); sub.add_parser('retry-errors'); sub.add_parser('repatch')
    args = ap.parse_args()
    if args.cmd == 'run': args.kinds = [k.strip() for k in args.kinds.split(',')]; run(args)
    elif args.cmd == 'status': status(args)
    elif args.cmd == 'watch': watch(args)
    elif args.cmd == 'reconcile': reconcile_cmd(args)
    elif args.cmd == 'retry-errors': retry_errors(args)
    elif args.cmd == 'repatch': repatch(args)

if __name__ == '__main__':
    main()
