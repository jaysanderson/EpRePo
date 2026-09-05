# The answer trust layer

Status: **current, 5 September 2026**, after the five D'Souza test-fix loops (PRs #6 to #17 and
the loop 5 PRs into `feat/eprepo-portal`). Written for an engineer joining the project. Companion to
`docs/INTENT-ROUTING.md` (the router and the stored search configurations),
`docs/ARAG-DEV.md` (platform facts and known bugs), `docs/EPREPO-ROADMAP.md` (the roadmap items
R1 to R27 and the P-findings) and the loop reports in `docs/persona-reports/dsouza-loop1.md` to
`loop5.md` (the D-findings cited below, by loop and id: `D2-07` is finding 7 of loop 2).

## What it is, in one paragraph

Progress Agentic RAG retrieves passages, writes an answer and binds citations to it at paragraph
level. Ten personas and four loops of one persona found the same defect shape in that output:
a figure, drug, year or cohort attributed to a cited paper that does not carry it, under a
marker the reader trusts. The trust layer is everything the application does around the
platform's `/ask` so that no sentence reaches the reader carrying a claim its cited text does not
support. It is deterministic wherever it decides anything: the only model calls are the
platform's own (the classifier, the answer generation, the optional decomposition and the REMi
quality judge), and none of them can add support to a claim. The layer runs in
`apps/api/src/app.ts`'s `/api/t/:slug/ask` route and the modules it calls; the platform sits
behind `RetrievalProvider` (`packages/retrieval/src/provider.ts`), and the browser only renders
what the events say.

Direction fixed in loop 4 (`dsouza-loop4.md`, section 6): **simple and honest over clever.** A
sentence the layer cannot verify is removed and the removal is stated. A substitute stands in
only when it passes the same figure, time-point, population and outcome checks the removed
sentence failed. A decline is never replaced with a quotation. An emptied answer is withheld with
the failing figures named.

## Vocabulary

| Term | Meaning |
|---|---|
| Intent, configuration | One of the tenant's routed jobs (`general`, `clinical`, `review`, `latest`, `data`, `lookup`) and the stored search configuration behind it (`portal-intent-<id>` for `/ask`, `-find` for `/find`). See `docs/INTENT-ROUTING.md`. |
| Probe | The pre-flight `/find` on the routed configuration, before generation. |
| Pinned paper | A resource the study guard identified from the question (a study acronym, a quoted title, an eponym, a described cohort, the top paper per named entity). Pinned into retrieval with its own prequery and led in the sources. |
| Cohort pin, designated cohort | A pin made because the question designates a cohort ("the LGI1 encephalitis cohort", "the video-EEG monitoring mortality cohort"). Under a designated cohort only its papers may carry a result figure. |
| Grounding set | The resources and paragraphs the platform generated from (its retrieval item), plus the pinned papers the application adds. |
| Cited text | A cited resource's full extracted text, fetched from the platform's extraction endpoint and cached per process; reference lists stripped before use. |
| Binding | Re-deriving, sentence by sentence, which cited texts carry a sentence. |
| Located sentence | The sentence, or the table row with its label and column headings, that carries a figure in a cited text. Every figure check is a check of the claim against this sentence (loop 5, "locate first"). |
| Quantity | What a figure measures in the claim: the noun phrase before its verb ("the adverse-event discontinuation rate was 33.6%"), the words after it ("80% of EDs"), or the label of the bracket it sits in ("(n = 4201, retention population)"), with the outcome families that phrase names, its responder threshold and the n it pairs. |
| Audit | The figure, cohort, second-hand, year, contraindication, denominator and attribution checks over the bound sentences. |
| Gate | The decision the audit's result becomes: remove, rescue, replace, qualify or keep each sentence. |
| Addenda | The italic lines under the answer that state what the layer did and what the papers add (removed sentences, the paper's own figure for the question's outcome after a removal, a protocol's planned recruitment beside the results paper's enrolment, effect sizes, study designs, second-hand figures, denominators the located passage gives, the corpus boundary). |
| Decline | The portal's own refusal text, with the closest matches named and shown "not used". |

## 1. The event sequence of one ask

The client sends `POST /api/t/:slug/ask` with `{ query, route: 'auto', context?, resourceId? }`
and reads Server-Sent Events. Every decision the layer makes is visible as an event, so the UI
never has to infer. Times in brackets are what the loop 4 runs measured on the live box.

