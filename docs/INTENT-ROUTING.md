# Intent-routed search configurations

> Status 2026-09-03: built and live on the EpRePo box. Six stored configurations converged
> (`portal-intent-lookup`, `-data`, `-data-find`, `-latest`, `-clinical`, `-review`), the route
> chip and override on Ask and Search, compare mode, the Manage table with live read-back, and the
> routing log at `data/routing/eprepo.jsonl`. The classifier retrieves one keyword hit rather than
> grounding on nothing, because the platform refuses to generate on an empty context.

> One ask box, many jobs. Every job gets its own named search configuration on the same
> knowledge box, and a router decides which one a question deserves. Design and solution
> architecture, written 2026-09-03 for the EpRePo portal as the live instance of a horizontal
> pattern.

## 1. The use case

A research portal fields very different questions through one box. "What is the max dose of
fenfluramine with stiripentol?" is not the same job as "what does the corpus say about seizure
cycles?", and neither is "SCN8A" typed on its own. Today all three run through one configuration:
hybrid retrieval, twenty candidates, one system prompt, one grounding window. The generic call is
never wrong enough to notice and never right enough to trust.

Progress Agentic RAG lets a knowledge box hold **named search configurations**: stored objects
that bake in retrieval features, candidate count, reranking, a filter expression over labels, and
citation behaviour. The portal already uses four (research search and ask, documentation search
and ask) to keep in-app help out of research answers. This design generalises that: **one stored
configuration per job-to-be-done, and a router that picks it.**

Why this beats one generic RAG call:

- **Isolation.** A configuration's `filter_expression` is enforced on the box, not in request
  code. A clinical-decision answer physically cannot ground on a supplementary spreadsheet or a
  help page, and nobody has to remember to pass a filter.
- **Precision.** Keyword-only retrieval for an identifier, deep full-resource grounding for a
  review, recency bias for "latest": each job gets the retrieval it needs instead of the average.
- **Safety.** A drug-selection question always runs a contraindications sub-query and a
  conservative prompt. The behaviour is attached to the intent, so it cannot be forgotten.
- **Cost and latency.** An exact lookup skips reranking and generation. A review pays for the
  full-resource window only when the question warrants it.
- **Auditability.** Every answer records which intent was chosen, why, and which configuration
  served it. The configurations themselves are visible on the box in the admin console, so a
  buyer can see the policy rather than take it on faith.

The pattern is horizontal. The same six intents map onto any corpus:

| Intent | EpRePo (live) | Legal and contracts | Field service manuals | Financial services policy |
|---|---|---|---|---|
| Exact lookup | Gene symbol, drug name, PMCID | Clause number, matter reference, defined term | Part number, fault code | Policy number, form code |
| Clinical decision (safety-first) | Treatment choice with mandatory contraindications check | Advice on a position with mandatory limitation and jurisdiction check | Repair procedure with mandatory lock-out and hazard check | Product suitability with mandatory disclosure and eligibility check |
| Evidence review (deep) | Synthesis across studies, full text | Precedent survey across matters | Root-cause history across service reports | Regulatory change impact across policies |
| Latest | Newest published studies | Most recent rulings or amendments | Latest bulletins and revisions | Current-year policy versions |
| Supplementary data | Data sheets, tables, peer review history | Schedules, annexures, exhibits | Wiring diagrams, torque tables | Rate cards, appendices |
| General (default) | Anything else, hybrid | Anything else | Anything else | Anything else |

## 2. The EpRePo intent taxonomy

Naming convention for stored configurations: `portal-intent-<id>`. The existing `portal-ask` and
`portal-search` remain as the default pair so nothing that works today changes shape.

Every intent has two halves. The **stored half** lives on the box and the platform enforces it.
The **portal half** is selected by the intent id at request time in `ask()` and `search()`:
retrieval strategies, system prompt, generative model, depth, prequeries, minimum score. The
platform rule that matters: a named `search_configuration` overrides the request's `features`, so
the portal never sends `features` alongside an intent configuration.

