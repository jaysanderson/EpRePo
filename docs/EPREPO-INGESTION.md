# EpRePo - corpus ingestion strategy

> How the epilepsy corpus on disk becomes resources in the `research-portal-eprepo` knowledge
> box, with the metadata the portal needs, 80 at a time. Written 2026-09-03 after investigating
> the corpus, the platform call shapes in `docs/ARAG-DEV.md`, the provider code in
> `packages/retrieval`, and the FRDC loader that ran the 3,900-document load.

## 1. What is on disk

`~/epilepsy_corpus/` holds one flat directory, built by `fetch_corpus.py` from the PMC Article
Datasets bucket on AWS, plus `epilepsy_corpus_manifest.csv`. Every file name starts with the
manifest stem `YYYY_FirstAuthor_Title_words_PMC<id>` and the PMC id is the join key.

| kind | file pattern | count at time of writing | size |
|---|---|---|---|
| article PDF | `<stem>.pdf` | 551 | 1.2 GB |
| article text only (no PDF exists) | `<stem>.xml` (JATS) | 70 | 8 MB |
| supplementary PDF | `<stem>_supp_<original name>.pdf` | 274 | 0.5 GB |
| video | `<stem>_media_<original name>.mp4/.mov/.wmv` | 52 | 1.1 GB |

The manifest carries, per article: `filename, pmcid, pmid, doi, year, journal, title, authors,
author_group, download_status`. `author_group` is a comma-separated list of the target authors on
the paper (`dsouza,cook,obrien,...`). `download_status` is `ok`, `xml_only` or `failed:<reason>`;
only `ok` and `xml_only` rows have anything to upload.

Two facts shape the design. The PDFs are all born-digital publisher PDFs, so default extraction
is right for every one of them (no vision or OCR strategy, unlike the scanned FRDC reports). And
the manifest already has the bibliographic core; what it lacks is an abstract, keywords and a
licence, all of which Europe PMC returns in one batched call.

## 2. Resource model in the knowledge box

**One resource per file, grouped by PMC id.** The platform's two-step create-resource then
PUT-file path 500s on PDFs on this deployment (`docs/ARAG-DEV.md`), so every file goes through
the single-call `POST /kb/{id}/upload`, then a `PATCH /resource/{id}` writes the metadata. That
means a supplement cannot be a second file field on its article; it is its own resource that
points back at the article.

| kind | resource slug | `kind` label | body |
|---|---|---|---|
| article PDF | `PMC<id>` | `article` | the PDF via `/upload` |
| article text only | `PMC<id>` | `article` | JATS XML converted to Markdown, via `POST /resources` with a `texts.body` field (the platform does not read JATS; Markdown extracts cleanly and the title is written into the body because a title is not searchable text) |
| supplementary PDF | `PMC<id>-supp-<n>` | `supplement` | the PDF via `/upload` |
| video | `PMC<id>-media-<n>` | `media` | the file via `/upload`; the platform transcribes video |

The slug is the idempotency key: `GET /kb/{id}/slug/<slug>` answers whether a resource already
exists, so a re-run never double-uploads even if local state is lost.

Order of upload: articles first, D'Souza papers before the rest and newest first within that, then
text-only articles, then supplements, then videos last. Videos transcribe slowly and are the least
important to have early.

## 3. Metadata on every resource

Written by the PATCH straight after upload (and in the create body for text resources).

- **`title`** - the manifest title, never the filename. Merchandising rules say a raw filename in
  the library is a bug.
- **`origin`** - `url` = `https://pmc.ncbi.nlm.nih.gov/articles/PMC<id>/` (citations resolve to
  the real article), `source_id` = `pmc-oa`, `created` = publication date, `filename` = the
  on-disk name, `collaborators` = the author list, `tags` = the author groups, journal, year and
  licence code.
- **`extra.metadata`** - the portal's `PortalMetadata` shape plus the bibliographic record:
  `summary` (abstract), `keyFacts` (author keywords, then MeSH headings, up to five), `topic`
  (initial topic id, see below), `type` (`article` | `supplement` | `video`), `published`, and
  `authors`, `journal`, `year`, `doi`, `pmid`, `pmcid`, `license`, `authorGroup`, and for
  supplements and media `parentPmcid` and `parentTitle`. The library and resource pages read
  `summary`, `keyFacts` and `published` from here before any enrichment has run, so nothing
  appears bare.
- **`usermetadata.classifications`** - one `topic` label and one `kind` label. The `topic`
  labelset already exists on the box (pushed by `deno task provision -- eprepo`); the loader
  pushes a `kind` labelset (`article`, `supplement`, `media`) before the first batch.

**Where the abstract, keywords and licence come from.** Europe PMC's REST search with
`resultType=core` accepts forty PMC ids per query and returns `abstractText`, `keywordList`,
`meshHeadingList` and `license`. On a forty-row sample 37 had abstracts, 28 keywords, 24 MeSH
headings and all 38 a licence. The loader fetches these once, caches them to
`~/epilepsy_corpus/metadata_cache.json`, and treats a missing abstract as an empty summary rather
than a failure.

