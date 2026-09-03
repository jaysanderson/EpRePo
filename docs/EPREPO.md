# EpRePo - the epilepsy research portal

> The five CLAUDE.md decisions for the third seeded portal, set on 2026-09-03.

## 1. Domain / corpus
Open-access epilepsy research from Melbourne clinical neuroscience: PubMed Central articles by
Wendyl D'Souza (St Vincent's Hospital Melbourne) and peers - Mark Cook, Terence O'Brien, Patrick
Kwan, Samuel Berkovic, Ingrid Scheffer, Piero Perucca, Philippa Karoly and Frank Vajda - on
epilepsy and seizure topics with a Melbourne, Monash or Australian affiliation.

The corpus is built outside this repo by `~/epilepsy_corpus/fetch_corpus.py` from the PMC
Article Datasets bucket on AWS (the PMC OA web service was retired on 25 August 2026). At the
time of writing it holds about 550 article PDFs, 270 supplementary PDFs, 50 videos and 40
JATS XML files, with a manifest (`epilepsy_corpus_manifest.csv`) carrying PMCID, PMID, DOI,
year, journal, title, authors and author group for every item.

## 2. Primary user and their job
A clinician-researcher or research fellow in an epilepsy unit who arrives with a clinical or
research question - a drug in pregnancy, a seizure-cycle claim, a gene - and needs a fast, cited
answer they can take into a clinic meeting, then the underlying papers and the people behind
them.

## 3. Hero experience
Ask a question across a decade of a group's output and watch the cited answer build, then jump
from a citation to the exact passage of the open-access PDF. The knowledge graph across genes,
conditions, medications, researchers and institutions is the discovery surface.

## 4. Stack
Unchanged from CorpusKit: Deno + Hono API, React SPA, retrieval behind `RetrievalProvider`.

## 5. Corpus for building against
The real corpus above. No synthetic seed content: `content/seed/` carries nothing for this
tenant, so `deno task provision -- eprepo` creates the knowledge box, mints its token and pushes
the topic labelset, and stops there. Ingestion of the PDFs happens through the Manage surface
(corpus upload) once the download is complete.

## Tenant configuration
`apps/api/src/tenants.ts` seeds the `eprepo` tenant:

- **Branding** - "EpRePo Research Portal", deep violet identity (lavender is the international
  epilepsy awareness colour), house typefaces, no logo yet.
- **Topics** - ten ids that the provisioning script pushes as the `topic` labelset. Explore
  intersects them with the knowledge box facet counts, so the list and the labelset must stay in
  step. Corpus analysis in Manage may rewrite them once the corpus is loaded.
- **Entity types** - condition or syndrome, gene or variant, medication or treatment, researcher,
  institution, method or device.
- **Relation types** - studies, treats, associated-with, causes, conducted-at, collaborates-with.
- **No footer** - `PortalFooter` renders nothing for a portal without its own organisation links,
  which is the right default until there is a real organisation page to link to.

## Knowledge box
Created by `deno task provision -- eprepo` on 2026-09-03 under the account in
`docs/ARAG-DEV.md`, slug `research-portal-eprepo`. The id and service-account token live in
`.env` as `ARAG_KB_EPREPO` and `ARAG_KB_EPREPO_TOKEN`. It is empty until the corpus is ingested.

## Local development note
`registry.npmjs.org` is unreachable from the development machine. Deno resolves the one
npm-hosted dependency (the MCP server SDK) through the Harness proxy instead:

```sh
export NPM_CONFIG_REGISTRY=https://pkg.harness.io/pkg/ct8onj8YTdaXtKaFsYCRLg/org-marklogic-npm/npm
```

That proxy blocks zod 4.5.x by policy, so `deno.json` and `deno.lock` pin `zod/v4` to 4.4.0
for this fork.

## Demos built on this portal

- **Intent-routed search configurations** - `docs/INTENT-ROUTING.md`. One ask box, six intents, one stored
  configuration per intent on the same box; the route chip, override and compare mode are on the Ask page.
- **Extraction Lab** - `docs/EXTRACTION-LAB.md` (design; build in progress).
