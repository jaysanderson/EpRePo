# Changes this fork made to the corpuskit codebase

Status: **current, 5 September 2026.** Measured against the upstream base `main` (`27ff3cd`,
"Fix homepage deployment gate"): `git diff --stat main...feat/eprepo-portal` is 200 files,
37,694 insertions and 1,022 deletions; 46 new non-test TypeScript modules and 56 modified. This
is the record of every code change, by area, with why it was made and whether it belongs
upstream. Sources: the code and its diffs, the merged pull requests #3 to #17
(`docs/CHANGELOG-EPREPO.md`), `docs/EPREPO-ROADMAP.md` (R-items and P-findings) and the
D'Souza loop reports (D-findings). Where no source explains a change, the row says so and
describes what the diff shows.

**Reading the "Upstream or EpRePo" column.** `Upstream` is a generic corpuskit improvement that
would show up identically on the FRDC or GRDC portal or any other knowledge box, and belongs in
the upstream product. `EpRePo` is tenant configuration, the epilepsy corpus loader, the epilepsy
lexicon, persona material or deployment specific to this fork. `Mixed` says which parts are
which.

**The short version.** Almost everything under `apps/api/src` and `packages/` is upstream
product: the intent router, the answer trust layer (`docs/TRUST-LAYER.md`), the Library and
facet fixes, the study-design classifier, the Help ingestion and health probe, the Extraction
Lab. The EpRePo-specific parts are the `eprepo` block of `apps/api/src/tenants.ts` (intents,
rules, lexicon, topics, branding), the corpus tools under `tools/epilepsy-corpus/`, the brand
assets, `fly.toml`, the zod pin forced by the development machine's registry, and the persona
documents. A few upstream modules carry epilepsy-tuned lists (gene-symbol shapes, journal names,
drug suffixes) that should become tenant configuration when they go upstream; those rows say so.

## Contents