| id | Label | What it is for | Example questions |
|---|---|---|---|
| `lookup` | Exact lookup | An identifier or a bare term; the user wants the documents, not an essay | "SCN8A", "PMC8371239", "cenobamate", "Dravet" |
| `clinical` | Clinical decision | Choosing or dosing a treatment for a patient; safety must be in the answer | "Which ASMs should be avoided in SCN1A Dravet?", "Fenfluramine dose with stiripentol?" |
| `review` | Evidence review | Synthesis across the corpus, full text grounding | "What is known about multiday seizure cycles?", "Compare SCN1A, SCN2A and SCN8A gain versus loss of function" |
| `latest` | Latest evidence | What is newest on a topic | "Latest on responsive neurostimulation", "Any 2026 papers on cannabidiol?" |
| `data` | Supplementary data | Tables, data sheets, protocols, peer review history | "Sample size calculation in the SERIAS protocol", "Supplementary table of variants in the exome study" |
| `general` | General (default) | Everything else | "How does the ketogenic diet work?" |

Settings that differ per intent. Blank means the default pair's value.

| Setting | `lookup` | `clinical` | `review` | `latest` | `data` | `general` |
|---|---|---|---|---|---|---|
| Stored: `features` | `keyword` | `keyword, semantic` | `keyword, semantic` | `keyword, semantic` | `keyword, semantic` | `keyword, semantic` |
| Stored: `top_k` | 30 | 12 | 24 | 20 | 20 | 20 |
| Stored: `reranker` | `noop` | `predict` | `predict` | `predict` | `predict` | `predict` |
| Stored: `filter_expression` | not documentation | not documentation, not `format:supplement`, not `format:media`, not `kind:case-study` | not documentation, not `format:supplement`, not `format:media` | not documentation, not `format:supplement`, not `format:media` | not documentation, **only** `format:supplement` | not documentation, not `format:supplement`, not `format:media` |
| Stored: `citations` | n/a (find only) | true | true | true | true | true |
| Portal: surfaces | search only, no generation | ask | ask | ask, results sorted by `published` desc after retrieval | ask and search | ask and search |
| Portal: `rag_strategies` | none | `neighbouring_paragraphs` 3/3, `graph_beta` 2 hops | `full_resource` | `neighbouring_paragraphs` 2/2 | `neighbouring_paragraphs` 4/4 (tables need context) | `neighbouring_paragraphs` 2/2, `graph_beta` |
| Portal: `prequeries` | none | mandatory: "contraindications, drugs to avoid and safety monitoring for {entities}" plus "dose limits and interactions for {entities}" | user sub-questions (deep research) or none | "{query} published 2025 or 2026" | none | none |
| Portal: system prompt | none | safety-first variant: lead with contraindications and monitoring when present in context, state dose ranges only as cited, end with "verify against current prescribing information" | synthesis variant: structure by theme, name disagreements between sources | recency variant: order findings newest first and state the year of each | data variant: reproduce numbers and table cells exactly as cited | current default |
| Portal: `generative_model` | none | box default | box default | box default | box default | box default |
| Portal: `depth` | n/a | default | deep | default | default | default |
| Portal: min score to cite | n/a | 0.6 (calibrated) | 0.35 | 0.35 | 0.35 | 0.35 |

Notes on the choices:

- `lookup` uses `reranker: noop` and keyword features so BM25 wins on an exact token; the
  portal renders results only, with "Ask about these" as the next step. That is the cheapest
  path on the box and it answers the reviewer's wish for exact-term retrieval on a gene name.
- `clinical` excludes case studies from grounding by default (single-patient reports are the
  wrong basis for a treatment decision) and mandates the safety prequeries. This is the direct
  answer to review items 5, 6 and 7: lamotrigine, echocardiographic monitoring and the
  stiripentol dose cap were all in the corpus and were missed by synthesis, not retrieval.
- `latest` cannot sort on the box (the catalogue sorts only by created, modified and title), so
  the portal reorders the retrieved sources by `published` and the prompt states years.
- `data` is the one intent that includes supplements; the other five keep the tenant's
  `searchExclude` behaviour.

## 3. The router

Two stages, cheapest first, and the decision is always visible.

**Stage 1, rules (deterministic, explainable, free).** Run in order; the first match wins.

