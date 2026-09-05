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
- **Extraction Lab** - `docs/EXTRACTION-LAB.md`. Profile a document, compare the default, table-aware and
  visual extraction methods in a sandbox box with a judge's score and a before/after ask, and set routing
  rules per document class. Manage > Extraction, linked from Tools.

## The Agentic page (decision, 2026-09-04)

`/t/eprepo/agentic` stays a redirect to Ask. The separate agentic surface it once was (its own
answer rendering, evidence table and pipeline visualisation) was folded into Ask, and the
persona sweep (P9-19) found that the "Show the pipeline" disclosure under an answer is
administrator-only, so a non-administrator had no multi-step view beyond the Deep research
toggle. The decision is to keep it that way rather than expose the developer-facing pipeline
(token counts, stage timings, raw retrieval) to every reader:

- **The public multi-step view is the Deep research sub-question list.** With Deep research on,
  Ask maps the question into focused sub-questions, researches each, and answers with
  full-document grounding; the sub-questions are listed above the answer so the reader sees how
  the question was broken down and which parts the corpus covered. That is the honest
  "agentic" disclosure for a clinician-researcher: the plan, not the plumbing.
- **The pipeline disclosure stays behind `isAdmin`** as a developer and demo tool (the solution
  architecture reveal in the ARAG factory's demo standard).
- The route is not linked from navigation; it exists so old links and bookmarks resolve. The
  Help page for Ask says so, and names the sub-question list as the multi-step view.

## Deployment

The portal runs on Fly.io as the app `eprepo-portal` (Sydney, `fly.toml`), separate from
corpuskit's Cloudflare pipeline. From this checkout:

```sh
fly deploy --remote-only --app eprepo-portal
```

- Secrets (`ARAG_*`, `ARAG_KB_EPREPO*`, `ARAG_KB_EPREPO_LAB*`, `ADMIN_PASSCODE`) are set with
  `fly secrets import` from `.env`; never commit them.
- App state lives on the `rp_data` volume at `/app/data`: tenant overrides from corpus analysis,
  the enrichment cache, knowledge-graph proposals and the routing log. It was seeded once from the
  developer machine's `data/` directory (`fly ssh sftp shell`, then `tar xzf` on the machine).
  Re-seeding is only needed if the volume is recreated.
- After a fresh box or a change to the intents, converge the stored search configurations:
  `POST /api/admin/t/eprepo/search-configs/ensure` with the admin passcode.
- The image carries poppler for the Extraction Lab profiler and the run permission it needs.

## Viewer dark mode

The portal has a viewer-side light/dark toggle (the sun/moon button in the header; "Dark mode"
in the phone menu). It defaults to the operating system's `prefers-color-scheme` and, once
toggled, is persisted per browser in `localStorage` (`rp-scheme`). Dark is a token swap, not a
second stylesheet: `apps/web/src/lib/theme.ts` maps a light-suite portal onto the house dark
grey suite, the dark-polarity status colours and an opaque glass, and lightens the brand and
accent inks until they clear WCAG AA on the dark surface (`ensureContrast`). A portal already
on a dark library palette (Observatory) is left exactly as authored. Every page must be checked
in both schemes before it is called done - see `apps/web/CLAUDE.md`.

## The answer trust layer and the test-fix loops

Every Ask answer on this portal passes through the trust layer described in
`docs/TRUST-LAYER.md`: routed by rule or classifier (`docs/INTENT-ROUTING.md`), probed before
generation, pinned to the papers the question names, then re-bound sentence by sentence,
audited figure by figure against the cited texts, gated (an unverifiable sentence is removed
and the removal stated; a substitute stands in only for the same figure at the same time point;
a decline is never replaced) and labelled with a confidence the check leads. The layer was
built across the four D'Souza test-fix loops (scores 4, 6, 7, 6; `docs/EPREPO-ROADMAP.md`
delivery status, `docs/persona-reports/dsouza-loop1.md` to `loop4.md`); each merged pull request
has an entry in `docs/CHANGELOG-EPREPO.md`, and `docs/CORPUSKIT-CHANGES.md` records every change
this fork made to the corpuskit codebase and whether it belongs upstream.

Decision (loop 4, 5 September 2026): **simple and honest over clever.** When the layer cannot
verify a sentence it removes it and says so rather than substituting; structured-statement
generation through `answer_json_schema` was trialled on twelve questions and not adopted (it
fabricated a cohort figure the prose path declined and cannot carry paragraph citations).

## Facet counts, sorting and example copy

- `GET /api/t/:slug/facets` serves `topic`, `kind` and `format` together from one memoised
  aggregation (30 s per tenant), plus `untagged.topic` - the real count of resources carrying no
  topic, from the index. Search, Library and Taxonomy all read this one call, so their counts
  agree. The documented `labelsets=` name and the short `ls=` both work.
- `GET /api/t/:slug/catalog` accepts `sort=published` (the Library default, newest first; the
  platform's own sort is created/modified/title only, so this runs over the cached listing) and
  the facet names `topicIds`/`kindIds`/`formatIds` beside the short forms. Labels within one
  facet are ORed and facets ANDed via a single `filter_expression`.
- Example copy (the investigation-name placeholder and the Generate placeholders) is derived
  from the tenant's own `suggestedQuestions` and `topics`, and can be overridden per tenant
  under `copy` in the tenant configuration (`packages/core` `TenantConfigSchema.copy`); the
  self-assessment heading is the top-level `assessmentHeading`.