| # | Stage | What happens | Kind | Platform feature | Events | Code |
|---|---|---|---|---|---|---|
| 1 | **Route** | Stage 0 (an identifier or an author-year citation), then the deterministic rules, in order; a results question and a terse "drug outcome - measure?" question route to the default configuration by rule. When no rule fires the classifier runs, memoised per tenant, surface and normalised question for ten minutes, in parallel with steps 2 to 4 rather than ahead of them. | Rules: deterministic. Classifier: one platform generation. | The classifier is a `/ask` with `answer_json_schema`, `citations: false`, `top_k: 1`. | `route` (0 ms by rule, 5 to 8 s by classifier) | `intent-router.ts`, `catalog-lookup.ts`, provider `classifyIntent` |
| 2 | **Probe** (the grounding gate before generation) | A `/find` on the routed configuration, 8 results. A supplements-only intent whose probe finds nothing or nothing above the floor falls back to the default configuration (`fallback` event). A best match under the floor (0.3) is declined outright, before any word is generated. A question whose exposure and outcome no retrieved record pairs is declined as a boundary. The probe's shortlist is sent as `sources` so the reader sees retrieval progress, and the texts of those papers are fetched now, while the platform works. | Deterministic. | Stored `-find` configuration; `mode: semantic` find for the closest matches of a decline. | `sources` (0.8 to 2.6 s), or `fallback`, or `done { refused }` | `app.ts` `probe`, `sendDecline`, `findClosestMatches`; `ask-grounding.ts` `exposureOutcomePair`, `pairCarried` |
| 3 | **Pinning** | The study guard matches the question against the merchandised catalogue: an upper-case token that titles at most three articles, a quoted title, an eponym or lexicon term that titles a few, a cohort the question describes (matched on titles and generated summaries). A comparison naming two or more drugs or studies runs the routed configuration once per entity and pins the top paper of each. Each pinned paper gets its own targeted find beside the probe so its passage and score are known before generation. | Deterministic (the per-entity finds are `/find` calls, not generations). | `resource_filters` on `/find`; the data-augmentation summaries. | (feeds `sources`) | `study-guard.ts`, `ask-entities.ts` |
| 4 | **Prequeries** | The intent's mandatory sub-questions that fit (a drug-safety probe only for a medication entity on a treatment-decision question), the caller's sub-questions, and for an evidence-seeking question of eight words or more a model decomposition into three to five sub-questions (16 s cap, skipped for a results question). A question naming an author the catalogue knows scopes retrieval to that author's articles with a larger paragraph budget and a topic-only scoped query. | Decomposition: one platform generation. The rest deterministic. | `askStructured` for the decomposition; the prequeries strategy on `/ask`. | `searched` | `ask-prequeries.ts`, `ask-author.ts`, `app.ts` |
| 5 | **Platform ask** | One `/ask` on the routed stored configuration with the variant preamble on the system prompt, the pinned addendum, the prequeries strategy (a pass per pinned paper with `resource_filters`, `top_k` 20 and weight 2; a pass per question clause against the first pinned papers; a lighter pass per prior-turn paper; one pass restricted to the intent's preferred labels; then the sub-questions, ten at most), `extra_context` (document tables, prior turns' passages and their papers' own paragraphs, publication years for a recency question, a pinned paper's own sections on a retry), chat `context` for follow-ups, `citations: true`, the intent's `rag_strategies` (`full_resource` or `neighbouring_paragraphs`, `graph_beta`; one neighbour each side and no graph walk for a terse question of seven words or fewer, with `top_k` 12), the cross-encoder reranker and, for a reformatting turn, retrieval on the earlier papers alone with no expansion, no reranker and a `max_tokens` sized to the number of earlier answers (1800 to 4096). The provider's own refusal retry is switched off (`noRefusalRetry`); the application manages the one retry. | One platform generation. | Stored configuration, `prequeries` with `resource_filters`, `extra_context`, `context`, `citations`, `rag_strategies`, `top_k`, `max_tokens`, `reranker`. | `stage` events from the provider (`retrieval`, `generating`), `sources` (the platform's grounding set, pinned papers first), `delta`, `citation`, `done` | provider `ask` and `groundingPrequeries` in `packages/retrieval/src/providers/arag/index.ts`; `prompts.ts` |
| 6 | **Stream shaping and the first verified sentence** | Each delta passes through the reference-list stop (a model-authored "References:" block or a trailing run of `[n] Title.` lines is never forwarded) and the sentinel rewriter (`SentinelStream`: "the context does not provide" becomes "the cited sources do not provide", the platform's guardrail sentence is dropped, a sentence is released the moment its stop arrives). The provider holds the platform's fixed decline copy and a `[n` split across chunks; a code-fence line is never forwarded. The first complete sentence is checked against the texts fetched in step 2: every figure beside the claim's own terms in one of those papers, which must also carry the question's cohort name; the surface is told which paper. The surface renders everything that streams in the checking style (muted ink, a dashed rule, the badge "Unchecked - still streaming, the check follows") and shows the verified line only under visible text; the gated text replaces everything at `done` in full ink (D5-08). | Deterministic. | (none) | `delta`, `verified` (at the platform's first token, 7 to 11 s) | `answer-shape.ts`, `ask-stream-verify.ts`, provider `splitPartialMarker` |
| 7 | **Finish the text** | At the platform's `done`: the model's reference lines are stripped (a heading block, a trailing author-year entry, a cited title written out), the sentinels rewritten in the final text and the "(inference)" token removed, code fences stripped, header-only tables and empty headings dropped (D5-05, D5-16), a generation that stopped mid-sentence is cut back to its last complete sentence (`done.truncated`; a table row that closes its pipe is complete, one cut before it is dropped alone). Citation chips take the bibliographic title with the generated headline as subtitle. | Deterministic. | (none) | `stage auditing started { figures }` | `answer-shape.ts` `stripModelReferences`, `rewriteSentinels`, `trimTruncatedTail` |
| 8 | **Binding** | The cited texts (eight at most) are fetched and their reference sections cut. Each sentence keeps only the markers whose cited text carries its named entities (both of two, 60 percent of many), a name the question also uses (the cohort, drug or study), the study design it states, every figure beside the claim's own terms, and enough of its content words and word pairs, including at least one of its rare words. A marker to a source under the display floor is dropped unless the source is pinned. Headings carry no markers; a list item inherits the nearest marked line's citation when the text carries it; a table row's markers sit inside its last cell. | Deterministic. | The platform's extraction endpoint (`extractionText`). | (none yet) | `citation-binding.ts` `bindSentences`, `supportScore`, `rareWords`; `ask-grounding.ts` `bindAndAudit` |
| 9 | **Audit** | Over the bound sentences: (a) `verifyFigures`, every figure located first in the texts its sentence is bound to: each occurrence brings the sentence or table row that carries it (a cell with its row label and column headings), and the claim is placed when that sentence shares one of its names, two of its specific words, the noun the figure qualifies, a word of the quantity the figure measures, every outcome that quantity names, or the name the question routes on; the located sentence must then not give the figure a different outcome, follow-up, statistic, responder threshold or denominator pairing; (b) the cohort guard, under a designated cohort every result-figure sentence must cite a cohort paper unless it names another study; (c) the rescue, a failing sentence's figures looked up in the full text and DA fields of the cohort papers, the pinned papers, the prior turns' papers and the retrieved resources, and the first paper carrying every figure beside the claim lends its marker (a citation the platform never made); (d) second-hand figures, a figure the cited paper carries only where it cites other studies is looked for first-hand elsewhere, and on a named-cohort or planning question a sentence left with one is removed; (e) the replacement, a still-failing sentence about the cohort or a pinned paper is replaced by that paper's own results sentence, verbatim and cited, only when it carries the same figure at the same time point beside the claim, at most one quote per sentence and three per answer, never over a decline; (f) the population qualifier the supporting passage frames ("In patients with psychiatric comorbidity, ...") carried into the sentence. | Deterministic. | Extraction endpoint; DA summary and key takeaways as texts of their own. | (none yet) | `answer-audit.ts`, `figure-rescue.ts`, `secondhand.ts` |
| 10 | **Gate** | `gateFigures`: a sentence whose figures failed is removed, except a table row, which keeps its place with each failing cell marked "not verified" and the rest of the row intact (D5-05); a figure sentence with no marker inherits the one cited text that carries every figure it states or is removed; a conclusion whose supporting sentences went goes with them; a dangling connective is stripped; the survivors are renumbered by first appearance. A denominator the answer paired differently from the located figure's own bracket is a failed figure (removed, or replaced by the paper's own sentence when it carries the same figure at the same time point), never a rewrite. Under a designated cohort or a planning question, result sentences from more than one paper each open with the paper they come from. A contraindication no cited passage states is removed (safety variant or a treatment-decision question). "X and colleagues" over a paper X did not write is rewritten to the paper's first author. Years are post-checked against every retrieved source's metadata and the cited texts. | Deterministic. | Resource metadata (`year`, `published`). | (none yet) | `answer-gate.ts`, `answer-audit.ts` `denominatorCorrections`, `stripUnsupportedContraindications`, `yearsUnsupported`; `ask-author.ts` |
| 11 | **Addenda** | Appended in italics: the removal note (figures named, and where they were found if a paper carries them beside other words), the paper's own figure for the question's outcome after a removal ("For the outcome asked about, [n] itself reports: ..."), a protocol's planned recruitment named as such beside the results paper's enrolment, the effect size a cited passage carries when a risk question got none, the study-design line that leads an answer grounded on a modelling or preclinical paper, the study designs in the sources' own words (clinical variant), the second-hand note, the corpus-boundary note for a study the question names that no held title carries, the author-scope note, denominators the passage gives for a bare proportion, and the drugs the sources flag that a which-drug answer left out; the denominators line only ever names an n the located passage gives in the figure's own bracket or cell. Evidence cards are re-pointed at the paragraph that carries the claims bound to each source (page kept when retrieval supplied it). | Deterministic. | Retrieval paragraphs with pages (`ScoredResource.passages`). | `sources` (re-chosen passages, weak uncited matches dropped), `citation` (renumbered), `audit`, `done { text, truncated? }` | `answer-gate.ts` `removalNote`, `effectSizeNote`, `designLead`; `evidence-passages.ts`; `ask-grounding.ts` `auditAddendum` |
| 12 | **Done, confidence and the quality tail** | `done` carries the gated text and goes out before the REMi judge answers; the page replaces the streamed text, releases the composer and saves the session. The judge started before `done` in the provider, capped at 8 s, and its `quality` event trails on the same stream. Confidence is audit-led: an unsupported figure, year or contraindication is Low; every figure found and at least half the sentences cited is High; removed sentences cap it at Moderate; the platform's groundedness may lower an audited verdict one step and never raise it, and never reaches High on its own. | REMi: one platform call, advisory. | The platform's REMi scoring. | `done` (9 to 30 s), `stage validating`, `quality` | provider `ask` tail; `apps/web/src/lib/confidence.ts` `assessConfidence`; `answer-marks.ts` for the badge |

**The retry policy (step 5 repeated, at most once).** A refusal, an answer the binding stripped
of every marker, or an answer the gate emptied buys one more platform ask, chosen for the reason
the pass failed (`ask-retry.ts` `nextRetry`): the general configuration when a supplements-only
intent's data sheets held no answer (`supplements`); the named paper alone, document-scoped with
its own Abstract, Results, Methods and Conclusion paragraphs as `extra_context`, when the question
names one the first pass never cited (`pinned`); the default configuration without the safety
prequeries when a 90 percent match was retrieved and the generator still declined
(`prequeries`); the follow-up without the earlier turns' papers when a turn scoped to them
refused, or when they crowded out the paper it asks about (`unpinned`); and for a terse question
of ten words or fewer that pinned nothing, the retrieved paper whose own text carries every name
the question uses and the most of its outcome words, read alone with its own paragraphs
(`ask-terse.ts` `topicPin`, D5-09: "ICV valproate seizure reduction - number?" refused with the
first-in-man paper fifth on the shortlist). The retry carries a firmer directive. Nothing has streamed by
then except the discarded attempt's `fallback` event, so the surface sees one answer. When no
retry applies, the decline stands, its closest-matches search already running.

**Follow-up turns** carry the earlier answers' cited resource ids and passages, and every
follow-up pins those papers (a prequery per paper on its `resource_filters`) and sends the
turns as chat `context` (D5-06, D4-07). A turn that stays within the earlier papers, referring
back ("that study", "back to the JME cohort", "each group") and naming no acronym or lexicon term
the session has not already discussed, is retrieved from those papers alone on the platform's
resource filter, with the papers' own paragraphs that carry the question's words (tables
included) as `extra_context`, so a figure in Table 1 is in front of the generator before it can
decline; if that scoped ask refuses, the one retry asks the whole collection. A turn that only
reshapes ("put the three drugs in a table") reads only those papers, leanly (no expansion, no
reranker, the earlier questions as scoped prequeries) with a budget sized for one row per earlier
answer; a turn naming a new drug is pinned to the old papers but not confined to them
(`ask-session.ts` `staysWithinPriorTurns`, `reformatBudget`). The study guard pins on
follow-ups too.

**Document chat** (`resourceId` set) skips routing, pinning and prequeries, sends the document's
pipe tables and key-resources block as `extra_context` and a document-chat prompt addendum, runs
the same binding and audit against the open document (badge "N figures checked · Checked against
this document's text") and never retries; its decline is document-scoped.

**An uncited figure answer on a question that names a paper** (loop 5 HC, D4-09): when the
platform attaches no citation at all to an answer that states figures, and the study guard pinned
a paper, the pinned paper is bound as the answer's source and the gate binds each figure sentence
to it when it carries every figure; what it does not carry is removed as usual, and an answer
nothing binds is still withheld.

## 2. The rules, and the findings that motivated each

Every rule below exists because a reviewer found the defect it prevents. The ids point into
`docs/EPREPO-ROADMAP.md` (P-findings, R-items) and `docs/persona-reports/dsouza-loop<n>.md`.

### Routing and grounding before generation
- **The grounding gate runs before generation, not after.** The platform reports its retrieval
  after the answer tokens, so a floor on that event appended a decline under an answer that had
  already streamed (R1; P6-01, P7-01, P8-01). The probe on the routed `-find` configuration
  costs under a second and lets the portal decline, or change configuration, before a word is
  generated. PR #6.
- **A supplements-only intent falls back to the default configuration** when its probe finds
  nothing strong (R6; P4-01, P4-02, P2-01). The `data` intent itself now reads the papers and
  their attachments (`not documentation, not media` plus a `prefer` pass on `format:supplement`),
  is offered to the classifier only for questions that name a table, supplement, data sheet,
  appendix, protocol document, peer review or raw data, and a results question routes to the
  papers by rule (D1-01, D1-02, D1-03, D1-11; PR #7).
- **A study named in the question is pinned** so retrieval cannot crowd it out (loop 1 section 5,
  D1-01, D1-02; PR #7), a pinned paper is read in depth with a pass per question clause
  (D2-05, D2-08; PR #11), a comparison retrieves once per named entity (D2-03; PR #11), a cohort
  the question describes is pinned from titles and summaries (D4-01; PR #17), and a pin survives
  to follow-up turns (D4-22; PR #17).
- **A relationship the collection holds no study of is declined as a boundary** rather than
  stitched from papers about other things (D3-12; PR #14).
- **Terse questions route by rule, decomposition needs eight words**: a five-word clinic question
  took 24 s through the classifier and five sub-questions (D4-08; PR #16).
- **One extra ask at most.** A refusal used to walk a chain of up to four platform asks and 37 s
  (D3-05; PR #13). The budget per question is one probe (the pre-flight finds, in parallel), one
  platform ask and one retry; a terse question reads a light context (twelve paragraphs, one
  neighbour each side, no graph walk) so its first word is not behind thirty thousand tokens of
  expansion (D5-08, loop 5).
- **A surname scopes retrieval only in an author construction** ("X's papers", "papers by X",
  "X et al.", "X and colleagues", "what did X find"): "Grant background: ..." was scoped to the
  one paper with an author called Grant and half the question declared uncovered (D5-07).
- **An exact lookup needs one entity that is the whole query**: "lamotrigine SUDEP" is a
  two-entity question for retrieval, "Dravet syndrome" and "SCN8A epilepsy" are lookups (D5-17).
- **A terse question that pinned nothing reads the paper that carries its names** before it is
  declined or withheld: the retrieved paper whose own text carries every acronym, lexicon term and
  capitalised name of the question and the most mentions of its outcome words, never a
  preclinical paper for a question about people (D5-09).
- **Every follow-up carries the earlier papers**, and one that stays within them is answered from
  them alone with their own paragraphs in front of the generator (D5-06, D4-07, D4-22).

### Streaming
- **The model's own reference block is never forwarded**, and the sentinel phrases ("the context
  does not provide", "Not enough data to answer this", "(inference)") are rewritten or removed on
  the stream and in the final text (R2, R19; P3-12, P2-05, P8-08, P9-17, P10-11; PR #6). A
  newline releases nothing past itself so a sentinel opening a new line is caught whole (PR #12,
  from PR #10's note).
- **A sentence is released the moment its stop arrives** rather than when the next sentence
  starts, so a one-sentence answer is not held until the badge (D3-05; PR #13).
- **The first complete sentence is verified while streaming** against the probe's papers, whose
  texts were fetched during generation; the audit's own fetches are then cache hits and the
  auditing stage takes milliseconds (D4-08; PR #16).
- **A truncated generation is cut back to its last complete sentence** and the surface told; a
  closed table row and a list item ending on a figure are complete (D1-04, D4-06; PRs #8, #16).
- **Nothing on screen reads as the answer before it is checked.** Streamed text renders in the
  checking style with an "Unchecked - still streaming" badge from the first token, the "First
  sentence verified" line appears only under visible text, and the gated text lands in full ink
  (D5-08, D4-08).
- **Format leaks are removed**: code fences, empty headings, header-only tables and the
  "(inference)" token (D5-16, D5-05).

### Binding
- **Sentence-level binding replaces the platform's paragraph-level markers** (R2; P2-02, P2-03,
  P2-04, P7-02, P7-03, P7-04, P10-03, and twenty more; PR #6). Markers beyond the citation count,
  markers on headings and markers that move on `done` were all the same defect.
- **The names a claim hangs on must be in the text**: both of two, 60 percent of many, because a
  drug list cited to a paper naming one drug of four was the commonest misbinding (PR #6).
- **A supporter must carry one of the sentence's rare words** (words at most a third of the cited
  texts carry): a levetiracetam paper covers "levetiracetam ... efficacy ... criteria" and still
  says nothing about non-inferiority (D1-16; PR #8).
- **A name the question uses must be in the cited text**: a fenfluramine trial never mentions the
  Melbourne cohort (D2-01, D2-04, D2-13; PR #12). A study the question names by acronym must be
  in every cited text or its title (D1-16 residual; PR #12).
- **A design sentence binds only to a text that states the design**: the LGS criteria paper was
  cited for "a retrospective, nested case-control design" (D4-07; PR #16).
- **A claim without a figure is placed by its key phrase**, not by words scattered over forty
  pages (D3-09; PR #14). **A short list item is carried when the text has every one of its
  words**, and a list item inherits the nearest marked line's marker (D4-20; PR #17).
- **A pinned paper keeps its markers below the display floor**: the BREATHS protocol scored 10
  percent and lost all fifteen (D4-20; PR #17).
- **A decline sentence carries no marker** and a wholly declining answer stands as the decline
  state (D3-15; PR #14).

### The figure check
- **A figure must sit beside the claim's own terms**, not merely somewhere in the paper: "21 to
  45%" bound to a paper carrying only the 45 percent, RFTC figures lent to LITT, register bands
  attributed to EURAP (R3; P1-01, P3-01, P9-01, P10-01; PR #6). The window is the figure's
  sentence and the ones before it, never the one after.
- **The matcher must not cry wolf.** Loop 2 found it flagging BREATHS's own 220 and 110,
  "Thirteen", "11 p.m." and "1.66 h" (D2-07; PR #12), and loop 4 found "2,709" removed because of
  a comma (D4-01; PR #17). Normalisation now covers ranges and leading-zero decimals (R5, P9-14),
  number words, PDF hyphenation, "N (P)" table cells, abbreviated units and clock times (D2-07),
  space and comma thousands groups, thin spaces, PDF glyphs ("1¢66 § 0¢52 h", "8·29"), decimal
  proportions ("F2 is 0.37" carries 37 percent), a time unit after its interval (D4-10, D4-19;
  PR #17), and the abbreviations a paper defines ("perampanel (PER)") (D1-12; PR #8). Fifty
  figure-and-passage rows from the four reports are the regression set
  (`figure-normalisation.test.ts`).
- **The outcome and the follow-up must match**: "DRE occurred in 31%" cannot vouch for a relapse
  claim, and "after a median follow-up of 700 days" is not "at 12 months" (D2-02, D2-07; PR #12).
  "All p < x" is checked per listed outcome (D4-13), an "adjusted" ratio or a "median" is placed
  only by a passage that says so (D4-18), and a sample size is placed by its noun (D3-02; PRs
  #14, #17).
- **The figure audit is a gate, not a footnote** (loop 2 section 6; D2-02, D2-03, D2-12; PR #12).
  A figure the cited passages do not carry beside the claim used to stay in the prose with an
  italic line under it listing bare numbers.
- **A table row is never dropped for one cell.** The failing cell reads "not verified", the
  verified cells stand, the row keeps its marker (or inherits the text that carries its passing
  figures), and the addendum names the figures; the table turn used to come back with one row of
  three (D5-05, D4-06).
- **Locate first** (loop 5 section 6; D5-01 to D5-04; PR #20). Loop 5 found fourteen sentences
  the cited paper carried word for word removed ("80% of EDs in Group 1 were clustered during the
  sleep period", the "937 (52%)" and "Number deceased 60 87" cells, "The remaining 24 participants
  completed", "odds ratio = 10.00, 95% CI (1.68, 59.31)" inside a bracket with a semicolon, an
  "0⋅70" the extraction wrote with the dot operator) and seven wrong quantities under a clean badge
  (a "50% responder rate" read as a rate of 50%, an all-cause discontinuation as an adverse-event
  one, a worsening-frequency rate as seizure freedom, a share paired with another population's n).
  Both were the same defect: a window of nearby words was tested instead of the sentence the figure
  lives in. Now every occurrence of a figure is located and judged as its own sentence or table
  row (`locateFigure`); the claim is placed when that sentence shares the claim's quantity words,
  every outcome family the quantity names, or the question's routing entity, and a table cell by
  its row label and column headings or by a "13 (50%)" pair the claim states together
  (`quantityPhrase`, `countWithShare`); and the located sentence must agree on the responder
  threshold (`isThresholdAt`: a round "50% reduction" is a definition, "45.7% reduction" a result)
  and on the n the claim pairs in its own bracket (`pairedNsAt`: the located bracket, or an n in
  the located paragraph when it has none). A name the figure's own subject gives it must still be
  in the window unless the paper is about that name (it abbreviates it or names it throughout:
  `isSubjectOf`), so an RFTC review's 76% is still not LITT's. A figure's clause, not its
  sentence, decides which question names and follow-up apply to it (a comparison sentence gives
  each study its own figure). Number normalisation now covers the dot operator, British and
  American spellings ("enrolment", "generalised", "favourable"), "IQR" for "interquartile", a
  lower-cased interval label ("(iqr 256, 967) days"), a bracket-aware sentence end ("(FAS; n =
  1111)") and a duration found as the bare number of a table row whose label names the unit
  ("Follow-up duration, y").

### The cohort guard, the rescue and the replacement
- **The cohort guard applies at the question's level.** Loop 3 found the anti-NMDAR hazard ratio
  under a question about the LGI1 cohort with a clean badge (D3-01; PR #14), and loop 4 found a
  Dravet series' "25 of 205" under the video-EEG mortality cohort riding through four turns under
  High confidence (D4-01, D4-02; PR #17). A designated cohort is exactly its pinned papers; a
  drug or syndrome term never widens it; a paper whose summary merely mentions the cohort is not
  one of them. **It never fires against the paper the question names or describes** (loop 5
  D5-02; PR #20): under a cohort the question names by drug, a paper the question pinned is a
  cohort paper, a medication term is also looked for by stem in a paper's opening pages
  ("valproic acid (VPA)" is the valproate paper), and a sentence the guard fails is looked up in
  the cohort papers the answer cited for something else before it is removed (the SUDEP
  case-control paper's own "101 SUDEP cases and 199 living epilepsy controls").
- **Two populations under one question are named** (loop 5 D5-12, TDE; PR #20): under a
  designated cohort or a planning question, when the result sentences the gate kept come from
  more than one paper, each sentence that names no study of its own opens with the paper it
  comes from ("In *Infradian rhythms ... in healthy adults*, 70% (369/525) ..." beside "In
  *Multiday cycles of heart rate ...*, participants with epilepsy documented 3,619 seizures"), by
  the study acronym its title carries or the title itself (`studyLabel`).
- **The rescue looks a figure up before withholding it.** Loop 3 found the gate withholding
  correct figures from retrieved but uncited papers (C1, R1, TD1, E2: 71.1 percent and 1644
  "could not be verified" a minute after the portal cited them) because the audit only saw the
  paragraphs the platform happened to cite (D3-02; PR #14). The pool is the cohort papers, the
  pinned papers, the prior turns' papers, then the retrieved resources by relevance, with each
  paper's DA summary and key takeaways as a text of its own. A second-hand figure is looked for
  first-hand before it is judged (D4-15; PR #17).
- **The replacement is restricted.** Loop 4 found the "paper itself reports" step swapping a
  correct 12-month "64.2% (n = 4201)" for a ">12 months, 29.5%" sentence, replacing an honest
  decline with an exposure quote from another paper, and stitching an irrelevant SUDEP sentence
  into a comparison (D4-03, D4-04, D4-14; PR #17). Now: same figure, same time point, beside the
  claim, from a cohort paper under a designated cohort, at most one quote per sentence, never
  over a decline, and the "paper's own finding" after a second-hand figure must share the
  question's outcome and add a figure the answer does not already state.
- **An emptied answer is retried on the cohort paper before it is declined**, and a decline about
  who was in a named study is asked on that paper's resource filter first (D4-09, D3-01; PR #17).
- **The paper's own figure for the question's outcome is offered after a removal** when the
  model's figure differs from it (loop 5 D5-14; PR #20): the consortium paper's "At 12 months, a
  favourable mRS (≤ 2) occurred in 154 (67%) patients" after an "80% (n = 231)" no paper carries,
  as an italic line naming the paper, cited, never as a substitute for the removed sentence, at
  most two per answer.

### Second-hand figures and sections
- **A figure the cited paper carries only in its Introduction or Discussion is that paper citing
  other studies** (D2-06, D2-14, D3-08; PRs #11, #14). Table rows, figure legends and a line of
  bare statistics under its label are first-hand wherever the extraction placed them; a figure
  the paper's own sentence attributes to earlier work is second-hand wherever it sits; "Methods
  and analysis" reads as Methods (the BREATHS protocol's 110 was a false flag). On a named-cohort
  or "what should I assume" question a sentence left with a second-hand figure is removed, not
  annotated (D4-02, D4-12; PR #17). **The judgement reads the located passage**, not every
  occurrence of the number in the paper (loop 5 D5-15; PR #20): the placebo-response paper's own
  "22% in the lower group" in its results no longer clears the introduction's "over 22% after
  2020" the answer repeated; Markdown headings ("## Introduction:") section a text the platform
  extracted from HTML; and a block of short lines is figure or graphical-abstract text, the
  paper's own data ("312 saliva samples collected" was a false flag).
- **An assessment's answer key and a briefing's key takeaway are never a second-hand figure**
  (loop 5 D5-10; PR #20): a quiz question whose correct answer or explanation states a figure its
  source paper carries only where it cites other studies is dropped and counted
  (`omitted_secondhand`, said on the page), and a takeaway whose figure every referenced paper
  carries only second-hand is dropped and counted (`takeawaysSecondhand`).

### Denominators, effect sizes, designs, years, drugs, authors
- **Every proportion carries its n and analysis set** by prompt rule, and the audit lists the
  ones that do not with the n the passage gives (D1-14; PR #8). A denominator pairs only within
  the figure's own bracket or table cell, never the nearest n, never for a threshold, an SMR, an
  HR or a CI (D2-07, D3-13, D4-05, D4-11; PRs #12, #14, #17). The 95 of a confidence interval and
  an effect size are not proportions. **The body is never rewritten** (loop 5 D5-03, D5-13; PR
  #20): loop 5 found the corrector replacing a correct "11% (3/28)" with a frontal-lobe row's "4
  of 36" and a correct "(n = 121)" with a nested "(56 (46.3%))". The n a sentence pairs with a
  share in its own bracket is now part of the figure check (`pairedNsAt`), so a pairing the
  located passage contradicts fails the figure and the sentence is removed or replaced by the
  paper's own sentence; the denominators line reads only the passage the audit located the
  figure in, adds an n only from that passage's own bracket or cell, and says nothing for a quoted
  sentence, a share the paper gives as a decimal proportion ("F1 = 0.8"), a confidence interval
  or an effect size.
- **A protocol's sample size is planned recruitment, not enrolment** (loop 5 D5-11; PR #20): a
  kept sentence that states a planned sample from a paper that is a protocol (its masthead, its
  title, or methods in the future tense) gets the note "[n] is the study protocol: the numbers it
  gives are the planned recruitment, not the enrolment", with the results paper's own enrolment
  sentence quoted when the answer also cites one.
- **The effect size a passage carries is stated** when a risk question got none, named for what
  it is for, covariate lists skipped (D2-09, D3-10; PRs #12, #14).
- **Study design first**: a modelling, simulation or preclinical source that the first citing
  sentence did not name as such leads the answer with a design line, on every intent (D2-11,
  D1-15; PR #12); the clinical variant names each source's design in the source's own words
  (D1-15; PR #8).
- **Years come from resource metadata** and every four-digit year is post-checked; the recency
  prompt receives the retrieved resources' publication years (R3; P10-12, P8-10; PR #6).
- **A drug called contraindicated must be called that by a cited passage**, and a drug the
  sources flag is never dropped from a which-drug answer (R3, R5; P1-01, P3-13; PR #6). A
  drug-safety prequery fires only for a medication entity on a treatment-decision question, so
  "NMDAR", "LGI1" and "JAMA" are not drugs (P9-14, P9-15; PR #6).
- **"X and colleagues" over a paper X did not write is rewritten** to the paper's first author,
  and a named author scopes retrieval to that author's articles (D1-05, D2-23; PRs #8, #11).
- **A study the question names that no held title carries gets a boundary sentence** ("This
  collection does not hold SANAD II itself ...") (D1-16; PR #8).

### The decline
- **A refusal always shows the closest matches, labelled not used**, named in the text, from a
  semantic find re-ranked by overlap with the question's outcome noun, with conference
  proceedings, attachments and (for a question about people) preclinical papers dropped, or "no
  close match" when nothing clears the floor (R8; P8-02, P9-20; D2-10, D3-19, D4-23; PRs #6,
  #11, #13, #16).
- **An answer that states figures with every marker stripped, or that the gate emptied, is
  withheld** with the figures named, never shown as bare prose (D1-02, D2-12; PRs #7, #12).

### Confidence
- **Confidence is led by the check, not the platform score.** Loop 1 found groundedness 1 on a
  correct answer and 5 on a wrong "not in corpus" one (D1-13; PR #8); loop 2 asked that the
  platform score never raise the verdict (D2-15; PR #12). The REMi scores are shown as the
  platform's self-assessment (D3-16; PR #14). "High confidence" is earned only by the check.
- **The reader sees "Checking N figures" until the gated text lands**, and the badge then reads
  what happened: "N figures checked", "· 1 sentence removed", "· 2 sentences replaced", with the
  figures and where they were found in the tooltip (R5, D2-17, D3-16; PRs #6, #12, #14).

## 3. Platform features the layer leverages

| Feature | Where |
|---|---|
| Stored search configurations (`portal-intent-<id>` `-ask` and `-find`, `portal-search`, `portal-ask`, `portal-doc-*`) with label filters, features and reranker centrally managed | Route, probe, platform ask. `docs/INTENT-ROUTING.md` section 4. Re-ensured through `POST /api/admin/t/:slug/search-configs/ensure`. |
| `prequeries` strategy: each entry is a full find request with its own `resource_filters`, `top_k`, `filters` and `weight` (ten at most) | Pinned papers, question clauses, prior-turn papers, preferred labels, sub-questions. `groundingPrequeries`. |
| `resource_filters` on `/ask` and `/find` | Document chat, the pinned retry, author scope, reformatting turns, the per-entity finds, the pinned targeted finds. |
| `extra_context` (twelve blocks at most) | Document tables and key-resources blocks, prior turns' passages and answers, publication years for a recency question, a pinned paper's own sections on the pinned retry. |
| Chat `context` | Follow-up turns (USER and AGENT text). |
| `citations: true` and the platform's paragraph-level attribution | The starting point of the binding; a citation's page and paragraph for the reader. Never combined with `answer_json_schema` (platform 500). |
| `rag_strategies`: `full_resource`, `neighbouring_paragraphs`, `graph_beta`, `prequeries` | Per intent (`answer.strategy`, `answer.graph`). `full_resource` is never sent beside a wide paragraph budget. |
| Request-level `top_k` (wins over the configuration's) and `max_tokens` | Author scope (60), reformatting turns (40 paragraphs, 1800 tokens). |
| The extraction endpoint (a resource's extracted text, page by page) | Every cited text, the pool texts, the evidence-card passages, the document-chat tables. Cached per process. |
| Data-augmentation fields (summary, key takeaways, curated title, headline) | Cohort matching on summaries, the rescue pool, merchandised citation chips, closest-match ranking. |
| `mode: semantic` find | The closest matches a decline names. |
| `answer_json_schema` | The classifier, the decomposition and briefings. The structured-statement path was trialled for answers in loop 4 and not adopted (section 5). |
| REMi quality scoring | The trailing `quality` event; advisory only. |
| Resource metadata (`year`, `published`, `authors`, `doi`, `pmcid`, `pmid`) | Year checks, author scope and attribution, identifier lookups. |

## 4. What is deterministic and what is a model call

Deterministic, string matching over the platform's extracted texts and fields, no model in the
loop: routing rules and identifier resolution; the study guard; prequery selection; the stream
shaping; the first-sentence verifier; binding; every audit check; the cohort guard, rescue,
replacement and qualifier; the gate; the addenda; evidence-card passage choice; closest-match
ranking; the confidence verdict. These are all unit-tested without the platform.

Model calls, all the platform's own: the intent classifier (only when no rule fires; memoised);
the decomposition into sub-questions (evidence-seeking questions of eight words or more); the
answer generation itself (once, plus at most one retry); the "interpreted as" rephrase (best
effort, first turn only); the REMi quality judge (capped at 8 s, advisory). None of them can add
support to a sentence: a marker is kept, inherited or lent only where a cited or retrieved text
verifiably carries the claim.

## 5. Known limits

The lessons of loop 4 (`dsouza-loop4.md`, sections 2, 3 and 6), and what remains open after
PRs #16 and #17:

- **Substitution can be wrong even when each check passes.** The loop 4 replacement step
  produced errors of its own (D4-03, D4-04, D4-14). It is now restricted to the same figure at
  the same time point from a cohort paper, but a quote chosen by outcome and figure can still be
  beside the point of a comparison sentence (T2 in loop 3, one bullet). The safer path is
  removal with the reason stated, which is what the layer now prefers.
- **Over-removal is the price of the gate.** A correct figure the platform did not cite and the
  rescue pool does not carry is removed. N06's own "154 (67%)" is offered under the removal as the
  paper's own figure for the outcome, never as a substitute; the honest removal stands. The pool
  is bounded (eight cited texts, eight further texts) for latency.
- **A figure the paper's own abstract states loosely passes.** Loop 5 PD read "In 10 years, 82723
  Australian adults had incident epilepsy, whereas 125223 formed the prevalent cohort" as a
  ten-year projection of 125,223; the located sentence carries the figure beside "10 years" and
  "Australian adults", and only the results section says the 125,223 is the 2024 base. A
  deterministic check that reads one sentence cannot overrule the abstract's own wording.
- **The population qualifier applies only when every occurrence of the figure in the bound text
  opens with the same frame**, so a figure a paper gives twice (whole cohort and subgroup) is
  left unqualified (D3-07 for N02, partly open).
- **A generator label the paper does not use** ("overall" for a stratum the paper never reports
  as overall, EB in loop 4) is not corrected: deciding that would need a rule about strata the
  paper does not report.
- **Stray extra markers on multi-claim sentences** ("[1][2]" where one paper carries the claim)
  remain (D3-09, partly).
- **The platform's retrieval stage (6 to 10 s on a pinned question) is the latency floor.** The
  route chip is on screen at 0 s and the sources shortlist at 0.8 to 2.6 s; a sub-6 s first
  sentence is not reachable from the application (D3-05, D1-09).
- **The REMi judge often hits its cap** on long contexts and returns no scores; the answer is
  complete and checked before it, and the confidence label does not need it.
- **Structured statements (`answer_json_schema` with `{claim, figure, time_point, population,
  study}`) were trialled on twelve questions and not adopted**: 16 of 24 statements verified, but
  the path fabricated a Melbourne incidence the prose path declined, mis-assigned a study, and
  cannot carry paragraph citations (`citations` cannot be combined with `answer_json_schema`).
  Kept as a candidate for a per-statement "figures table" view (PR #17).
- **Two of an author's papers reach the grounding set only through reference-list paragraphs**
  (his papers cite each other), so they are neither shown nor cited; a paragraph-level content
  filter the platform does not offer, or a body-only re-retrieval per paper, would be needed
  (D1-05 residual; PR #11).
- **The layer only ever verifies what the extraction holds.** A figure in an image-only table,
  or a paper with a garbled extraction, cannot be found; the Extraction Lab is the tool for that.

## 6. Tests

All deterministic modules are unit-tested next to the code (`deno task check` runs them; 417 at
PR #17). The ones that cover the trust layer:

| Test file | Covers |
|---|---|
| `apps/api/src/intent-router.test.ts` (24), `catalog-lookup.test.ts` (14) | Rules, gene shapes, identifiers, author-year, results and terse rules, rules-only classifier, identifier and author resolution |
| `apps/api/src/study-guard.test.ts` (11), `ask-entities.test.ts` (17), `ask-author.test.ts` (14), `ask-prequeries.test.ts` (7), `ask-session.test.ts` (12), `ask-retry.test.ts` (9), `ask-terse.test.ts` (4) | Pinning and cohort designators, per-entity pins and question clauses, author scope, author constructions and attribution, prequery gating, follow-up context, follow-ups that stay within the earlier papers, reformatting and its budget, the single-retry policy, the terse topic pin |
| `apps/api/src/answer-shape.test.ts` (32), `ask-stream-verify.test.ts` (8) | Reference-block stripping, sentinels on stream and text, truncation, table rows; the first verified sentence |
| `apps/api/src/citation-binding.test.ts` (26) | Sentence binding, entity and rare-word rules, design terms, list items, table-row markers, renumbering |
| `apps/api/src/answer-audit.test.ts` (32), `figure-normalisation.test.ts` (13, fifty figure rows from the four reports), `figure-rescue.test.ts` (18), `secondhand.test.ts` (12), `answer-gate.test.ts` (15), `loop4-guards.test.ts` (17), `loop5-locate.test.ts` (28, the loop 5 figures: located sentences and table rows, quantity phrases, thresholds, pairings, the cohort and stitch rules, offered findings and the protocol note), `ask-grounding.test.ts` (10) | Figure matching and normalisation, outcome and follow-up conflicts, denominators, contraindications, years; the rescue, cohort guard and replacement; section classification and second-hand figures; the gate, removal note, effect sizes and design lead; the loop 4 guards; locate first; `bindAndAudit` end to end with stubbed texts |
| `apps/api/src/evidence-passages.test.ts` (6) | The card passage that carries the bound claims |
| `apps/api/src/app.test.ts` (87) | The `/ask` route with a stub provider and management: routing, the grounding gate, fallback, pinned retry, withheld decline, the contraindication strip, document chat, author lookup, prequery expectations, the audit event |
| `packages/retrieval/src/providers/arag/intents.test.ts` (12), `ask-structured.test.ts`, `display.test.ts` | Configuration names and filters, prequery construction, structured asks, refusal detection |
| `apps/web/src/lib/confidence.test.ts`, `answer-marks.test.ts`, `answer-text.test.ts` | Audit-led confidence, the badge and inline marks, marker rendering |
| `packages/core/src/docs.test.ts`, `apps/web/src/pages/HowItWorksPage.test.ts` | The in-app description of the check stays in step with the page |

Live verification is part of every PR: the persona's own questions re-run against the live box
with each figure checked against `/resources/:id/content`, pasted into the PR body (PRs #6 to
#17), plus headless screenshots at 1440 px and a true 390 px viewport, light and dark, and a
22 px root font.

## 7. Files

```
apps/api/src/app.ts                     the /api/t/:slug/ask route (steps 1 to 12, the retry loop)
apps/api/src/intent-router.ts           routing rules, classifier threshold, decision shape
apps/api/src/catalog-lookup.ts          identifier, author and person-name resolution against the catalogue
apps/api/src/study-guard.ts             study names, eponyms, described cohorts -> pinned papers
apps/api/src/ask-entities.ts            per-entity pins, question clauses
apps/api/src/ask-author.ts              author scope, attribution correction, paper listings
apps/api/src/ask-prequeries.ts          which mandatory prequeries fit; medication and treatment-decision tests
apps/api/src/ask-session.ts             follow-up context: prior ids, passages, reformatting turns
apps/api/src/ask-retry.ts               the one extra ask and its reason
apps/api/src/ask-terse.ts               the topic pin for a terse question that pinned nothing
apps/api/src/answer-shape.ts            reference-block stop, sentinel rewriting, truncation, forwardable slices
apps/api/src/ask-stream-verify.ts       the first verified sentence while streaming
apps/api/src/ask-grounding.ts           bindAndAudit: the orchestration of steps 8 to 11; cited texts; context blocks
apps/api/src/citation-binding.ts        sentence splitting, supportScore, binding and rendering
apps/api/src/answer-audit.ts            figure normalisation and matching, denominators, contraindications, years, designs
apps/api/src/figure-rescue.ts           cohort guard helpers, the rescue pool, quotes and replacement cues
apps/api/src/secondhand.ts              section-aware reading, second-hand figures and the note
apps/api/src/answer-gate.ts             gateFigures, removal note, effect sizes, design lead
apps/api/src/evidence-passages.ts       the passage each evidence card shows
apps/api/src/docs-answer.ts             the Help assistant's sentinel rewriting (docs scope)
packages/retrieval/src/prompts.ts       variant preambles, the denominator and design rules
packages/retrieval/src/providers/arag/index.ts   ask(): the platform request, groundingPrequeries, stream events, REMi
packages/core/src/index.ts              AskEventSchema (route, sources, searched, fallback, delta, verified,
                                        stage, citation, audit, quality, done), Citation, ScoredResource
apps/web/src/pages/AskPage.tsx          event handling, the checking state, the verified line, done replacing the text
apps/web/src/lib/confidence.ts          audit-led confidence
apps/web/src/lib/answer-marks.ts        the badge and inline marks
apps/web/src/components/AnswerStream.tsx, QualityGauge.tsx, StageTimeline.tsx, EvidenceTable.tsx
```

## 8. The `AskEvent` stream, in order

`route` (or two `route`s when the classifier follows a rule-less start), `searched?`,
`fallback?`, `sources` (probe shortlist), provider `stage`s, `sources` (grounding set),
`interpreted?`, `delta`s with `verified?` among them, `stage auditing started { figures }`,
`stage auditing completed`, `sources` (re-chosen passages), `citation`s (renumbered), `audit`,
`done { text, refused, truncated? }`, `stage validating`, `quality?`. A decline is `sources`,
`delta`, `done { refused: true, text }`, with `audit` before it when the gate emptied an answer.