1. `lookup`: the query is at most three tokens and matches an identifier pattern: `^PMC\d+$`,
   a gene symbol (`^[A-Z][A-Z0-9]{2,7}$`), a known drug name from the corpus keywords, or a
   single capitalised term with no verb.
2. `data`: contains `supplement`, `data sheet`, `table S`, `appendix`, `protocol`, `peer review`,
   `sample size`, `raw data`.
3. `latest`: contains `latest`, `newest`, `recent`, `this year`, a year at or after the current
   year minus one, `since 20`.
4. `clinical`: contains a drug or gene entity **and** a decision verb or noun: `dose`, `dosing`,
   `start`, `titrate`, `avoid`, `contraindicat`, `safe`, `should I`, `which ASM`, `first line`,
   `add-on`, `switch`, `interaction`, `pregnan`.
5. `review`: contains `compare`, `synthesis`, `what is known`, `evidence for`, `overview`,
   `across studies`, `mechanism`, or is longer than 25 tokens.

**Stage 2, classifier (only when no rule fires).** One call to the platform's `/ask` with an
`answer_json_schema` (name `route_intent`, properties `intent` enum of the tenant's intent ids,
`confidence` 0 to 1, `rationale` string), `citations: false`, `top_k: 1`, `reranker: noop` and a
prompt that lists the intents with their descriptions and example questions. Hard constraint from
`docs/ARAG-DEV.md`: never send `citations: true` with `answer_json_schema`. The call is scoped
with `filters` to a non-existent label so it grounds on nothing and costs one short generation.
Pin `generative_model` to the augmentation tier model already used for enrichments.

**Threshold.** Rules return confidence 1.0. The classifier's answer is accepted at confidence
0.6 or above; below that the intent is `general` with rationale "no confident match, using the
default configuration".

**Transparency.** The Ask page shows a route chip beside the question: "Clinical decision ·
contraindications check added" with the rationale on hover. The chip is a menu: any other intent
can be chosen and the question re-asked under it, and that override is recorded. Compare mode
(section 4) takes the same question through two intents side by side.

**Logging.** Every decision is appended to `data/routing/<slug>.jsonl`: question hash, intent,
stage (`rule` or `classifier`), confidence, rationale, override (if any), configuration name,
latency of the routing step, and the answer's REMi scores when they arrive. That file is the
evaluation set for tuning the rules and a per-tenant audit trail.

## 4. Solution architecture

Nothing leaks vendor types past `RetrievalProvider`. The UI speaks in intents; the provider
speaks in configurations.

**Core (`packages/core/src/index.ts`).** `TenantConfigSchema` gains:

```ts
intents: z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string(),
  examples: z.string().array().default([]),
  /** Stored half - what ensureSearchConfigs writes to the box. */
  retrieval: z.object({
    features: z.enum(['keyword', 'semantic']).array(),
    topK: z.number().int().positive(),
    reranker: z.enum(['predict', 'noop']),
    /** Labels excluded beyond documentation; `only` replaces exclusion with inclusion. */
    exclude: z.object({ labelset: z.string(), label: z.string() }).array().default([]),
    only: z.object({ labelset: z.string(), label: z.string() }).array().default([]),
  }),
  /** Portal half - applied at request time. */
  answer: z.object({
    surfaces: z.enum(['search', 'ask']).array(),
    strategy: z.enum(['neighbours', 'full', 'none']),
    neighbours: z.number().int().nonnegative().optional(),
    graph: z.boolean().default(false),
    promptVariant: z.enum(['default', 'safety', 'synthesis', 'recency', 'data']),
    prequeries: z.string().array().default([]),
    depth: z.enum(['default', 'deep']).default('default'),
    minScore: z.number().min(0).max(1).default(0.35),
    sortByPublished: z.boolean().default(false),
  }),
  /** Stage-1 rule: regexes tested against the lower-cased query, first match wins. */
  rules: z.string().array().default([]),
}).array().optional(),
defaultIntent: z.string().optional(),
```

`{entities}` in a prequery is substituted with the drug and gene mentions the router extracted
from the question. `TopicSchema`-style seeding happens in `apps/api/src/tenants.ts` for `eprepo`
with the six intents above.

**Provider (`packages/retrieval/src/provider.ts`, `providers/arag/index.ts`).**