**Initial topic assignment.** A keyword rule table maps title, keywords and MeSH headings onto the
ten topic ids in `apps/api/src/tenants.ts` (for example `pregnan|teratogen|malformation` to
`pregnancy-teratogenicity`, `forecast|cycle|wearable` to `seizure-forecasting-cycles`). Rows that
match nothing get `epidemiology-outcomes`. This is a first pass so Explore is not empty on day
one; the platform's `labeler` task (run sequentially, one at a time) and the Manage corpus
analysis refine it afterwards.

**Search isolation.** Following the repo rule that isolation lives in named search
configurations, the `portal-search` and `portal-ask` configurations should include `kind:article`
and, initially, exclude `supplement` and `media` so answers are grounded in the papers. Supplements
and videos stay browsable in the library and can be switched into the configurations later.

## 4. Batching: 80 up, wait, 80 more

The loader works in fixed batches of 80 files and does not start the next batch until every
resource in the current one has reached a terminal state.

1. Take the next 80 pending files in the order above.
2. Upload each one (single-threaded, 1 s between uploads; 429 or 5xx backs off 30, 60, 120 s then
   marks the file for retry). Record the returned uuid immediately in the state file.
3. PATCH the metadata onto each uuid.
4. Poll `GET /resource/{uuid}?show=basic` for every uuid in the batch every 20 s until each one
   reports `metadata.status` of `PROCESSED` or `ERROR`. A batch has a ceiling of 45 minutes; a
   resource still pending at the ceiling is marked `stuck`, the batch is closed, and stuck
   resources are re-polled at the start of every later batch and reported by `status`.
5. Write the batch summary to the log and start the next batch.

The FRDC load measured platform indexing saturating at about 120 documents in flight. Eighty is
inside that, so the live portal stays responsive while the load runs.

Expected volume is roughly 950 resources, or twelve batches. Digital PDFs process in a few minutes
each, so the article batches should take ten to twenty minutes; the single video batch will take
longer because of transcription.

## 5. Resumability and state

- `~/epilepsy_corpus/.upload_state.json` - per file: kind, slug, uuid, status
  (`pending | uploaded | processed | error | stuck | skipped`), batch number, attempts, last error.
  Written after every upload and every poll.
- On start the loader reconciles against the box: for every file it asks `GET /slug/<slug>` and
  adopts any resource that already exists, so a crash, a Ctrl-C or a lost state file never causes
  a duplicate.
- `upload.log` - one line per event with timestamps; the `run` command prints only batch starts,
  batch completions and failures to the terminal.
- Errors: a resource that ends `ERROR` is retried once in a later batch; a second failure is
  recorded with the platform's message and left for a human.

## 6. Command line

A Python 3 script, standard library plus `requests`, kept beside the corpus at
`~/epilepsy_corpus/upload_corpus.py` (the same shape as the FRDC loader, and outside the repo
because it is corpus-side tooling that would otherwise have to pass the Deno gate).

```sh
python3 upload_corpus.py run [--batch 80] [--kinds article,xml,supp,media] [--limit N] [--dry-run]
python3 upload_corpus.py status            # counts by kind and status, current batch, throughput, ETA
python3 upload_corpus.py watch             # status, refreshed every 30 s, until the load completes
python3 upload_corpus.py reconcile         # sync state from the live box without uploading
python3 upload_corpus.py retry-errors      # re-queue resources that ended in ERROR
```

Credentials are read from `~/Claude/EpRePo/.env` (`ARAG_ZONE`, `ARAG_KB_EPREPO`,
`ARAG_KB_EPREPO_TOKEN`), so nothing is pasted on the command line and no token is stored beside
the corpus. Regional base URL follows `regionalBase(zone)` in the retrieval package.

`status` prints a table of pending, uploaded, processed, error and stuck counts per kind, the
current batch and how many of its 80 are processed, resources per hour over the last hour, an ETA
for the remaining batches, and the box's own `/counters` (resources, paragraphs, fields) so the
local view and the platform agree. `watch` redraws it every 30 s and exits on `LOAD COMPLETE`.

## 7. After the load

In this order, all through the existing admin surface or API with the admin passcode:

1. **Enrichment** - `POST /api/admin/t/eprepo/enrichments/run` with `{scope:'missing', limit:100}`
   in a loop until `enriched` comes back under 100. This is what gives every card its hook,
   summary and key takeaways.
2. **Corpus analysis** - `POST /api/admin/t/eprepo/analyse` to redesign the topic taxonomy,
   suggested questions and search placeholder from the real corpus; review the proposal in Manage
   before applying, then push the revised labelset and run the labeler task.
3. **Knowledge graph** - `kg/propose` then `kg/implement` for the entity and relation types
   (genes, conditions, medications, researchers, institutions, methods).
4. **Search configurations** - `search-configs/ensure`, then confirm the `kind` filters above.
5. **Corpus health** - `GET /api/admin/t/eprepo/corpus-health` for thin extractions; expect none
   given born-digital PDFs.
6. **Acceptance sweep** - the six suggested questions, the library filters, a citation opening the
   PDF at the passage, and the graph, in both themes and at 390px.
