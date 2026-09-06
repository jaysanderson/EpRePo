#!/usr/bin/env python3
"""Download open-access epilepsy corpus listed in the manifest.

Sources, in order:
  1. PMC Article Datasets on AWS S3 (public bucket pmc-oa-opendata, unsigned HTTPS).
     This replaced the PMC OA Web Service (oa.fcgi) and FTP tarballs, which NCBI retired on 25 Aug 2026.
     Listing  : https://pmc-oa-opendata.s3.amazonaws.com/?prefix=PMC<id>.
     Article  : PMC<id>.<ver>/PMC<id>.<ver>.pdf  (+ .xml, media, supplementary files)
  2. Unpaywall -> best_oa_location.url_for_pdf (publisher-hosted PDF).
  3. XML only (if no PDF anywhere): S3 JATS XML, else Europe PMC REST fullTextXML. Saved as <stem>.xml.
Also grabs, for each article, video/audio media and supplementary PDFs from the S3 prefix
(saved as <stem>_media_<name> / <stem>_supp_<name>).

Polite: single-threaded, 1.5 s between requests, UA with contact email,
backoff 30/60/120 s on 429/403/5xx from API hosts (publisher 403s fail immediately).
Resumable: rows already holding a valid PDF/XML in the corpus dir are skipped.
Stdout: one line per successful download only. Everything else -> fetch_corpus.log.
"""
import csv, os, re, sys, time, glob, logging, xml.etree.ElementTree as ET
import requests

CORPUS = os.path.expanduser('~/epilepsy_corpus')
MANIFEST = os.path.join(CORPUS, 'epilepsy_corpus_manifest.csv')
LOG = os.path.join(CORPUS, 'fetch_corpus.log')
EMAIL = 'jay@vestedtechnology.com.au'
UA = {'User-Agent': f'epilepsy-corpus-builder/1.0 (mailto:{EMAIL}; python-requests)'}
S3 = 'https://pmc-oa-opendata.s3.amazonaws.com/'
EPMC = 'https://www.ebi.ac.uk/europepmc/webservices/rest/'
UNPAYWALL = 'https://api.unpaywall.org/v2/'
SLEEP = 1.5
BACKOFF = [30, 60, 120]
API_HOSTS = ('s3.amazonaws.com', 'ebi.ac.uk', 'unpaywall.org', 'ncbi.nlm.nih.gov')
SIZE_CAP = int(os.environ.get('SIZE_CAP', '0'))  # bytes; 0 = unlimited
SKIP_EXTRAS = os.environ.get('SKIP_EXTRAS') == '1'
MEDIA_EXT = ('.mp4', '.mov', '.avi', '.wmv', '.webm', '.mpg', '.mpeg', '.m4v', '.flv',
             '.mp3', '.wav', '.m4a', '.ogg', '.aac', '.wma')