- `ensureSearchConfigs(tenant)` derives one stored configuration per intent, named
  `portal-intent-<id>`, with `kind` `find` for search-only intents and `ask` otherwise, and
  converges them with the same POST-then-PATCH loop. `researchExcludeFilterExpression` gains an
  `only` form (`{ field: { and: [{ not: documentation }, { prop: 'label', ... }] } }`). The
  existing tests in `docs-isolation.test.ts` assert the plain exclusion shape when no extras are
  given; keep that path unchanged and add tests for the intent shapes.
- `AskOptions` and `SearchOptions` gain `intent?: string`. When set, the provider looks the intent
  up on the tenant, attaches `search_configuration: portal-intent-<id>`, omits `features`, and
  applies the portal half (strategies, prompt variant, prequeries, model, min score). For `lookup`
  on search it also sets `reranker: 'noop'` explicitly and skips the answer stream.
- New `routeIntent(tenant, query): Promise<RouteDecision>` in the provider implements stage 2
  through `askStructured` (already verified working) with the schema above. Stage 1 lives in a
  pure module `apps/api/src/intent-router.ts` with unit tests, so rules never need the platform.
- `RouteDecision` is a core type: `{ intent, confidence, stage: 'rule' | 'classifier',
  rationale, configuration }`.

**API (`apps/api/src/app.ts`).**

- `POST /api/t/:slug/route` `{ query }` returns `RouteDecision`. Rate-limited with the ask tier.
- `askBodySchema` and the search route accept `intent?: string`; an unknown intent is a 400.
- `POST /api/admin/t/:slug/search-configs/ensure` already exists; the response now lists the
  intent configurations, and `GET /api/admin/t/:slug/search-configs` returns the box's live
  objects so the panel can diff desired against live.
- Routing decisions append to `data/routing/<slug>.jsonl` through a small `RoutingLog` store
  in `apps/api/src/stores.ts` (JSON lines, same persistence rules as the other stores).

**Web (`apps/web`).**

- `apps/web/src/api/client.ts`: `routeIntent(slug, query)`, `intent` on `streamAsk` and search.
- `AskPage.tsx`: on submit, call `routeIntent` first (target under 400 ms for a rule, one
  generation for the classifier), render the route chip on the pending message, then stream the
  answer with `intent`. The chip menu lists the tenant's intents; choosing one re-asks. The
  answer record stores the decision so sessions replay it.
- New `apps/web/src/components/RouteChip.tsx` using `rp-chip`, accent-fg text, and the
  appearance tokens; no hard-coded colours.
- Compare mode: a "Compare configurations" control on the answer's actions row opens a two-column
  view, each column an intent picker, the same question streamed through both, sources listed
  under each with the configuration's settings summarised in an eyebrow line. This is the demo's
  hero screen: same question, two policies, visibly different grounding.
- `SearchPage.tsx`: a `lookup` route renders results only with a "Ask about these results"
  button; other intents behave as today with the intent passed through.
- Manage, Behaviour: `SearchConfigsBlock` becomes a table of intents: label, configuration name,
  stored settings, live read-back from the box (present, missing, drifted) and one Converge
  button. Drift is a plain field-by-field diff of the desired object against the live one.
- Review item 17: the pipeline and token widgets move behind the existing admin session check
  so clinicians see the route chip and confidence, not the plumbing.

**Sequence for one question.**

```
AskPage submit -> POST /route -> rules (apps/api intent-router) -> [classifier via provider.askStructured]
             -> RouteDecision (logged) -> chip rendered
             -> POST /ask { intent } -> provider.ask attaches portal-intent-<id> + portal half
             -> stream answer, sources, citations -> REMi scores appended to the routing log
```

## 5. Demo script (three minutes)

1. **"SCN8A"** in the ask box. Chip: "Exact lookup · identifier detected". The page shows
   documents only, keyword-ranked, in under a second, no generation. Say: the box ran a
   keyword-only configuration with no reranker; nothing was generated, nothing was paid for.
2. **"Which antiseizure medications should be avoided in a child with SCN1A Dravet syndrome?"**
   Chip: "Clinical decision · contraindications check added". The answer leads with
   lamotrigine, carbamazepine, oxcarbazepine, phenytoin and vigabatrin, then the monitoring
   note, then the verification line. Open the sources: no case studies, no supplements. Say: the
   configuration on the box excludes them; the safety sub-query is attached to the intent.
