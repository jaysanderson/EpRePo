# EpRePo corpus tools

The two scripts that built and loaded the EpRePo corpus (docs/EPREPO-INGESTION.md). They are Python
3, standard library plus `requests`, and run beside the corpus in `~/epilepsy_corpus`; this copy is
the checked-in reference.

- `fetch_corpus.py` - builds `~/epilepsy_corpus` from the PMC Article Datasets bucket on AWS
  (article PDFs, JATS XML, supplements, media) from a manifest, with Unpaywall and Europe PMC
  fallbacks, 1.5 s between requests, resumable.
- `upload_corpus.py` - loads the corpus into the portal's knowledge box 80 resources at a time,
  waiting for each batch to process, with the metadata the portal reads (curated title, abstract,
  keywords, authors, journal, DOI, topic and format labels). Credentials are read from this repo's
  `.env`. Commands: `run`, `status`, `watch`, `reconcile`, `retry-errors`, `repatch`.