logging.basicConfig(filename=LOG, level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger()
session = requests.Session(); session.headers.update(UA)
_last = [0.0]

class Skip(Exception): pass

def polite():
    dt = time.time() - _last[0]
    if dt < SLEEP: time.sleep(SLEEP - dt)
    _last[0] = time.time()

def fetch(url, stream=False, **kw):
    """GET with politeness and backoff. Raises Skip after exhausting backoff."""
    is_api = any(h in url for h in API_HOSTS)
    for attempt in range(len(BACKOFF) + 1):
        polite()
        try:
            r = session.get(url, timeout=120, stream=stream, allow_redirects=True, **kw)
        except requests.RequestException as e:
            log.warning(f'{url} -> {e}')
            if attempt < len(BACKOFF): time.sleep(BACKOFF[attempt]); continue
            raise Skip(f'network:{type(e).__name__}')
        if r.status_code == 200: return r
        if r.status_code == 404: raise Skip('404')
        if r.status_code in (429, 403) or r.status_code >= 500:
            if not is_api and r.status_code == 403: raise Skip('publisher_403')
            log.warning(f'{url} -> {r.status_code}, attempt {attempt}')
            if attempt < len(BACKOFF): time.sleep(BACKOFF[attempt]); continue
            raise Skip(f'http{r.status_code}_after_backoff')
        raise Skip(f'http{r.status_code}')

def save(r, path, must_pdf=True):
    tmp = path + '.part'
    with open(tmp, 'wb') as f:
        for chunk in r.iter_content(1 << 16): f.write(chunk)
    with open(tmp, 'rb') as f: head = f.read(5)
    if must_pdf and not head.startswith(b'%PDF'):
        os.remove(tmp); raise Skip('not_pdf')
    os.replace(tmp, path)
    return os.path.getsize(path)

def s3_keys(pmcid):
    r = fetch(f'{S3}?prefix={pmcid}.&max-keys=500')
    ns = {'s': 'http://s3.amazonaws.com/doc/2006-03-01/'}
    root = ET.fromstring(r.content)
    keys = [(c.find('s:Key', ns).text, int(c.find('s:Size', ns).text)) for c in root.findall('s:Contents', ns)]
    if not keys: return None, []
    vers = sorted({k.split('/')[0] for k, _ in keys}, key=lambda v: int(v.rsplit('.', 1)[1]))
    top = vers[-1]
    return top, [(k, s) for k, s in keys if k.startswith(top + '/')]

def existing_for(pmcid):
    for ext in ('.pdf', '.xml'):
        hits = glob.glob(os.path.join(CORPUS, f'*_{pmcid}{ext}'))
        hits = [h for h in hits if '_supp_' not in h and '_media_' not in h]
        if hits: return hits[0]
    return None

def valid_pdf(path):
    try:
        with open(path, 'rb') as f: return f.read(5).startswith(b'%PDF')
    except OSError: return False

def ok(msg): print(msg, flush=True); log.info(msg)

def process(row):
    pmcid, fn = row['pmcid'], row['filename']
    stem = fn[:-4]
    have = existing_for(pmcid)
    if have and have.endswith('.pdf') and valid_pdf(have):
        row['filename'] = os.path.basename(have); row['download_status'] = 'ok'; return 'present'
    if have and have.endswith('.pdf'):
        os.remove(have); log.warning(f'{have} invalid, removed'); have = None
    extras = []
    # --- 1. S3
    top, keys = None, []
    try:
        top, keys = s3_keys(pmcid)
    except Skip as e:
        log.warning(f'{pmcid} s3 list: {e}')
    pdf_done = False
    if top:
        main_pdf = f'{top}/{top}.pdf'
        if any(k == main_pdf for k, _ in keys):
            try:
                size = save(fetch(S3 + main_pdf, stream=True), os.path.join(CORPUS, fn))
                ok(f'OK  {fn}  ({size/1e6:.1f} MB) [s3]'); pdf_done = True
            except Skip as e:
                log.warning(f'{pmcid} s3 pdf: {e}')
        # extras: media + supplementary pdfs
        for k, size in ([] if SKIP_EXTRAS else keys):
            name = k.split('/', 1)[1]
            if name.startswith(top): continue
            low = name.lower()
            if low.endswith(MEDIA_EXT): tag, must = '_media_', False
            elif low.endswith('.pdf'): tag, must = '_supp_', True
            else: continue
            out = os.path.join(CORPUS, f'{stem}{tag}{name}')
            if os.path.exists(out): continue
            try:
                sz = save(fetch(S3 + k, stream=True), out, must_pdf=must)
                ok(f'OK  {os.path.basename(out)}  ({sz/1e6:.1f} MB) [s3 {tag.strip("_")}]')
                extras.append(os.path.basename(out))
            except Skip as e:
                log.warning(f'{pmcid} extra {name}: {e}')
    if pdf_done:
        row['download_status'] = 'ok'; return 'ok'
    # --- 2. Unpaywall
    reasons = ['s3:no_pdf' if top else 's3:not_in_bucket']
    if row.get('doi'):
        try:
            j = fetch(f'{UNPAYWALL}{row["doi"]}?email={EMAIL}').json()
            url = (j.get('best_oa_location') or {}).get('url_for_pdf')
            if not url:
                for loc in j.get('oa_locations', []):
                    if loc.get('url_for_pdf'): url = loc['url_for_pdf']; break
            if url:
                try:
                    size = save(fetch(url, stream=True, headers={'Accept': 'application/pdf,*/*'}), os.path.join(CORPUS, fn))
                    ok(f'OK  {fn}  ({size/1e6:.1f} MB) [unpaywall]')
                    row['download_status'] = 'ok'; return 'ok'
                except Skip as e:
                    reasons.append(f'unpaywall:{e}')
            else:
                reasons.append('unpaywall:no_pdf_url')
        except (Skip, ValueError) as e:
            reasons.append(f'unpaywall:{e}')
    else:
        reasons.append('no_doi')
    # --- 3. XML only
    xml_out = os.path.join(CORPUS, stem + '.xml')
    if have and have.endswith('.xml') and os.path.getsize(have) > 1000:
        row['filename'] = os.path.basename(have); row['download_status'] = 'xml_only'; return 'xml_only'
    if top and any(k == f'{top}/{top}.xml' for k, _ in keys):
        try:
            size = save(fetch(S3 + f'{top}/{top}.xml', stream=True), xml_out, must_pdf=False)
            ok(f'OK  {os.path.basename(xml_out)}  ({size/1e6:.2f} MB) [s3 xml]')
            row['filename'] = os.path.basename(xml_out); row['download_status'] = 'xml_only'; return 'xml_only'
        except Skip as e:
            reasons.append(f's3xml:{e}')
    try:
        r = fetch(f'{EPMC}{pmcid}/fullTextXML', stream=True)
        size = save(r, xml_out, must_pdf=False)
        if size < 1000 or b'<article' not in open(xml_out, 'rb').read(4000):
            os.remove(xml_out); raise Skip('not_jats')
        ok(f'OK  {os.path.basename(xml_out)}  ({size/1e6:.2f} MB) [europepmc xml]')
        row['filename'] = os.path.basename(xml_out); row['download_status'] = 'xml_only'; return 'xml_only'
    except Skip as e:
        reasons.append(f'epmc:{e}')
    row['download_status'] = 'failed:' + ';'.join(reasons)
    log.error(f'{pmcid} FAILED {row["download_status"]}')
    return 'failed'

def write_manifest(rows, fields):
    tmp = MANIFEST + '.tmp'
    with open(tmp, 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=fields); w.writeheader(); w.writerows(rows)
    os.replace(tmp, MANIFEST)

def write_readme(rows):
    from collections import Counter
    st = Counter(r['download_status'].split(':')[0] for r in rows)
    pdfs = sorted([p for p in glob.glob(os.path.join(CORPUS, '*')) if p.lower().endswith('.pdf')]); xmls = sorted(glob.glob(os.path.join(CORPUS, '*.xml')))
    media = [p for p in glob.glob(os.path.join(CORPUS, '*_media_*'))]
    supp = [p for p in pdfs if '_supp_' in p]; main = [p for p in pdfs if '_supp_' not in p]
    total = sum(os.path.getsize(p) for p in pdfs + xmls + media)
    L = ['# Epilepsy open-access corpus', '',
         'Open-access PubMed Central articles by Wendyl D\'Souza (St Vincent\'s Melbourne) and peers',
         '(Cook, O\'Brien, Kwan, Berkovic, Scheffer, Perucca, Karoly, Vajda), epilepsy/seizure topics,',
         'Melbourne/Monash/Australia affiliated. Built from NCBI E-utilities + PMC Article Datasets (AWS S3).', '',
         f'Manifest rows: {len(rows)}',
         f'Article PDFs: {len(main)}  |  supplementary PDFs: {len(supp)}  |  media files: {len(media)}  |  XML-only: {len(xmls)}',
         f'Status: ok={st.get("ok",0)} xml_only={st.get("xml_only",0)} failed={st.get("failed",0)} pending={st.get("",0)}',
         f'Total size: {total/1e9:.2f} GB', '',
         '## Rows by author_group (a paper counts once per group it belongs to)', '', '| group | rows | ok | xml_only | failed |', '|---|---|---|---|---|']
    groups = Counter(); gs = {}
    for r in rows:
        for g in r['author_group'].split(','):
            if not g: continue
            groups[g] += 1; gs.setdefault(g, Counter())[r['download_status'].split(':')[0]] += 1
    for g, n in groups.most_common():
        L.append(f'| {g} | {n} | {gs[g].get("ok",0)} | {gs[g].get("xml_only",0)} | {gs[g].get("failed",0)} |')
    L += ['', '## Rows by year', '', '| year | rows | ok | xml_only | failed |', '|---|---|---|---|---|']
    ys = {}
    for r in rows: ys.setdefault(r['year'], Counter())[r['download_status'].split(':')[0]] += 1
    for y in sorted(ys, reverse=True):
        c = ys[y]; L.append(f'| {y} | {sum(c.values())} | {c.get("ok",0)} | {c.get("xml_only",0)} | {c.get("failed",0)} |')
    fails = [r for r in rows if r['download_status'].startswith('failed')]
    L += ['', f'## Failures ({len(fails)})', '']
    for r in fails: L.append(f'- {r["pmcid"]} {r["title"][:90]} — {r["download_status"]}')
    xo = [r for r in rows if r['download_status'] == 'xml_only']
    L += ['', f'## XML-only ({len(xo)})', ''] + [f'- {r["pmcid"]} {r["title"][:90]}' for r in xo]
    with open(os.path.join(CORPUS, 'README.md'), 'w') as f: f.write('\n'.join(L) + '\n')

def corpus_size():
    return sum(os.path.getsize(p) for p in glob.glob(os.path.join(CORPUS, '*')) if os.path.isfile(p))

def main():
    with open(MANIFEST, newline='') as f:
        rd = csv.DictReader(f); fields = rd.fieldnames; rows = list(rd)
    order = sorted(range(len(rows)), key=lambda i: (0 if 'dsouza' in rows[i]['author_group'] else 1, i))
    done = 0
    for n, i in enumerate(order, 1):
        row = rows[i]
        if row['download_status'] in ('ok', 'xml_only') and existing_for(row['pmcid']):
            continue
        if SIZE_CAP and corpus_size() >= SIZE_CAP:
            log.info(f'SIZE CAP reached ({corpus_size()/1e9:.2f} GB); stopping'); print('SIZE CAP reached', flush=True); break
        try:
            res = process(row)
        except Exception as e:
            row['download_status'] = f'failed:exception:{type(e).__name__}:{str(e)[:80]}'
            log.exception(f'{row["pmcid"]} exception')
        write_manifest(rows, fields)
        if n % 10 == 0: write_readme(rows)
    write_manifest(rows, fields); write_readme(rows)
    from collections import Counter
    log.info('DONE ' + str(Counter(r['download_status'].split(':')[0] for r in rows)))
    print('DONE', flush=True)

if __name__ == '__main__':
    main()