3. Click the chip, override to **General**, re-ask. The list is shorter and the monitoring note
   is gone. Say: same corpus, same model, different configuration. This is the whole point.
4. **Compare configurations**: "What is known about multiday seizure cycles?" through Evidence
   review and Latest evidence side by side. Review grounds on full text across years; Latest
   orders 2025 and 2026 first and says so. Point at the eyebrow lines that name the settings.
5. **"Sample size calculation in the SERIAS protocol"**. Chip: "Supplementary data". The
   answer quotes n=100, 46 for r=0.4 at 80 percent power, from the peer review history that the
   other intents never see.
6. **The reveal.** Manage, Behaviour, Search configurations: six intents, six stored objects on
   the box, all "live and matching". Then the same list in the Progress admin console. Say: the
   policy lives on the platform; the portal just chooses.

## 6. Build plan

Each step is one reviewable change; run `deno task check` after each.

1. `packages/core/src/index.ts`: `IntentSchema`, `intents` and `defaultIntent` on
   `TenantConfigSchema`, `RouteDecisionSchema`. Tests for parsing.
2. `apps/api/src/tenants.ts`: the six EpRePo intents with rules, prequeries and settings.
3. `apps/api/src/intent-router.ts` (+ test): stage-1 rules, entity extraction for `{entities}`,
   threshold logic; pure functions.
4. `packages/retrieval/src/providers/arag/index.ts`: `intentFilterExpression` (exclude and
   only forms), `ensureSearchConfigs` deriving `portal-intent-<id>` objects; tests beside
   `docs-isolation.test.ts` asserting the six shapes and that the plain shape is unchanged.
5. Provider `ask()` and `search()`: `intent` option, configuration attachment with `features`
   omitted, portal half applied (strategies, prompt variants in a small `prompts.ts`, prequeries,
   min score, sortByPublished). Test the body builder with the fake client used elsewhere.
6. Provider `routeIntent` via `askStructured` with the `route_intent` schema; `RouteDecision`.
7. `apps/api/src/app.ts`: `POST /api/t/:slug/route`, `intent` on ask and search bodies,
   `RoutingLog` store; tests in `app.test.ts` for validation and logging.
8. `apps/web/src/api/client.ts`: `routeIntent`, `intent` on `streamAsk` and search.
9. `apps/web/src/components/RouteChip.tsx` and AskPage wiring (route before ask, chip, override
   re-ask, decision stored on the message).
10. AskPage compare mode (two-column, two intents, shared question).
11. SearchPage `lookup` results-only rendering and "Ask about these results".
12. Manage, Behaviour: intents table with live read-back, drift and Converge.
13. Move pipeline and token widgets behind the admin session check (review item 17).
14. `docs/EPREPO.md` and the help docs page: describe intents and the chip.

Verify: gate green; live `search-configs/ensure` then `GET /search_configurations` on the box
showing six `portal-intent-*` objects; the five demo questions through `POST /route` and
`POST /ask` with expected intents; headless screenshots of the chip, the override, compare mode
and the Manage table in light and dark; the epileptologist's regression set, especially the
Dravet contraindication list and the stiripentol dose cap.

Risks:

- **Platform 422 on configuration shapes.** `only` filters and `reranker: noop` inside a stored
  config are unverified on this deployment. Converge one intent first, read it back, then the
  rest; keep the request-level fallback that sheds `search_configuration` on a 4xx.
- **Configuration overrides `features`.** Never send `features` with an intent configuration;
  the mode switch on the Search page must drop the configuration, as it does today.
- **Classifier cost and latency.** One short generation per question that misses every rule.
  Cache decisions by normalised question for a session; make the rules cover the demo questions
  so the classifier is the exception.
- **Prequery weight.** Mandatory safety sub-queries widen the grounding; if they crowd out the
  main answer, lower their weight to 0.7 rather than dropping them.
- **Recency without a sort.** `latest` relies on the prequery and post-retrieval ordering, not a
  platform sort; say so in the chip rationale so it is not mistaken for a date filter.