1. [apps/api](#1-appsapi) - new modules, modified modules, the stored search configurations
2. [apps/web](#2-appsweb) - new modules, modified modules, e2e
3. [packages/core](#3-packagescore) - modules and every schema addition
4. [packages/retrieval](#4-packagesretrieval) - modules, the provider interface additions, the ARAG ask path
5. [tools](#5-tools)
6. [docs](#6-docs)
7. [deploy and dependencies](#7-deploy-and-dependencies) - Dockerfile, fly.toml, deno.json, the pins
8. [Header doc comments](#8-header-doc-comments)

## 1. apps/api

### 1a. New modules (`apps/api/src`)

| Path | What it does | Why (decision, finding, roadmap item, PR) | Upstream or EpRePo | Tests |
|---|---|---|---|---|
| `answer-audit.ts` | Deterministic post-answer grounding audit: every figure in the answer must appear in a cited passage beside the claim's own terms (its outcome, follow-up, cohort); years are checked against source metadata; a drug called "contraindicated" is stripped unless a cited passage says so. Across four loops the matcher itself was hardened: number words ("Thirteen"), PDF line-break hyphens, table "N (P)" cells, abbreviated time units, clock times excluded, thousands separators, PDF glyphs, and a claim window that reaches back three sentences and needs the right outcome and follow-up. | R3 (P1-01, P3-01, P3-03, P9-01, P8-04, P10-01, P10-08, P5-01, P5-02, P6-02, P4-03, P7-05 to P7-07, P1-03, P1-04, P1-08, P5-07, P9-08, P3-20, P10-12, P8-10, P9-06); D1-12, D1-13, D1-14; D2-01, D2-04, D2-07, D2-09, D2-13; D3-08, D3-09, D3-13, D3-15, D3-20; D4-01, D4-02, D4-10, D4-11, D4-13, D4-18, D4-19. PRs #6, #8, #12, #14, #17. | Upstream | `answer-audit.test.ts` (32), `figure-normalisation.test.ts` (13 cases over 50 figure and passage rows from loops 1 to 4), `app.test.ts` |
| `answer-gate.ts` | Turns the audit's findings into an action on the text, not a footnote: removes a sentence whose figure cannot be verified and states why; re-binds or removes an unmarked figure sentence; leads with a "Study design" line for an unlabelled modelling or preclinical source; states an effect size (HR, OR, RR with CI) when the passage carries one and the answer stated none; withholds an answer the gate emptied. | D2-02, D2-03, D2-09, D2-11, D2-12 (D1-15). PR #12; extended in #14 (briefing statement audit) and #17 (cohort-proving gate, retry before decline). | Upstream | `answer-gate.test.ts` (15), `app.test.ts` |
| `answer-shape.ts` | Shape checks needing no model: strips a model-authored "References:" list appended after the answer; `SentinelStream` rewrites guardrail sentinels ("the context does not provide", "Not enough data to answer this") on the stream and `rewriteSentinels` on the text, and renders `(inference)` as a hedge; `trimTruncatedTail` cuts a truncated generation back to its last complete sentence (`done.truncated`); the shared decline copy (`corpusDecline`, `documentDecline`, `withheldDecline`, `pairDecline`). | R19 (P3-12, P2-05, P8-08, P9-02, P9-17, P10-11, P6-11, P3-10); D1-04, D1-24; D3-05 (release at the stop), D4-06 (table rows). PRs #6, #8, #10 (newline-boundary note), #12, #13, #16. | Upstream | `answer-shape.test.ts` (32), `app.test.ts` |
| `ask-author.ts` | Author-aware answering: scopes retrieval to an author the catalogue's author index recognises, rewrites or removes an "X and colleagues" attribution over a paper X did not write (never guesses), builds the topic-only scoped query, and lists any on-topic authored source the generator omitted on a "which of X's papers" question. | D1-05, D2-23, D3-04, D3-11. PRs #8, #11, #13. | Upstream | `ask-author.test.ts` (12), `app.test.ts` |
| `ask-entities.ts` | Per-entity grounding for a multi-entity question ("perampanel versus brivaracetam"): runs the routed configuration once per named entity so each drug or study grounds on its own top paper and pins it even if the merged ranking omitted it; question clauses for a pinned paper; `rankClosest`, which orders a decline's nearest matches by overlap with the question's outcome noun rather than raw semantic score. | D2-03, D2-05, D2-08; D3-19, D4-23. PRs #11, #13, #16, #17. | Upstream | `ask-entities.test.ts` (17), `app.test.ts` |
| `ask-grounding.ts` | The ask handler's grounding module: fetches and caches the cited texts, strips reference passages, assembles document-chat `extra_context` and the publication-years context, and `bindAndAudit` is the one call that turns the provider's paragraph-bound answer into the sentence-bound, gated, audited final answer (composing citation-binding, answer-audit, figure-rescue, secondhand, answer-gate, evidence-passages and ask-author). `docs/TRUST-LAYER.md` section 1, steps 8 to 11. | R2 to R5 (PR #6); D2-01 to D2-04 (PR #12); D3-01, D3-02, D3-07, D3-10 (PR #14); D4-01 to D4-05, D4-12, D4-15 (PR #17). | Upstream | `ask-grounding.test.ts` (9), `app.test.ts` |
| `ask-prequeries.ts` | Decides which of an intent's mandatory prequeries fit a question: the clinical intent's safety prequery fired on any entity found (antigens, journal names) and on retention questions; now gated to medication entities (suffix-typed) on a treatment-decision question. | R5 (P1-02, P3-13, P6-10, P9-14, P9-15, P8-09, P7-31). PR #6. | Mixed: the gating is generic; `isMedicationTerm` leans on drug-name suffixes and the tenant lexicon | `ask-prequeries.test.ts` (7) |
| `ask-retry.ts` | Caps a refusal at one extra platform ask (was up to four), choosing the general configuration, the named paper alone, no prequeries, or the follow-up without its prior pins, by the reason the first pass failed; the provider's own firmer-prompt retry is switched off for research asks so the two never stack. | D3-05, D1-09. PR #13; `unpinned` in PR #16 (D4-07). | Upstream | `ask-retry.test.ts` (7), `app.test.ts` |
| `ask-session.ts` | What a follow-up carries forward: the earlier turns' cited papers (pinned with a lighter pass), their cited passages as context, the earlier questions as prequeries for a reformatting turn ("put the three drugs in a table"), and the detection of a turn that leans on the earlier turns ("that cohort"). | D4-06, D4-07, D3-06. PR #16. | Upstream | `ask-session.test.ts` (8), `app.test.ts` |
| `ask-stream-verify.ts` | Verifies the first complete streamed sentence against the pre-flight probe's already-fetched paper texts the moment it lands, before the platform's citations arrive, and emits a `verified` event so the reader sees "First sentence verified against ..." while the answer streams. | D4-08, D3-05, D1-09. PR #16. | Upstream | `ask-stream-verify.test.ts` (8), `app.test.ts` |
| `briefing-audit.ts` | Runs the Ask figure, population and outcome audit over a generated briefing's sections and key takeaways; a statement whose figure sits in the source for a different outcome or a narrower population fails its sentence; the briefing shows "N figures checked" with what was removed. | D3-03. PR #14 (with `generate-schemas.ts`). | Upstream | `briefing-audit.test.ts` (5) |
| `briefing-grounding.ts` | Builds a briefing's grounding set: one retrieval per named drug or study plus one for the topic, each paper's Abstract, Results, Methods and Conclusion paragraphs (never Introduction or Discussion) plus its DA summary and key takeaways as `extra_context` with `resource_filters`, so a briefing states the papers' own hazard ratios rather than a generic meta-analysis figure. | D2-06, D1-10. PR #11. | Upstream | `briefing-grounding.test.ts` (5) |
| `catalog-lookup.ts` | Exact catalogue lookups before any retrieval: a DOI, PMCID or PMID resolved to one resource or an honest no-match; an author surname or "Surname YYYY topic" against the `authors` field; `resolvePersonName` folds name variants ("Wendyl D'Souza", "W D'Souza", "DSouza") into one author and makes a wrong-initial name an empty lookup; retypes graph nodes matching a catalogue author to Researcher. | R7 (P2-11, P4-07, P9-09, P6-16, P6-17, P7-12, P8-13, P8-19, P10-14, P10-23, P9-10, P3-18, P1-12); D1-25; D3-04; D4-16. PRs #3, #9, #13, #16. | Upstream | `catalog-lookup.test.ts` (14), `app.test.ts` (identifier and author search) |
| `citation-binding.ts` | Re-derives sentence-level citation binding from the platform's paragraph-level markers: a sentence keeps only markers whose cited text carries its content words, figures and named entities (and a rare word, a name the question uses, a design it states), markers never sit on headings, citations are renumbered by first appearance, sources under the display floor are dropped unless pinned; list items inherit the nearest marked line; a table row's markers sit inside its last cell. | R2 (P2-02, P2-03, P2-04, P7-02 to P7-04, P5-05, P6-06, P6-09, P9-07, P10-03, P10-09, P10-10, P8-07, P1-09, P1-10, P1-18, P3-07, P3-21, P4-05, P4-16, P5-13, P6-19); D1-16; D2-01, D2-04, D2-13; D3-09; D4-06, D4-07, D4-20. PRs #6, #8, #12, #14, #16, #17. | Upstream | `citation-binding.test.ts` (26), `app.test.ts` |
| `docs-answer.ts` | The Help assistant's voice: replaces the platform's guardrail sentences and "the (provided) context" with "the documentation" on the stream and the finished text, turns a template-only answer into the Help decline, and splits a two-part Help question so each part is searched as its own documentation-only prequery and answered or bounded. | D2-18 (D1-26 residual); D4-17. PRs #10, #16. | Upstream | `docs-answer.test.ts` (8) |
| `docs-health.ts` | Probes each portal's documentation-scoped search at boot and after every ingest, reports the count on `/api/health` as `docs` and `docsOk`, and logs loudly on zero: a box provisioned without the docs ingestion answers 200 everywhere while Help silently returns nothing. | R20 (P7-08, P8-12, P7-31). PR #4. | Upstream (mechanism); the probe phrase is the documentation's own | `docs-health.test.ts` (4) |
| `evidence-passages.ts` | Chooses, per cited resource, the extracted paragraph an evidence card quotes: the passage carrying the figures and words the answer's sentences bound to it, from retrieval's own paragraphs (which carry a page) first and the extracted text as fallback, rather than the platform's best-scoring paragraph (often a masthead or funding statement). | D1-08. PR #8; reused by `briefing-grounding.ts` (PR #11). | Upstream | `evidence-passages.test.ts` (6) |
| `extraction.ts` | Extraction Lab logic: profiles a document (table density, image-only, garbled, long scan), runs it through custom extraction methods in a sandbox knowledge box, measures yield against the default, and recommends a method (profile class first; the judge overrides only past a two-point margin). | R26 (P4-10). PR #4; the Lab itself predates PR #3 (`docs/EXTRACTION-LAB.md`). | Upstream | `extraction.test.ts` (9) |
| `figure-rescue.ts` | The gate's second look: before withholding a figure sentence, looks its figures up first-hand in the full text of every retrieved resource, the papers earlier turns cited and the DA summary and key takeaways, lending a citation the platform never made; the cohort guard helpers (a designated cohort is exactly its pinned papers), the quotation and replacement cues (same figure, same time point, beside the claim), and the "paper's own finding" quote. | D3-01, D3-02, D3-07, D3-10; D4-01 to D4-05, D4-09, D4-12, D4-14, D4-15, D4-18. PRs #14, #17. | Upstream | `figure-rescue.test.ts` (18), `figure-normalisation.test.ts`, `loop4-guards.test.ts` (17) |
| `generate-sources.ts` | Resolves a model-claimed source (a briefing section's title, an assessment question's quote) to a resource retrieved for the request; an unmatched attribution is dropped, never shown; builds a briefing's numbered reference list from the resource record; strips the model's own "(Journal, 2024)" labels. | R22 (P6-07), R21 (P8-05, P8-11); D1-10. PRs #4, #9, #11, #14. | Upstream | `generate-sources.test.ts` (21), `generate.test.ts` |
| `intent-router.ts` | Stage 0 and stage 1 of routing: identifier and author-year detection, the deterministic rules in order (lookup on gene-symbol or lexicon shapes, data, latest, clinical with a lexicon entity, review, results, author-papers, terse-results), the classifier threshold and the `RouteDecision` shape both stages share; `RESULTS_QUESTION_RULE` is exported for the tenant's rule list. | R7 (P2-11, P4-07, P9-09, P6-16, P6-17, P7-12, P8-13, P8-19, P10-14, P10-23); D1-01 to D1-03; D3-11; D4-08. PRs #3, #7, #13, #16; the router itself predates PR #3 (`docs/INTENT-ROUTING.md`). | Mixed: the rules engine is generic; the gene-symbol shapes and the epilepsy gene allow-list are domain lists that should become tenant configuration upstream | `intent-router.test.ts` (24), `app.test.ts`, provider `intents.test.ts` |
| `inventory-sample.ts` | Builds a character-budget-capped, even-stride sample of the corpus inventory for the design-time platform calls (taxonomy analysis, knowledge-graph strategy) whose prompt is capped at 20,000 characters and 422s (`string_too_long`) when the whole catalogue is listed. Used by `analyse.ts` and `kg.ts` only. | Not in any PR description; inferred from the diff and its header comment (commits before PR #3, after the 981-resource box was loaded). | Upstream | `inventory-sample.test.ts` (3) |
| `secondhand.ts` | Section-aware reading of an extracted paper: places a paragraph in its heading section (Abstract, Introduction, Methods, Results, Discussion, References) so a stated figure can be checked as the paper's own result versus literature it cites; a figure that occurs only in the Introduction or Discussion, or that the paper's own sentence attributes to earlier work, is second-hand; tables, legends and bare-statistic rows are first-hand. | D2-06, D2-14; D3-08; D4-18. PRs #11, #14, #17. | Upstream | `secondhand.test.ts` (12) |
| `study-guard.ts` | Recognises when a question names a study (an upper-case acronym titling at most three articles, an eponym or lexicon term titling a few, a quoted title, a cohort the question describes matched on titles and summaries) and returns the catalogue resources to pin with their own `resource_filters` prequery; a token titling a dozen papers is a topic, a gene is a gene. | Loop 1 section 5 (D1-01, D1-02); D2-05; D3-01; D4-01, D4-22. PRs #7, #11, #14, #17. | Upstream (mechanism; the worked examples are this corpus's trials) | `study-guard.test.ts` (11), `app.test.ts` |
| `synthesis-check.ts` | Deterministic checks on an investigation's synthesis: every numbered reference is either cited or listed as "Not used in this synthesis"; passage denominators (n = x, a/b) are extracted so the prompt states them rather than calling a rate a denominator. | D2-16 (the prompt side of R23 landed in PR #6's base branch). PR #11. | Upstream | `synthesis-check.test.ts` (2) |

### 1b. Modified modules (`apps/api/src`)

| Path | What changed | Why | Upstream or EpRePo | Tests |
|---|---|---|---|---|
| `analyse.ts` | The corpus-design prompt asks for a one-sentence `description` per topic and kind (it becomes the classifier agent's per-label prompt instead of an empty string); the inventory sample is built by the shared, budget-capped `sampleInventory`. | Not in the PR descriptions (commits before PR #3); inferred from the diff: better label prompts and a bounded sampler after a 422 `string_too_long` on the 981-resource box. | Upstream | none directly; `inventory-sample.test.ts` |
| `app.ts` | The largest change (32 commits across PRs #3 to #17). By route: `/api/health` reports `docs`, `docsOk` and the build stamp (R20, D1-21); `/route` runs the rule stage synchronously with a classifier cache shared with `/ask` (R7); `/search` resolves DOI, PMCID, PMID and author names against catalogue metadata before retrieval, runs the rule stage itself and returns `route`, an author lookup returns metadata matches only, honours `sort=published` (R7, R16, R4, D1-07, D3-04, D4-16); `/catalog` accepts `formatIds`, `kindIds`, `topicIds` and serves kind filters off the cached listing (R16, R12, D1-06); `/facets` serves one memoised aggregation with an honest `untagged.topic` (R12); `/entity` scopes relations, 404s on an unknown entity, retypes authors as researchers (R14, D1-25); `/suggest` is query-aware (R14); `/docs/ask` applies the Help voice and two-part questions (R20, D2-18, D4-17); `/docs/ingest` and `/search-configs/ensure` (admin) seed the Help pages and converge the stored configurations (R20); `/generate` builds briefings with per-section sources, grounding and audit (R22, D2-06, D3-03); `/investigations/:id/synthesise` carries verdicts, tags and notes and lists excluded and unused passages (R23, D2-16); `/ask` is the trust layer end to end (`docs/TRUST-LAYER.md`): auto-routing with the classifier in parallel with the probe, the grounding gate before generation, pins, prequeries, the one retry, stream shaping, the first verified sentence, `bindAndAudit`, the withheld decline, session context, document chat. Plus admin routes for the Extraction Lab, precomputed questions, crawl, reingest, corpus health and knowledge-graph proposals. | R1 to R27 and D1-01 to D4-23, PRs #3 to #17. | Mixed: the routes are upstream product; the eprepo stored configurations, lexicon and study-guard examples wired through them are EpRePo | `app.test.ts` (87 cases; six describe blocks for `/ask`, plus `/search`, `/suggest`, `/entity`, `/catalog`, `/facets`, `/health`, `/docs`) and the module tests above. No route-level test for `/route` or `/synthesise` in `app.test.ts` (covered by `intent-router.test.ts` and `synthesis-check.test.ts`). |
| `enrichments.ts` | `merchandiseCitation` carries a resource's curated bibliographic title on a citation, never overwritten by a generated headline, keeping the headline as `Citation.headline` only when it differs (word-overlap check); `titleCurated` threaded through `merchandiseCatalogItem` and the overlay. | R2 (PR #6): chips carry the bibliographic title with the headline as subtitle; R16 (PR #5): re-cased curated titles. | Upstream | `enrichments.test.ts` (29; two on `merchandiseCitation` and `titleCurated`) |
| `generate-schemas.ts` | The briefing schema's sections require `sources` (a sourceless section is withheld) and `statements` of `{figure, outcome, population, study}` per stated figure; key takeaways must carry a figure or a named study; the assessment schema adds `source` and `source_quote`. | R22 (P6-07), R21 (P8-05, P8-11) in PR #4; D3-03 statements in PR #14. | Upstream | `generate.test.ts` (8; briefing sources and assessment source cases), `briefing-audit.test.ts` |
| `kg.ts` | The knowledge-graph design prompt samples the inventory to a character budget via `sampleInventory` (was a hard slice to 80 resources); the passage-labeller agent is registered with `scope: 'text_block'` (was field-level, the wrong scope for chunk labels); classifier labels get a real description. | Not in the PR descriptions (commits before PR #3, "fix labeller scope"); inferred from the diff. | Upstream | `kg.test.ts` (2, on model pinning); `inventory-sample.test.ts` |
| `rate-limit.ts` | `SlidingWindowLimiter.check` returns `remaining` and the middleware sets `X-RateLimit-Remaining`; `clientKey` reads a well-formed `x-rp-client` per-browser id with the address as fallback; `rateLimitLayered` checks per-client then per-IP limiters on one request. | R9 (P1-14, P3-08, P4-19, P5-09, P5-17, P5-18, P6-13, P7-20, P8-15, P8-16, P9-21). PRs #3 and #6 (from the earlier `fix/portal-batch-1`). | Upstream | `rate-limit.test.ts` (16; the remaining header and `clientKey` directly; `rateLimitLayered` not called by name) |
| `scheduler.ts` | `runAutoEnrichments` also runs `runSuggestedQuestionsOverCorpus` after the merchandising pass, capped at 150 resources per cadence, warning rather than failing the cadence on error. | R10 (P3-24, P7-25). PR #3. | Upstream | `scheduler.test.ts` (5, none on this wiring) |
| `server.ts` | Wires `labBindings()` (Extraction Lab sandbox boxes from the environment), the `DocsHealth` prober (3 s after boot, feeding `/api/health`), and `webBuildStamp()` (reads `apps/web/dist/build.json` so the served version is the stamped sha). | R26 (PR #4), R20 (PR #4), D1-21 (PR #9). | Upstream | `docs-health.test.ts`; no `server.test.ts` |
| `stores.ts` | Adds `RoutingLog`: one JSONL line per routing decision per tenant (question hash, intent, stage, confidence, rationale, configuration, latency) with `recent()` and `summary()`; `questionHash` is FNV-1a over the normalised question so the text is never stored. | Not in the PR descriptions; `docs/INTENT-ROUTING.md` section 3 ("Logging") describes it as the evaluation set for tuning the rules and the audit trail behind the admin Routing panel. | Upstream | none (no test references `RoutingLog` or `questionHash`) |
| `suggested-questions.ts` | Adds `runSuggestedQuestionsOverCorpus`: finds every resource with no stored openers, generates up to a limit with three-way concurrency, writes to the enrichment store and streams the enrichment-run event shape. | R10 (P3-24, P7-25). PR #3. | Upstream | `suggested-questions.test.ts` (19, all on pre-existing helpers; none on the new function) |
| `tenants.ts` | New file relative to `main` (332 lines): `TenantConfig` seeds for `grdc`, `frdc` and `eprepo`, and a `TenantStore` that layers persisted overrides over the seeds. The `eprepo` seed carries the branding, ten topic ids, the entity and relation types, `regionalDiscovery: false`, `searchExclude` for supplements and media, the lexicon and the six intents. See the stored-configuration table below. | The tenant scaffold predates PR #3; PRs #3, #4, #7, #8 and #16 changed the intents, rules, topK values and lexicon. | Mixed: `TenantStore` and the override mechanism are upstream; the `eprepo` body is EpRePo configuration | no `tenants.test.ts`; exercised as a fixture by `app.test.ts`, `generate.test.ts`, `mcp.test.ts`, `scheduler.test.ts`, `sources.test.ts`; the rules by `intent-router.test.ts` and `study-guard.test.ts` |

### 1c. The stored search configurations (`tenants.ts`, `eprepo`)

All EpRePo configuration; the mechanism (`IntentSchema`, `intentSearchConfigs`, the admin
`search-configs/ensure` route) is upstream. Every intent excludes `documentation`; the
`portal-doc-*` configurations include only `documentation` (search-config isolation is central,
per `CLAUDE.md`). Names on the box: `portal-intent-<id>` (ask) and `portal-intent-<id>-find`.

| Intent | Configuration | Changes since the scaffold |
|---|---|---|
| `lookup` (Exact lookup) | keyword only, `topK` 30, reranker `noop`, excludes supplement and media, `rulesOnly`, `requireEntity` | PR #3 (R7): fires only on one or two bare tokens where one is a gene-symbol shape or a lexicon term; the classifier can never choose it |
| `data` (Supplementary data) | keyword and semantic, `topK` 20, reranker `predict`, filter `not documentation, not media`, `retrieval.prefer` `format:supplement` (a second pass restricted to attachments), `classifierGate` on words that name a table, supplement, data sheet, appendix, protocol document, peer review or raw data | PR #7 (D1-01 to D1-03): was `format:supplement` only, which excluded the primary paper; "sample size" and bare "protocol" removed from its rules |
| `latest` (Latest evidence) | keyword and semantic, `topK` 20, prequery `{query} published 2025 or 2026`, `sortByPublished`, `promptVariant: recency` | PR #3: a bare year or "Seery 2025" is not recency |
| `clinical` (Clinical decision) | keyword and semantic, `topK` 12, excludes supplement, media and case-study, two safety prequeries, `minScore` 0.6, `requireLexiconEntity`, `promptVariant: safety` | PR #3 (R7): needs a medication or syndrome from the lexicon, a gene or strain does not qualify; PR #6: prequeries gated by `ask-prequeries.ts` |
| `review` (Evidence review) | keyword and semantic, `topK` 20, `strategy: full`, `depth: deep`, `promptVariant: synthesis` | PR #3: the 26-word rule removed; PR #7: "what has X published on" and PR #13: "X's papers" are review rules; PR #8 (D1-17): `topK` 12 to 20 |
| `general` (default) | keyword and semantic, `topK` 30, rule `RESULTS_QUESTION_RULE` (a rate, count, outcome, sample size, hazard ratio question) after every narrower intent's rules, and the `terse-results` rule | PR #7: results rule; PR #8 (D1-17): `topK` 20 to 30; PR #16 (D4-08): terse rule |
| Lexicon (`entityTerms`) | about 40 anti-seizure medications, syndromes and genes | PR #16 (D4-08): immunotherapies and antigens added (rituximab, cyclophosphamide, methylprednisolone, immunoglobulin, LGI1, NMDAR) |

The stored configurations are converged onto the box through `POST
/api/admin/t/eprepo/search-configs/ensure`; PRs #7 and #8 re-ensured them after changing the
`data` filter and the `topK` values.

## 2. apps/web

### 2a. New modules (`apps/web/src`)

| Path | What it does | Why | Upstream or EpRePo | Tests |
|---|---|---|---|---|
| `components/Byline.tsx` | `bylineFor` builds the "Authors · Journal · Year" line on Library and Search cards and the resource page from stored bibliographic metadata only (authors truncated to three plus "et al.", year falling back to `published`); null when a resource carries none of it. | R16 (P9-13, P10-06). PR #5; extended in PR #10. | Upstream | none |
| `components/CompareConfigurations.tsx` | Compare mode: streams one question through two stored configurations at once into independent columns, each with its own citations, sources and pending or error state, plus the shared 429 "portal is busy" card with countdown and retry. | R7 (the routing demo), R9. PRs #3, #9. | Upstream | none |
| `components/HelpMenu.tsx` | The header's Help link becomes a small accessible menu ("Help and documentation", "How this works") with the account menu's keyboard contract. | PR #15. | Upstream | `HowItWorksPage.test.ts`, `e2e/how-it-works.test.ts` (menu links) |
| `components/RouteChip.tsx` | Shows the router's decision beside an answer (intent, stage: rule, classified with its confidence, chosen by you, default; a truncating rationale with a tooltip) with a dropdown to override the intent and re-ask; exports `intentSummary`, the one-line reading of an intent's retrieval policy reused by Compare mode and the admin Behaviour panel. | R7 (PR #3); D1-22, D1-23 (PR #9); the override (PR #16). | Upstream | none |
| `components/help-menu-items.ts` | The single source of the help menu's destinations, read by `HelpMenu` and the phone sheet so the two cannot drift. | PR #15. | Upstream | none |
| `lib/answer-export.ts` | Word export of an Ask answer: runs the page's own block parser so headings, lists and tables export as HTML, renders `[n]` as superscripts (dropping any with no citation) and appends a numbered reference list (authors, title, journal, year, DOI, portal link) in marker order. | R24 (P9-12). PR #4. | Upstream | `answer-export.test.ts` |
| `lib/answer-marks.ts` | Turns the `audit` event into UI: `auditBadge` builds the badge label, tone and tooltip (figures checked, unverified, removed, replaced, rescued and where found, denominators, attributions); `unsupportedFigurePattern` marks unsupported figures and years inline. | R5 (PR #6), grown through PRs #8, #12, #13, #14, #16. | Upstream | `answer-marks.test.ts` |
| `lib/ask-budget.ts` | Tracks the client's ask budget (`X-RateLimit-Remaining`, a 429's `Retry-After`) in `sessionStorage` with an injectable clock; `shouldDeferAutomaticAsk` lets the Search summary stand down near the limit. | R9. PR #3. | Upstream | `ask-budget.test.ts` |
| `lib/assessment-query.ts` | Builds what Assessment sends to `/generate`: a topic phrased as retrieval-shaped text (findings, figures, outcomes) rather than an instruction (which retrieved reference lists), with count and depth as separate guidance and numeric or comparative stems demanded at intermediate and advanced depth. | R21 (P8-05, P8-11), D1-20. PRs #4, #9. | Upstream | `assessment-query.test.ts` |
| `lib/display-title.ts` | `presentTitle` re-cases an all-capitals curated title while keeping initialisms and digit-bearing tokens; `plainDashes` renders em and en dashes used as punctuation as a spaced hyphen, leaving numeric ranges alone. | R16, R19. PR #5. | Mixed: the mechanism is generic; the `KEEP_CAPS` initialism list (SCN1A, EEG, ILAE, SUDEP, NMDAR) is domain-specific and should become tenant configuration | `display-title.test.ts` |
| `lib/pdf-highlight.ts` | Locates a cited passage in a PDF's text-item layer by normalised substring matching, longest needle first with fallbacks for a passage cut mid-word or across a hyphenated line break, and returns the range the reader paints. | R15, D1-08. PRs #5, #10. | Upstream | `pdf-highlight.test.ts` |
| `lib/tenant-copy.ts` | `tenantCopy` derives placeholder copy (an investigation name, a Generate brief per kind) from the tenant's own suggested questions and topics, so an epilepsy portal never shows farming examples; `config.copy` overrides. | R19 (P3-15, P6-14, P8-21, P4-20). PR #5. | Upstream (the strings come from tenant configuration) | `tenant-copy.test.ts` |
| `pages/HowItWorksPage.tsx` | The designed `/t/:slug/how-it-works` page: live counters, an inline SVG six-step flow (row from `lg`, column below, tokens only), the tenant's intents, and plain-language sections kept in step with the documentation twin by a shared heading list and a test. | PR #15; PR #17 (the loop 4 gate wording); this PR (confidence led by the check). | Upstream (the page; its trust-layer wording describes this fork's answer layer, which is itself upstream) | `HowItWorksPage.test.ts`, `packages/core/src/docs.test.ts`, `e2e/how-it-works.test.ts` |
| `pages/admin/ExtractionPanel.tsx` | The Extraction Lab admin panel: pick a document, profile it, run it through the default, table-aware and visual methods on the sandbox box, compare judge score, table rows, latency and a before/after ask, and set per-class routing rules. | R26 (P4-10). PRs #4, #9. | Upstream | none |

### 2b. Modified modules (`apps/web/src`)

| Path | What changed | Why | Upstream or EpRePo | Tests |
|---|---|---|---|---|
| `api/client.ts` | `ApiError.retryAfterSec`, the shared `RATE_LIMIT_MESSAGE`, `x-rp-client` and `noteAskBudget` on `streamAsk` and `routeIntent`; `intent`, `formatIds` and `sort: 'published'` on search and catalog; `getFacets` defaults; `generateArtifact` gains `topicIds` and `guidance`; `AskRequest` gains `intent`, `route: 'auto'` and context turns with `resourceIds` and `passages`; `getResourceQuestions` returns `{questions, pending}`; `getHealth`, `routeIntent`, `getRouting`; the Extraction Lab API. | PRs #3, #4, #5, #6, #7, #9, #16. | Upstream | server-side route tests |
| `components/AccountMenu.tsx` | `--rp-primary` references replaced with `--rp-brand-fg`. | R18 (PR #5). | Upstream | `AccountMenu.test.ts` (pre-existing) |
| `components/AnswerMarkdown.tsx` | Runs `stripRefusalTemplate` before block parsing so a leaked "Not enough data to answer this." is removed. | R19 (PR #6). | Upstream | none |
| `components/AnswerStream.tsx` | `citationHref` carries a page; `InferenceMark` renders "(inference)" as a mark; italics and markers inside emphasis; the audit badge on document-scoped answers; the document-scope decline card ("This document does not answer that", "Ask the whole corpus"). | R19, R25 (PRs #4, #6); D4-21 (PR #17). | Upstream | none |
| `components/AssessmentQuiz.tsx` | Per-question "Source:" link (or "not attributed") after submit; a note when reference-list questions were withheld. | R21 (PR #4), D1-20 (PR #9). | Upstream | none |
| `components/EvidenceTable.tsx` | "Open PDF in the reader at page N"; a summary match routes to `?matched=summary`; weak-match and matched-the-summary badges with titles; 24 px targets. | R15 (PR #5); D2-22, D1-23 (PR #10); D3-14, D3-21 (PRs #13, #14). | Upstream | none |
| `components/PdfReader.tsx` | A `highlight` prop: paints the cited passage, shows "Highlight not found on this page" with "Find it in the document" (scans up to 80 pages) and announces the outcome. | R15 (PR #5, #10). | Upstream | none |
| `components/QualityGauge.tsx` | The REMi meters relabelled as the platform's self-assessment; the disclosure takes the audit and derives confidence from `assessConfidence(quality, audit)`. | D1-13, D2-15, D3-16 (PRs #8, #12, #14). | Upstream | `confidence.test.ts` (the logic) |
| `components/ResourceThumb.tsx` | Placeholder "Report" becomes the format ("Article", "Supplement", "Video"); an optional `label`. | R16 (P9-13). PR #5. | Upstream | `ResourceThumb.test.ts` |
| `components/SearchAnswer.tsx` | Shared rate-limit copy; a deferred state that stands the automatic summary down near the limit with "Answer this search"; no marker rendered while unbound. | R9 (PR #3); D2-14 (PR #11). | Upstream | none |
| `components/StageTimeline.tsx` | The `auditing` stage ("Checking the figures"); a `reading` line naming the probe's papers while the platform generates. | D2-17 (PR #12); D3-05 (PR #13). | Upstream | none |
| `components/map3d-engine.ts` | Territory captions inset and collision-resolved on the canvas. | R14 (PR #3). | Upstream | none |
| `components/ui.tsx` | `prettyLabel` knows study-design ids; "Report" becomes "Document"; `savedFileNotice`, `useExportNotice` and `ExportNotice` shared by every export. | D1-06, D1-27 (PR #9). | Upstream | none |
| `lib/answer-text.ts` | `stripRefusalTemplate`: drops a leaked template sentence from an otherwise real answer. | R19 (PR #6). | Upstream | `answer-text.test.ts` |
| `lib/confidence.ts` | `basis` on the confidence; `auditConfidence` from the audit event; `assessConfidence(quality, audit)` with the audit leading and REMi able only to lower. | D1-13, D2-15 (PRs #8, #12). | Upstream | `confidence.test.ts` |
| `lib/passage.ts` | `passageIsQuotable` (not for a lookup or a metadata or reference match), `passageRepeatsSummary`, `scrubSnippetBoilerplate`. | D2-20, D3-04 (PRs #10, #13); R15 (PR #5). | Upstream | `passage.test.ts` |
| `lib/resource-view.ts` | `isGeneratedTextField` keeps the DA page summary out of the extracted-text blocks. | R15 (P3-16). PR #5. | Upstream | `resource-view.test.ts` |
| `lib/theme.ts` | The viewer dark mode: the dark grey suite, `ensureContrast`, `viewerDarkVars`, `useViewerScheme` (system default, `localStorage`), `paletteVars` and `useBodyTheme` taking a scheme. | R18 (PR #5). | Upstream | `theme.test.ts` |
| `main.tsx` | Registers the `how-it-works` route. | PR #15. | Upstream | none |
| `pages/AgenticPage.tsx` | Comment only: the pipeline disclosure is admin-only, the Deep research sub-question list is the public multi-step view. | R27 (PR #4; `docs/EPREPO.md`). | EpRePo (a product-framing decision) | none |
| `pages/AskPage.tsx` | `route: 'auto'` and the `route`, `verified`, `fallback`, `audit` and `stage auditing` events in message state; `RouteChip` with re-ask; Compare mode; the sources rail from `xl`; the 429 card; the session persisted at `done` and an error-only session dropped; the truncation notice; the figures-checked badge and inline marks; "Checking N figures"; "First sentence verified"; Export disabled while streaming with the notice and reference list; the document-scope decline; context turns carrying `resourceIds` and `passages`; 24 px markers. | PRs #3 to #17 (every Ask-facing finding). | Upstream | `app.test.ts` for the behaviour it renders |
| `pages/AssessmentPage.tsx` | Free-text topic form beside the tiles; `assessmentHeading`; a real topic scopes retrieval by `topicIds`; `slug` to the quiz for source links. | R21 (PR #4), D1-20 (PR #9). | Upstream | `assessment-query.test.ts` |
| `pages/DocsPage.tsx` | The illustrated-page link on the how-this-works article, the "Read how this works" callout, and the build stamp under every article. | PR #15; D1-21 (PR #9). | Upstream | `docs.test.ts` (the data) |
| `pages/EntityPage.tsx` | Quotes only quotable passages; the name and Ask button render at once with a skeleton for the connections; a dedicated unknown-entity state; neutral copy for readers. | D3-04, D3-17 (PR #13); R14 (PR #3). | Upstream | none |
| `pages/ExplorePage.tsx` | The regional discovery band is gated on `config.regionalDiscovery !== false`. | Not in the PR descriptions; inferred: a tenant without a geographic dimension suppresses the band (the eprepo seed sets it false). | Mixed: generic gate, EpRePo configuration | none |
| `pages/GeneratePage.tsx` | Per-section sources, `refs` and `takeaway_refs` resolving to a numbered reference list, omitted sections, the briefing figure-audit badge, clickable markers, source links on assessment questions, exports with references, tenant-derived placeholders. | R22 (PR #4); D1-10 (PR #9); D3-03 (PR #14); R19 (PR #5). | Upstream | none |
| `pages/GraphPage.tsx` | A canvas skeleton until first paint; the "run the agent" copy shown only to admins. | R14 (PR #3). | Upstream | none |
| `pages/InvestigationDetailPage.tsx` | Two columns from `xl`; the pre-synthesis warning over unjudged or contradicted evidence; the coverage block (excluded, opposing, unjudged, not used); the export notice; 24 px targets. | R23 (PR #4), R17 (PR #5), D1-27 (PR #9), D2-22 (PR #10), D2-16 (PR #11). | Upstream | none |
| `pages/InvestigationsPage.tsx` | The placeholder comes from `tenantCopy`. | R19 (PR #5). | Upstream | none |
| `pages/LibraryPage.tsx` | Published sort as the default; the bulk-import "Added" line suppressed; bylines and format placeholders; a redundant kind chip suppressed; a Format facet; `facetsFromUrl` reading singular and plural parameters; `presentTitle` and `plainDashes`. | R16, R12 (PR #5); D1-19 (PR #9). | Upstream | `library-cards.test.ts`, `library-grid.test.ts` |
| `pages/ManagePage.tsx` | The Extraction tab; `?tab=` deep links. | R26 (PR #4). | Upstream | none |
| `pages/ResourceDetailPage.tsx` | Extracted-text blocks force-wrap; the generated summary under its own heading with a summary-match notice; the reader's `highlight`; citations carrying a page; Authors, Journal, DOI and Keywords in the header; openers polling while pending. | R15, R16 (PR #5); D3-14 (PR #13); R10 (PR #3). | Upstream | none |
| `pages/SearchPage.tsx` | The server's `route` on the results (no `/route` call); `lookupOnly` suppresses the answer panel; "N articles · M supplements"; empty states for an unmatched identifier and an exact lookup; bylines, re-cased titles, scrubbed snippets; `?matched=summary`; "Watches"; wrapping facet rows; published sort. | R7 (PR #3); R4, R19 (PR #5); D1-07, D3-04 (PRs #7, #13); D2-20 (PR #10); D2-14 (PR #11); D4-16 (PR #16). | Upstream | `snippet.test.ts`, `search-snippets.test.ts` (server side) |
| `pages/TaxonomyPage.tsx` | Labelsets with no indexed value hidden and counted; honest cardinality; passage-level counts labelled as passages. | R12 (PR #5). | Upstream | `library-cards.test.ts` (helpers) |
| `pages/TenantLayout.tsx` | The dark-mode toggle (header and phone sheet); `HelpMenu` and the phone rows from `helpMenuItems`; help, account and scheme collapsing into the phone menu; `isAdmin` on the outlet context. | R18, R17 (PR #5); PR #15; R14 (PR #3). | Upstream | `theme.test.ts` (the hook) |
| `pages/ToolsPage.tsx` | The Extraction Lab card. | R26 (PR #4). | Upstream | `ToolsPage.test.ts` (pre-existing helper only) |
| `pages/admin/BehaviourPanel.tsx` | `IntentsTable`: every intent, its stored configurations, a policy summary, presence on the box, and a live routing-decision count from the admin `/routing` endpoint. | R7 (PR #3). | Upstream | none |
| `styles.css` | `.rp-flow-node` follows the shape token; the theme comment describes dark mode as a token swap; `--rp-brand-fg` on the header rules. | PR #15; R18 (PR #5). | Upstream | none (verified by screenshots per PR) |
| `scripts/stamp-build.ts` (new) | Writes `apps/web/dist/build.json` with the git sha and build time; run by `deno task build:web` through `build:stamp`. | D1-21 (PR #9). | Upstream | none |
| `public/brand/eprepo-logo.svg`, `eprepo-mark.svg` (new) | The EpRePo wordmark used in the header and its mark. | Tenant branding (before PR #3). | EpRePo | none |
| `e2e/how-it-works.test.ts` (new) | Real Chromium against the built app: every How-this-works section and the row diagram at desktop, the column diagram at 390 px with a 22 px root font and no overflow, the help menu and phone sheet listing both destinations. `e2e/persona-journeys.test.ts` and `e2e/support/` predate this fork. | PR #15. | Upstream | is the test |

## 3. packages/core

| Path | What it does or what changed | Why | Upstream or EpRePo | Tests |
|---|---|---|---|---|
| `src/study-design.ts` (new) | A rule-first study-design classifier over the record's curated title, abstract, author keywords and MeSH headings: study protocol, guideline or checklist, systematic review or meta-analysis, pooled analysis, genetic association study, preclinical, randomised controlled trial, clinical trial (non-randomised), case-control, cross-sectional, cohort, case report or series, survey, qualitative study, narrative review; the box's own label is admitted only where the text corroborates it, otherwise no badge; supplements and media never carry a design. | D1-06 (PR #9); D2-21 (PR #10); D3-18 (PR #13). Roadmap R11. | Mixed: the classifier is generic for any bibliographic corpus; its vocabulary was tuned against the 655 epilepsy articles | `study-design.test.ts` (33), provider `study-design-kind.test.ts` |
| `src/docs.ts` (modified) | New pages `how-this-works`, `watches`, `generate-artefacts`; `getting-started` gains "Exporting your work"; `assistant` documents the admin-only pipeline, Word-only export and Deep research as the public multi-step view; `trust-and-citations` describes the citation binding, the figure check as a gate, the audit-led confidence and the closest matches; `assessment` and `investigations` describe the free-text topic, source links, the synthesis warning and coverage. | R20, R21, R23, R27 (PR #4); D1-26, D2-18 (PRs #9, #10); PR #15; PR #17 and this PR (the gate as it is now). | Upstream | `docs.test.ts` |
| `src/index.ts` (modified) | The schema additions listed below. | See the list. | Mixed: the mechanisms are upstream; `copy`, `assessmentHeading` and `regionalDiscovery` exist because this tenant needed different wording and behaviour from FRDC and GRDC | validated through `app.test.ts` and the provider tests that parse these types |

### 3a. Schema additions (`packages/core/src/index.ts`)

| Schema or field | Purpose | Added by |
|---|---|---|
| `TopicSchema.description` | A one-line qualifier per topic for the classifier agent's prompt | before PR #3 |
| `LabelRefSchema`, `IntentSchema` (rules, `classifierGate`, `rulesOnly`, `requireEntity`, `requireLexiconEntity`, `retrieval.{features, topK, reranker, only, exclude, prefer, minScore}`, `answer.{strategy, depth, neighbours, graph, promptVariant, prequeries, sortByPublished, surfaces}`), `RouteDecisionSchema` | The intent-routing contract (`docs/INTENT-ROUTING.md`) | before PR #3 (the scaffold); PR #7 (`classifierGate`, `retrieval.prefer`) |
| `ExtractionMethodSchema`, `ExtractionClassSchema`, `ExtractionProfileSchema`, `ExtractionRulesSchema` | The Extraction Lab contract (`docs/EXTRACTION-LAB.md`) | before PR #3; PR #4 built on it |
| `TenantConfigSchema.intents`, `.defaultIntent`, `.entityTerms` | Per-tenant intents and the lexicon | before PR #3 |
| `TenantConfigSchema.searchExclude` | Labels excluded from research search and ask beyond `documentation` | before PR #3 |
| `TenantConfigSchema.regionalDiscovery` | Opt out of the Explore regional band | before PR #3 |
| `TenantConfigSchema.extraction` | Per-tenant extraction routing rules | before PR #3 |
| `TenantConfigSchema.assessmentHeading` | The Assessment tiles heading | PR #4 (R21) |
| `TenantConfigSchema.copy` (`investigationExample`, `generateExamples`) | Tenant example copy | PR #5 (R19) |
| `ResourceSummarySchema` and `CatalogItemSchema`: `authors`, `journal`, `year`, `doi`, `keywords`, `titleCurated` | The bibliographic record | before PR #3 |
| `ResourceSummarySchema.pmcid`, `.pmid`, `.originUrl` | Identifier lookups | PR #3 (R7) |
| `CatalogItemSchema.format`, `.type` | Format badges on Library cards | PR #5 (R16) |
| `ScoredResourceSchema.passages` | Every retrieved paragraph with its page, for evidence cards | PR #8 (D1-08) |
| `ScoredResourceSchema.referenceChunk`, `.matchedField` | A bibliography or front-matter hit; where the passage matched | before PR #3 |
| `SearchLookupSchema`, `SearchResultsSchema.lookup` | An exact identifier or author lookup resolved before retrieval | PR #3 (R7) |
| `SearchResultsSchema.route` | The rule-stage decision `/search` applied | PR #7 |
| `LabelsetSchema.descriptions` | Per-label descriptions | before PR #3 |
| `CitationSchema.headline` | The generated headline as a chip subtitle | PR #6 (R2) |
| `AskStageSchema` gains `auditing`; the `stage` event gains `figures` | The "Checking N figures" state | PR #12 (D2-17) |
| `AskEventSchema` variant `route` | The routing decision before any delta | PR #7 |
| `AskEventSchema` variant `fallback` | A routed configuration that found nothing, answered on the default | PR #6 (R6) |
| `AskEventSchema` variant `audit` (`figuresChecked`, `figuresUnsupported`, `yearsUnsupported`, `contraindicationsUnsupported`, `sentencesChecked`, `sentencesCited`, `denominatorsMissing`, `attributionsCorrected`, `sentencesRemoved`, `figuresRemoved`, `figuresRescued`, `sentencesReplaced`, `foundIn`, `figuresSecondhandRemoved`, `denominatorsCorrected`) | The claim-audit contract | PR #6 (the first four), PR #8 (sentences, denominators, attributions), PR #12 (removed), PRs #14 and #17 (rescued, replaced, foundIn, second-hand, corrected) |
| `AskEventSchema` variant `verified` | The first verified sentence | PR #16 (D4-08) |
| `AskEventSchema` `done.truncated` | A generation cut back to its last sentence | PR #8 (D1-04) |
| Context turns carry `resourceIds` and `passages` | Session context to later turns | PR #16 (D4-07) |

## 4. packages/retrieval

| Path | What it does or what changed | Why | Upstream or EpRePo | Tests |
|---|---|---|---|---|
| `src/prompts.ts` (new) | The system-prompt variants (`safety`, `synthesis`, `recency`, `data`) an intent selects, `DENOMINATOR_RULE` (every proportion with its n and analysis set, effect sizes as given) and `DESIGN_RULE` (the first citing sentence names the source's design). | Variants before PR #3; the synthesis line in PR #6 (R3); the rules in PR #8 (D1-14, D1-15); the effect-size sentence in PR #12 (D2-09). | Upstream | through `app.test.ts` and the audit tests |
| `src/providers/arag/catalog-browse.ts` (new) | Pure helpers for `/catalog`: the `filter_expression` (OR within a facet, AND across), the untagged expression, client-side matching and sorting (`published`, which the platform's `sort_field` lacks) and paging. | R16, R12 (PR #5). | Upstream | `catalog-browse.test.ts` |
| `src/providers/arag/entity-filter.ts` (new) | Entity hygiene for the graph, entity groups and typeahead: numbers, single letters, person names, journals, age vignettes, e-mails, doses, protein variants, reference markers and table cells dropped; the Gene group needs a gene-symbol shape; de-duplication and preferred spellings. | R14 (PR #3). | Mixed: the categories are generic; the digitless gene allow-list and the journal list are domain lists that should become tenant configuration | `entity-filter.test.ts` |
| `src/providers/arag/snippet.ts` (new) | Snippet selection: bibliographic text, first-page front matter and identifier or table fragments detected so the quoted passage and rank come from body text when body text matched; a noise-only resource stays findable at 0.4 of its score; DOI extraction and matching; an every-term exact-match check. | R4 search half (PR #5). | Upstream | `snippet.test.ts`, `search-snippets.test.ts` |
| `src/providers/arag/suggest-ranking.ts` (new) | Ranks the configured suggested questions by overlap with the typed query, configured order otherwise. | R14 (PR #3). | Upstream | `suggest-ranking.test.ts` |
| `src/env.ts` (modified) | `labBindings()` reads `ARAG_KB_<SLUG>_LAB` and `_LAB_TOKEN` for the Extraction Lab sandbox box. | Extraction Lab (before PR #3). | Upstream | none named |
| `src/index.ts` (modified) | Re-exports `labBindings`, the prompt variants, and the provider's intent, strategy, reference-chunk and extraction helpers for `apps/api`. | Package-boundary plumbing (PRs #4, #9). | Upstream | transitively |
| `src/merchandise.ts` (modified) | `titleCurated` on the overlay so a generated title never replaces a bibliographic one; `extractPageSummary` recognises the `-t-` field of a text ingest. | Curated titles (before PR #3); R15 (P3-16) in PR #5. | Upstream | `merchandise.test.ts` |
| `src/provider.ts` (modified) | The interface additions listed below. | See the list. | Upstream | through the route and provider tests |
| `src/providers/arag/client.ts` (modified) | `postRaw` takes extra headers so an upload can carry `x-extract-strategy`. | Extraction Lab (before PR #3, R26). | Upstream | none |
| `src/providers/arag/index.ts` (modified, +1510/-201) | By method. `ask`: the request body below, `groundingPrequeries`, the partial-marker hold, the provider decline held, `noRefusalRetry`, `done` before the REMi judge with the judge started before `done` and capped at 8 s. `askStructured`: `instructions`, `filters`, `resource_filters`, `extra_context`, `passagesByResource`, `max_tokens` 4096, never `citations` beside `answer_json_schema`. `classifyIntent`: the classifier memoised per tenant, surface and normalised question. `search`: a three-minute per-query cache, intent-aware `/find` (features, reranker, `top_k`), the 60-paragraph budget, exact-lookup and DOI enforcement, `chooseSnippet`, `isCitationNoise` and the declarations detector, `resourceIds` and `mode: semantic`. `catalog` and `loadCatalogue`: client-side listing for `published` sort and kind filters, `catalogByQuery`, format and type on items, kind derived in one place. `facets` and `untaggedCount`: one aggregation per labelset, kind from the listing. `graphRelations` and `entity`: one `/graph` page per entity group plus the ungrouped page, ranked by weight, degree and name with a per-group floor, five-minute cache, an entity-scoped path filter, author retyping. `typeahead` and `suggest`: lexicon prefix matching, case folding, `rankSuggestedQuestions`. Docs scope cross-checked on every retrieved item. `ensureSearchConfigs`: the intent configurations. | PRs #3 to #17 (every batch). | Mixed: the mechanics are upstream; the lexicon defaults and the gene-symbol reuse are domain tuning | `intents.test.ts`, `ask-structured.test.ts`, `catalog-browse.test.ts`, `display.test.ts`, `entity-filter.test.ts`, `extraction.test.ts`, `sandbox-ask.test.ts`, `search-snippets.test.ts`, `snippet.test.ts`, `study-design-kind.test.ts`, `suggest-ranking.test.ts`, `graph-relations.test.ts` (new or modified), plus the pre-existing provider tests |

### 4a. Provider interface additions (`packages/retrieval/src/provider.ts`)

| Addition | Purpose | Added by |
|---|---|---|
| `SearchOptions.intent` | Select a search-capable intent's stored configuration | before PR #3 |
| `SearchOptions.resourceIds` | A targeted find beside a pinned study | PR #7 |
| `SearchOptions.mode: 'semantic'` | The closest matches of a decline | PR #11 (D2-10) |
| `AskOptions.intent` | Select the stored ask configuration and the answer behaviour | before PR #3 |
| `AskOptions.sandbox` | An Extraction Lab box with no stored configuration and no floor | PR #4 (R26) |
| `AskOptions.extraContext`, `.promptAddendum` | Application context beside retrieval; per-ask instructions on the system prompt | PR #6 |
| `AskOptions.pinnedResourceIds` | The study guard's pinned papers, each with its own prequery | PR #7 |
| `AskOptions.resourceIds` | Author-scoped retrieval | PR #8 |
| `AskOptions.pinnedQueries`, `.scopedQueries`, `.topK` | Question clauses against pinned papers; scoped topic passes; a request-level paragraph budget | PR #11 |
| `AskOptions.noRefusalRetry` | The application manages the single retry | PR #13 (D3-05) |
| `AskOptions.priorResourceIds`, `.maxTokens` | Earlier turns' papers on a follow-up; room for a table | PR #16 |
| `CatalogOptions.formatIds`; `sortField: 'published'` | Format filter; published sort | before PR #3; PR #5 |
| `RetrievalProvider.suggest(tenant, query?)` | Query-aware suggestions | PR #3 |
| `RetrievalProvider.untaggedCount?(tenant, labelset)` | The honest Untagged count | PR #5 |
| `ScoredResource.passages` (through core) | Retrieval paragraphs with pages | PR #8 |

### 4b. The ARAG provider's `/ask` request

`search_configuration` (the doc-scoped, intent or default research configuration; none on a
sandbox box, where the score floor is zeroed instead); `prompt.system` (the variant preamble,
the research or Help prompt, the addendum); `extra_context` (twelve blocks at most); `context`
(chat turns, `AGENT` mapped to the platform's `NUCLIA`); `resource_filters` (one document, or up
to 80 scoped resources); `filters` (topic label paths); `rag_strategies` (the intent's own, or
`full_resource` for deep depth, or `neighbouring_paragraphs` plus `graph_beta`; a `prequeries`
strategy whenever `groundingPrequeries` produces any; a request-level `top_k` swaps
`full_resource` for a narrow `neighbouring_paragraphs` because whole resources and a wide
budget do not fit one context); `rag_images_strategies` when images are on; `citations: true`;
`reranker: predict` unless the intent says otherwise; `max_tokens` up to 4096; `top_k` up to
100. Events, in order: `stage preprocessing`, `stage retrieval started`, `learning`, `sources`,
`stage retrieval completed`, `stage generating started`, `delta`s, `citation`s, `stage
generating completed`, `done`, `stage validating`, `quality`. The `route`, `verified`, `audit`
and `fallback` events are layered around this stream by the `/ask` route in `apps/api`
(`docs/TRUST-LAYER.md`).

## 5. tools

| Path | What it does | Why | Upstream or EpRePo | Tests |
|---|---|---|---|---|
| `tools/epilepsy-corpus/fetch_corpus.py` (new) | Downloads the open-access epilepsy corpus from a manifest through the PMC Article Datasets S3 bucket (the PMC OA web service was retired on 25 August 2026), then Unpaywall, then Europe PMC XML; fetches media and supplements; polite (1.5 s per request, backoff) and resumable. Opens with a module docstring. | `docs/EPREPO.md` section 1, `docs/EPREPO-INGESTION.md`. Before PR #3. | EpRePo | none (a one-shot script) |
| `tools/epilepsy-corpus/upload_corpus.py` (new) | Loads `~/epilepsy_corpus` into the `research-portal-eprepo` box 80 resources at a time with `run`, `status`, `watch`, `reconcile` and `retry-errors`; reconciles by resource slug so nothing is uploaded twice. Opens with a module docstring. | `docs/EPREPO-INGESTION.md`. Before PR #3. | EpRePo | none |
| `tools/epilepsy-corpus/README.md` (new) | What the two scripts do and how they run; formatter reflow kept in PR #6. | Before PR #3. | EpRePo | none |

## 6. docs

| Path | One line |
|---|---|
| `docs/ARAG-DEV.md` (modified) | Gains the classifier-caching note (unknown top-level keys are accepted silently, so no temperature is sent), request-level `top_k` winning over a stored configuration, each prequery being a full find request, `full_resource` never sent beside a wide budget, and the `/graph` 500-path cap with per-group paging (PRs #3, #11). |
| `docs/VISION.md` (modified) | Records EpRePo as the third seeded tenant. |
| `docs/EPREPO.md` (new) | The five locked decisions plus tenant, knowledge box, deployment, dark mode, copy and (this PR) trust-layer pointers. |
| `docs/EPREPO-INGESTION.md` (new) | How the on-disk corpus becomes knowledge-box resources with the metadata the portal needs. |
| `docs/EPREPO-PERSONAS.md` (new) | The ten test personas derived from what the box holds. |
| `docs/EPREPO-ROADMAP.md` (new) | The roadmap items R1 to R27, the P-findings and the delivery status of the four batches and the four loops. |
| `docs/INTENT-ROUTING.md` (new) | The intent taxonomy, the router, the stored configurations, the demo script and the loop 1 revisions. |
| `docs/EXTRACTION-LAB.md` (new) | The sandbox box and the custom extraction methods. |
| `docs/CLINICIAN-REVIEW-2.md` (new) | The second epileptologist review. |
| `docs/PERSONA-DSOUZA.md` (new) | The D'Souza test persona. |
| `docs/VIDEO-BRIEF.md` (new) | A brief for the demo video. |
| `docs/persona-reports/p1.md` to `p10.md` (new) | The ten persona reports behind PRs #3 to #6. |
| `docs/persona-reports/dsouza-loop1.md` to `loop4.md` (new) | The four loop reports behind PRs #7 to #17, each ending with a fixes section. |
| `docs/TRUST-LAYER.md`, `docs/CHANGELOG-EPREPO.md`, `docs/CORPUSKIT-CHANGES.md` (new, this PR) | The trust-layer architecture note, the per-PR changelog and this record. |

All EpRePo-specific except `ARAG-DEV.md` and `VISION.md` (upstream reference documents) and
`INTENT-ROUTING.md`, `EXTRACTION-LAB.md` and `TRUST-LAYER.md`, which describe upstream
mechanisms with EpRePo examples.

## 7. deploy and dependencies

| Path | What changed | Why | Upstream or EpRePo | Tests |
|---|---|---|---|---|
| `Dockerfile` | Adds `poppler-utils` (`pdfinfo`, `pdftotext`, `pdffonts`) and `--allow-run` for them. | R26: the Extraction Lab profiler; without them profiles fall back to the platform's extracted text (PR #4). | Upstream | none |
| `fly.toml` (new) | Fly.io app `eprepo-portal` in Sydney, one always-on machine so the scheduler and watches run without a visitor, the `rp_data` volume at `/app/data`, an `/api/health` check. | `docs/EPREPO.md` Deployment: this fork deploys from the developer machine with `fly deploy --remote-only`; corpuskit's Cloudflare pipeline is not used. | EpRePo | none |
| `deno.json` | `zod/v4` pinned to `npm:zod@4.4.0` (was 4.5.4); `dev` and `build:web` gain `--allow-run=pdfinfo,pdftotext,pdffonts`; `build:stamp` runs `stamp-build.ts` inside `build:web`. | The zod pin: the only reachable npm proxy on the development machine (`NPM_CONFIG_REGISTRY=https://pkg.harness.io/pkg/ct8onj8YTdaXtKaFsYCRLg/org-marklogic-npm/npm`, `docs/EPREPO.md` local development note) blocks 4.5.x by policy, so the pin is an environment constraint, not a product choice; poppler: R26; the stamp: D1-21 (PR #9). | Mixed: the pin and the registry are EpRePo build-environment facts; the poppler permission and the stamp task are upstream | none |
| `deno.lock` | One entry: `zod@4.5.4` to `zod@4.4.0` with its integrity hash. | Same as above. | EpRePo | none |

When this goes upstream: drop the zod pin once the upstream registry serves 4.5.x, keep the
poppler and stamp changes, and leave `fly.toml` out (corpuskit deploys to Cloudflare).

## 8. Header doc comments

Every new non-test TypeScript module now opens with a doc comment stating its purpose and the
finding or item it serves. This PR added one (comment-only) to the seven that lacked it:
`apps/api/src/catalog-lookup.ts`, `apps/api/src/docs-health.ts`,
`apps/api/src/generate-sources.ts`, `apps/web/src/components/CompareConfigurations.tsx`,
`apps/web/src/pages/admin/ExtractionPanel.tsx`,
`packages/retrieval/src/providers/arag/catalog-browse.ts` and
`packages/retrieval/src/providers/arag/suggest-ranking.ts`. The Python tools open with module
docstrings.

## Changes without a written rationale

Recorded honestly, from the diff and the commit subjects: `inventory-sample.ts` and the
`analyse.ts` and `kg.ts` sampler and labeller-scope fixes (before PR #3, after the
981-resource box exposed a 422 on the design prompts); `stores.ts` `RoutingLog` (described in
`docs/INTENT-ROUTING.md` "Logging" but in no PR); `ExplorePage.tsx`'s `regionalDiscovery` gate
and the `eprepo` seed's `regionalDiscovery: false`; the brand SVGs; the `extraHeaders`
parameter on `client.ts` (one caller, the extraction strategy header). None changes application
behaviour for a tenant that does not set the field.
