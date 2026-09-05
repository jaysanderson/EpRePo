# EpRePo roadmap and bug list - from the ten-persona evaluation

**Date:** 4 September 2026 · `localhost:8787/t/eprepo` · 981 resources
**Method:** ten autonomous Fable review agents, each role-playing one persona from
`docs/EPREPO-PERSONAS.md`, used the live portal for real (Ask via route then ask, Search,
Library, resource pages and document chat, plus two or three secondary surfaces each), verified
every cited number, drug, gene and year against the cited resource's extracted text, and ran
headless visual passes at 1440 px and 390 px. Their full reports, with verbatim evidence, sit in
`docs/persona-reports/p1.md` to `p10.md`. Finding IDs below (`P3-05`) point into those reports.

The corpus is not the whole literature. A clean "the corpus does not cover this" was scored as
coverage, not a defect.

## Headline

| Severity | Count | Meaning |
|---|---|---|
| P0 | 11 | Fabricated or misattributed figure, drug or year carrying a citation marker |
| P1 | 57 | Blocks the persona's job or breaks trust in a way they noticed |
| P2 | 95 | Wrong or misleading but workable |
| P3 | 66 | Polish |
| Total | 229 | across 10 personas, 145 Ask questions, 70 searches, 60 document-chat questions |

Every persona said the same two things. **Single-paper work is excellent**: document chat was
correct on 55 of 60 verified questions, resource pages carry real titles, bylines, DOIs and a PDF
that opens at the cited page, and honest declines on out-of-corpus questions worked in 19 of 21
tries. **Corpus-wide Ask is not yet trustworthy claim by claim**: in 24 of 145 answers a number,
drug, year or species was attributed to a cited paper that does not contain it, and citation
markers point at the wrong paper often enough that every persona stopped trusting the `[n]`.

Nobody would put an Ask answer in front of a patient, a family, a registrar or a grant panel
without opening the PDF. Everybody would use Search, Library and document chat again tomorrow.

## Review 2 regression status

| Item | Status |
|---|---|
| P0-1 Dravet contraindications must name lamotrigine | Holds in every run (API, 1440, 390) |
| P0-2 Valproate dose-band figures fabricated | Fixed. All six figures verified in the Vajda register paper. A new P1 (P9-01): the answer stitches the 2005 register's bands into "the 2024 JAMA Neurology study" |
| P0-3 First seizure and driving fabricates 21 to 45% | **Regressed in the browser path.** General intent, seven markers, none of the seven cited texts contain the figure (P10-01). Via the API the figure is grounded only as an AAN quotation inside a 2017 PTE review |
| P1-9 Anti-NMDAR 28% relapse "may be misread" | Portal was right. 28% is verbatim in Seery 2025; the review-2 flag was the reviewer's misread |
| P1-10 Library first screen is 53 videos | Fixed (opens on 655 articles) |
| P1-6 Summary-matched "Open PDF" with no highlight | Still present (P3-16, P1-07) plus a new off-by-one page bug (P3-05) |

## Delivery status (4 September 2026, evening)

Four implementation batches, each in its own worktree and pull request into
`feat/eprepo-portal`, reviewed and merged in order (PR #3 routing, limits, graph and
precomputed questions; PR #4 secondary surfaces; PR #5 Library, facets, layout, dark mode and
copy; PR #6 the Ask trust layer, built on the earlier batch-1 branch). Gates green on every
merge (311 tests at the end), each batch visually verified at 1440 px and 390 px, PR #6 in light
and dark.

| Status | Items |
|---|---|
| Done in application code | R1, R2, R3, R4 (app half), R5, R6 (fallback half), R7, R8, R9, R10, R15, R16, R17, R18 (viewer dark toggle), R19, R20 (docs ingested and health probe), R21, R22, R23, R24, R25, R26, R27 |
| Still open, enrichment or platform work | R6 classifier description and `portal-intent-data` configuration; R4 reference-paragraph labelling at ingestion and `filter_expression` exclusion; R11 Kind re-run; R12 topic re-run and `multiple` on the labelset; R13 media and supplement re-summarising, DOI dedupe at load; R14 graph slice depends on the `kg-eprepo` agent finishing |
| Known residue | The generator still refuses twice on some strong matches (the decline now names the sources); the REMi quality judge often times out at 12 s (no longer blocks the answer); assessment stems remain mostly definitional; text-only ingests have no thumbnail |

## Delivery status: the D'Souza test-fix loops (4 to 5 September 2026)

After the four batches, one persona (Prof Wendyl D'Souza, `docs/PERSONA-DSOUZA.md`) ran a
test-fix loop: a full session on the live portal, a scored report with numbered findings, then
fixes in parallel worktrees and pull requests, then the next loop on the merged result. The
score is the persona's impact score out of 10; the bar is 9 or higher with no open P0 or P1.
Each report ends with a "fixes" section recording what its PRs closed. The layer these loops
built is described in `docs/TRUST-LAYER.md`; each PR has an entry in `docs/CHANGELOG-EPREPO.md`.

| Loop | Score | Open P0 / P1 | What the loop found | What its fixes did | Report and PRs |
|---|---|---|---|---|---|
| 1 | **4 / 10** | 2 / 9 | Any question asking for a number routed to a supplements-only configuration that excluded the primary paper (BREATHS became a 98-participant trial, UMPIRE a retrospective series, PERMIT "not in the collection"); a Kind facet calling cohorts and a rat study RCTs; a "figures checked" badge flagging correct figures; 12 to 27 s to the first word. | The `data` intent reads the papers plus attachments, the classifier is gated, results questions route by rule, a named study is pinned into the grounding set; search and ask route without waiting on the classifier; truncation, author scope and attribution, evidence cards on the figure's paragraph, audit-led confidence, denominators, study designs, boundary sentences; a rule-first study-design classifier (RCT count 110 to 12); briefing references, build stamp, tap targets, export notices. | `docs/persona-reports/dsouza-loop1.md`; PRs #7, #8, #9 |
| 2 | **6 / 10** | 4 / 4 | Every loop 1 question now right, but cross-paper and cohort questions still carried figures the papers do not hold (a fenfluramine trial's SUDEP rate as "the Melbourne cohort", a "71.3% (N = 867)" retention that exists nowhere, 80% for a cohort whose paper says 67%), acknowledged only by an italic footnote; the audit flagged correct figures ("Thirteen", "11 p.m.", BREATHS's 220 and 110) and attached denominators to hazard ratios. | The figure audit became a gate on the text (a sentence whose figure the cited passage does not carry beside its outcome and population is removed and the removal stated; an emptied answer is withheld); the matcher stopped crying wolf (zero false flags on the loop's 24 regression figures); a cohort, drug or study the question names must be in the cited text; pinned-paper depth and per-entity retrieval; effect sizes and design lines; audit-led confidence with the platform score never raising it; briefing and synthesis grounding; closest matches from the semantic ranking; Help voice, sessions rail, lookup cards, kind rules, tap targets. | `docs/persona-reports/dsouza-loop2.md`; PRs #10, #11, #12 |
| 3 | **7 / 10** | 1 / 4 | No fabricated figure among 173 checked, but the gate swallowed correct ones (71.1% and 1644 withheld a minute after the portal cited them) because the audit saw only the paragraphs the platform cited; the anti-NMDAR hazard ratio under an LGI1 question with a clean badge; a full-name search answered with a paragraph about honoraria; 10 to 15 s of "Writing the answer" and 37 s refusals. | The rescue looks a figure up in every retrieved paper and the generated fields before withholding it; the cohort guard restricts figure sentences to the named cohort's papers; a removed sentence about a named paper is replaced by that paper's own sentence; briefings get the same audit; second-hand notes only for Introduction and Discussion; refusals capped at one extra ask (37 s to 9 s); sentence-by-sentence streaming; full-name and initial author lookups with declarations excluded; phone reader, entity page, genetics kinds, closest-match ranking. | `docs/persona-reports/dsouza-loop3.md`; PRs #13, #14 |
| 4 | **6 / 10** | 2 / 6 | The new replacement step made errors of its own: a correct 12-month "64.2% (n = 4201)" swapped for a ">12 months, 29.5%" quote, an honest decline replaced with an exposure quote from another paper; the cohort guard failed on a described cohort (a Dravet series' "25 of 205" reported as the video-EEG mortality cohort through four turns under High confidence, "2,709" removed because of a comma) and on a second-hand rate footnoted instead of removed; a five-word clinic question took 24 s through five sub-questions. Direction set: simple and honest over clever. | Number normalisation unit-tested over every figure in the four reports; a question-level cohort guard (a described cohort is pinned from titles and summaries and is exactly its papers; second-hand figures on a named-cohort question are removed); substitution only for the same figure at the same time point, never over a decline; denominators from the figure's own bracket with corrections stated; the first sentence verified while streaming; terse questions routed by rule; session context to turn 4 and reformatting follow-ups; author lookup from metadata only; Help two-part questions; document chat audited. Structured statements through `answer_json_schema` trialled and not adopted. | `docs/persona-reports/dsouza-loop4.md`; PRs #16, #17 |

Left for loop 5 (from the loop 4 fixes section): a generator "overall" label on a stratum the
paper does not report; N06's own 154 (67%) no longer quoted because the model's 80% is a
different figure; a few stray extra markers on multi-claim sentences; the platform's own
retrieval stage (6 to 10 s) as the latency floor. Loop 5 has not been run; the score after PRs
#16 and #17 is not yet measured.

## Roadmap

Ordered by what it takes to make an Ask answer safe to repeat. Each theme is one piece of work
with the findings it closes. Phases 0 and 1 are the clinician-pilot gate.

### Phase 0 - Trust: no claim carries a marker its source does not support

**R1. Grounding gate before generation, not after.** The relevance floor runs on the `sources`
event, which arrives after the deltas, so a full answer streams and then a decline is appended
to it. The UI shows both under a "No direct evidence found" chip, the `done` event has
`refused: true` with the bad text inside, and the model's own "Sources:" list of invented
filenames ships with it. Fix: check the floor on the first retrieval pass before generation;
when it fires, discard the buffer and emit only the portal decline; never attach citations to a
refusal; never concatenate two decline templates.
Closes P6-01, P7-01, P8-01, P6-12, P4-06, P7-14, P3-10, P7-19, P2-20, P10-11, P1-15.

**R2. Sentence-level citation binding.** Markers are sprayed on whole paragraphs, bound in
retrieval order rather than to the passage that produced the sentence, exceed the citation
count (markers to [11] on four citations), move position when `done` replaces the streamed
text, and coexist with a model-authored "References:" block whose numbering disagrees with the
chips. Fix: bind each sentence to the passage whose n-grams, numbers and entities it matches;
drop markers that resolve to nothing; renumber during streaming (or hide markers until bound);
strip model-authored reference blocks; keep markers off headings; compute "n cited" from the
bound set; only cite sources that survived the display floor.
Closes P2-02, P2-03, P2-04, P7-02, P7-03, P7-04, P5-05, P6-06, P6-09, P9-07, P10-03, P10-09,
P10-10, P8-07, P1-09, P1-10, P1-18, P3-07, P3-21, P4-05, P4-16, P5-13, P3-14 (part).

**R3. Claim verification extended beyond bare numbers.** The audit checks that numbers occur
somewhere in the cited passages. Personas found figures attributed to the wrong intervention
(RFTC numbers as LITT and ATL), the wrong population (anxiety ranges), the wrong study
(register bands as EURAP), the wrong species (rodent claims cited to a paediatric saliva
study), a rewritten confidence interval, drugs called contraindicated with no source saying so
(vigabatrin as "a sodium channel blocker"), tumour types the sources never name, and
publication years invented on the Latest-evidence intent. Fix: verify each claim's number
together with its neighbouring noun, drug, gene, species and intervention against the bound
passage; take years from resource metadata and post-check every four-digit year; add the
inverse contraindication check (every drug called contraindicated must co-occur with
contraindicat/avoid/worsen in a cited passage); in the review variant forbid re-attributing a
comparison sentence to another intervention.
Closes P1-01, P3-01, P3-03, P9-01, P8-04, P4-01 (part), P10-01, P10-08, P5-01, P5-02, P6-02,
P4-03, P7-05, P7-06, P7-07, P1-03, P1-04, P1-08, P5-07, P9-08, P3-20, P10-12, P8-10, P9-06.

**R4. Exclude reference-list chunks from retrieval, grounding and snippets.** Most wrong
answers traced to bibliography paragraphs: a levetiracetam "more harm than good" claim from
reference 41, five Scn1a gene-therapy "models in the corpus" that are only citations inside
reviews, Rasmussen papers cited that are not in the corpus, "up to 3 years" from a reference
title, and search snippets that read "33. Steinhoff BJ ...". The chunks are already flagged
`referenceChunk` in the sources payload. Fix: label reference paragraphs at ingestion, exclude
them from the generation context and snippet selection, and down-rank them in search.
Closes P1-07, P1-16, P3-18, P5-08, P5-14, P6-21, P7-09, P8-17, P8-20, P9-10, P10-22, P5-01.

**R5. Audit and safety-prequery correctness.** The audit addendum that fixed the lamotrigine
omission is streamed as a delta but `heldDone.text` omits it and the page replaces the text on
`done`, so it never renders (seen on 7 of 14 asks). Range tokens split on the en dash and
decimals without a leading zero raise false alarms on correct answers. Safety prequeries fire
on "NMDAR", "LGI1" and "JAMA" as if they were drugs, and on retention questions. No confidence
or groundedness signal is shown although Help promises one. Fix: append the addendum to
`heldDone.text`; normalise ranges and decimals on both sides; only fire drug-safety prequeries
for entities typed medication and only when the question is about selection or safety; show a
per-answer "figures checked" badge and strike through unsupported figures inline.
Closes P1-02, P3-13, P6-10, P9-14, P9-15, P8-09, P7-31.

### Phase 1 - Routing and retrieval

**R6. Stop the Supplementary-data intent swallowing quantitative questions.** The classifier
sends any question containing a metric, parameter, incidence, proportion, biomarker, sample
size, outcome measure or named study to `data`, whose configuration retrieves only
`format:supplement`. Result: wrong numbers from unrelated data sheets (MELD sensitivity from an
NfL cut-off table, RFTC seizure freedom from a brivaracetam supplement, exome yield from a
methylation supplement, AUC 0.91 from a variant-pathogenicity appendix) or false refusals on
questions the corpus answers in an abstract. Three personas showed the same question answered
correctly when forced to `general`. Fix: restrict `data` to explicit requests (supplement,
supplementary, data sheet, table S, appendix, protocol, peer review, raw data, code); drop
"sample size" and "biomarker" from its rules and description; let the configuration include
articles with supplements boosted; when supplement-only retrieval scores under the floor, fall
back to `general` instead of declining; make the classifier deterministic (temperature 0).
Closes P4-01, P4-02, P2-01, P2-05, P2-06, P3-02, P3-04, P3-11, P4-12, P5-03, P5-04, P5-06,
P6-01, P6-04, P6-05, P7-13, P8-03, P9-02, P9-03, P10-02.

**R7. Tighten the other rules.** The lookup rule fires on any one or two lowercase words
("Okafor recurrence", "EEG-fMRI") and hands a browse listing to a nonsense query; the 26-word
rule turns a fitness-to-drive lookup into a 120k-token review; "dose" routes preclinical
questions to the clinical safety prompt; "Seery 2025 rituximab" goes to Latest evidence;
DOI and PMC identifiers are not exact lookups and return unrelated papers whose reference lists
share a DOI prefix. Fix: lookup only on gene-symbol or identifier shapes and lexicon hits; add a
DOI/PMCID/PMID rule resolved against catalog metadata first; drop the length rule; scope the
"dose" rule to medication entities; index authors and identifiers as searchable fields; show a
real empty state when a search returns nothing.
Closes P2-11, P4-07, P9-09, P6-16, P6-17, P7-12, P8-13, P8-19, P10-14, P10-23, P3-18, P9-10
(author search), P7-15, P1-12 (non-deterministic search ordering).

**R8. Refusal quality.** When retrieval is strong (best match 0.95) and the generator returns
the platform's short "not enough data" string, the portal refuses and hides the sources.
Refusals should re-ask without the safety prequeries once, always show the retrieved sources
labelled "closest matches, not used", and list the nearest resources by title.
Closes P8-02, P9-20, P7-19, P5-10.

**R9. Rate limiting and error states.** The limiter is keyed on client IP (20 asks per minute
across route plus ask, plus every Search page auto-answer). A hospital behind one NAT hits it
on day one. The Ask page and Compare columns show the raw "Too Many Requests" while Search
already has friendly copy; a failed ask is persisted as a session; the header says "Answer
complete" over an error card. Fix: key on the `x-rp-client` id with IP as a larger secondary
bucket; return and honour `Retry-After` with a visible "retrying in N s"; exempt search
summaries or default them to results-only near the limit; share the friendly copy; do not
persist transport-error sessions.
Closes P1-14, P3-08, P4-19, P5-09, P5-17, P5-18, P6-13, P7-20, P8-15, P8-16, P9-21.

**R10. Performance.** A flat 10 to 12 s "validating" tail after every answer with the composer
still showing Stop; review and latest intents at 22 to 46 s to first token on roughly 100k
input tokens; refusals that spend 120k tokens and 32 s to emit one sentence; suggested
questions generated per request at 8 to 10 s on every resource page. Fix: run the quality
judge concurrently and release the UI on text completion; short-circuit refusals after the
first pass when the best match is under the floor; trim review context; precompute resource
questions at enrichment time.
Closes P2-18, P8-23, P3-17, P4-15, P10-19, P1-20, P3-24, P7-25.

### Phase 2 - Metadata, labels and the corpus

**R11. Re-run the Kind classifier with a design rubric.** 171 to 173 resources carry
"Randomised Controlled Trial" including a 2005 narrative review, a 2008 mouse study, cohort,
case-control and natural-history studies, open-label extensions, pooled analyses and a
Klebsiella lung-infection model; the Dravet consensus is a "Systematic Review"; a practical
paper is "Supplementary material". Every persona hit this. Fix: a taxonomy of RCT, cohort,
case-control, cross-sectional, case report, review, protocol, open-label extension,
preclinical; RCT requires randomis* in title or abstract; use MeSH publication type as a
prior; never assign a study-design kind to a supplement or to `format:article` as
"supplementary-material"; hide the chip when confidence is low; until re-run, label the facet
beta.
Closes P1-11, P3-09, P4-08, P5-11, P6-08, P7-11, P8-06, P9-05, P10-07.

**R12. Topic labels and facet integrity.** Animal models holds 31 resources where MeSH suggests
about 100; trials are tagged genetics-only; the live box uses eight generic topics (no
"Seizure forecasting and cycles" although `tenants.ts` defines it); the Taxonomy page says
topic is single-valued while counts sum to 1,673 over 981 resources; facet counts differ
between `/facets`, Search and Library; two labelsets show all-zero counts; Library has no Kind
facet; the Untagged row can never appear. Fix: re-run topic classification with stored MeSH
terms as a prior; provision the topic labelset from the tenant definition; set `multiple`;
serve all rails from one aggregation; hide zero-count labelsets; add Kind to Library; compute
a real no-topic count.
Closes P7-10, P9-11, P6-20, P7-21, P7-22, P7-23, P7-24, P2-16, P9-18.

**R13. Media and supplement merchandising.** At least 20 of 53 videos carry frame descriptions
("a worm on plain white paper", "living rooms", "snakes") as summary and a fake transcript; a
video title names a drug that does not exist ("Glucosamide"); a key takeaway says 10 of 19
where the paper says 17; a quote of interest ends in `]}`; supplement summaries call themselves
"a study"; videos are invisible to Search; a video is cited as evidence under an invented
title with no link to its parent paper; citation chips show DA paraphrase titles instead of
the published title, and two companions share one short title; one paper exists twice under
the same DOI. Fix: summarise media and supplements from the parent article's legend and
abstract, not frames; hide the transcript panel for silent video; carry the parent article on
supplement and media resources and cite through it ("Supplementary material 3 of <paper>");
run the numeric audit over generated takeaways at enrichment time; use the bibliographic title
everywhere with the generated headline as a subtitle; make short titles unique; dedupe on DOI
at load; add a Videos tab or media configuration to Search; replace em dashes in generated
copy; normalise symbol glyphs and superscript runs at extraction.
Closes P1-05, P1-06, P4-09, P9-04, P6-03, P6-22, P6-26, P2-17, P3-14, P6-19, P7-16, P8-22,
P5-13, P4-11, P4-17, P4-20, P6-24, P3-16.

**R14. Knowledge graph and entities.** `/graph/relations` returns a different 120-node slice
on every call (SCN1A and Dravet, then JME, then amoxicillin, omeprazole and skin tests from a
drug-allergy paper); every gene entity page says "No knowledge-graph connections yet - run the
knowledge graph agent in Manage"; the entity groups hold "100", "U", "26-year-old woman",
author surnames and journal names; the 390 px canvas is blank for nine seconds and clips group
labels; an unknown entity returns 200; typeahead has five case variants of "Dravet" and an OCR
"Glut!D" and no prefix match; `/suggest` ignores its query. Note: the `kg-eprepo` agent was
still running during the evaluation, which explains empty entity relations but not the
non-deterministic slice or the noisy entity types. Fix: rank the slice deterministically by
weight over the whole path index and cache it; scope entity relations to the entity; filter
the Gene group against a gene-symbol list and drop numeric, single-letter, person-name and
"N-year-old" entities; a gene-first view for this tenant; canvas skeleton and fitted layout on
mobile; 404 on unknown entities; case-fold and dedupe typeahead with prefix matching; hide the
Graph page until the agent has finished.
Closes P2-07, P2-08, P2-09, P2-10, P2-12, P2-13, P2-14, P7-17, P7-27, P10-04, P10-17.

**R15. PDF reader and evidence cards.** "Open PDF at page N" is off by one (retrieval page is
zero-based, the reader is one-based), so the built-in checking affordance lands on the wrong
page with no highlight while the same link without a page finds and highlights the passage;
summary-matched links quote generated text and land on page 1 silently; the extracted-text
panel opens with the DA page summary as if it were document text; on one tenant path the
link opens the extracted text, not the PDF. Fix: add one to the page index (or drop it and rely
on the passage scan); a reader banner when `matchedField === 'summary'`; render generated
summaries under their own heading; say "highlight not found" instead of landing silently;
name the link by what it opens.
Closes P3-05, P10-13, P1-07 (part), P3-16, P5-16.

### Phase 3 - Library, layout, copy

**R16. Library.** No publication-year sort; "Newest added" shows 2008 papers first because
every resource was created on 3 September; every card says "Added 3 Sept 2026"; every article
card shows the same grey "Report" placeholder while Search shows real page thumbnails; Format
facets AND together so Articles plus Video gives zero; titles in all caps. Fix: `published`
sort as the default; hide the Added line when it is the bulk-import date; reuse the Search
thumbnail pipeline; badge by format ("Article"); OR within a facet; title-case curated titles.
Closes P3-19, P6-15, P9-13, P10-06, P10-21, P1-17, P2-19, P4-14, P7-29, P8-18, P10-18, P10-05.

**R17. Responsive and layout.** At 1440 px Ask, resource and investigation pages use a
centred column of about 1250 px with an empty right third. At 390 px the "Searched for" stack
fills the first screen and the answer is clipped by the composer; Search renders the full facet
lists above the results despite a Filters button; the question bubble scrolls under the sticky
title; Generate tabs clip with no affordance; graph labels overlap. At a 22 px root font the
Library facet counts overlap their labels and the Ask header buttons reach 402 px. Fix: a
right-hand sources rail at 1280 px and up; collapse prequeries and facets behind disclosures on
small screens; scroll-margin under sticky titles; `min-w-0` and `shrink-0` on facet rows;
collapse header buttons into the menu at small widths; ellipsis on the route-chip rationale.
Closes P3-23, P5-19, P7-30, P2-15, P4-13, P6-23, P10-15, P10-16, P7-26.

**R18. Dark mode decision.** Five personas could not test dark mode: `styles.css` states the
portal is light-only, `prefers-color-scheme` is ignored, `data-theme` does nothing, and dark
is a tenant grey-suite setting only. Either add a viewer toggle mapped to the dark grey suite
and persisted, or state light-only explicitly and remove it from the test checklist.
Closes P1-19, P3-22, P5-15, P7-28, P10-20.

**R19. Copy and tenant leakage.** "e.g. Does controlled traffic farming pay off on heavy clay?"
and "Compare controlled traffic farming with conventional tillage" are hardcoded in the
Investigations and Generate pages; Assessment is headed "Industry Knowledge Areas"; answers say
"the context does not provide", "(inference)" and "Not enough data to answer this" verbatim; an
admin instruction ("run the knowledge graph agent in Manage") is shown to clinical readers;
Help promises a confidence score the page does not show; Watches are called Watch, Watching,
Saved and Watched searches on one screen. Fix: move placeholders and headings into tenant
config; post-process the sentinel phrases on every intent and in document chat; never say
"the context"; one word for watches.
Closes P3-15, P6-14, P8-11 (heading), P3-12, P2-05, P8-08, P9-02 (inference), P9-17, P10-11,
P6-11, P2-08 (copy), P7-31 (docs), P8-21, P1-13.

### Phase 4 - Secondary surfaces

**R20. Help is unindexed.** `/docs/search` returns zero for every query and the docs assistant
answers nothing; there is no page on watches. Run the docs ingestion for this tenant and add a
startup check that fails loudly when the docs configuration returns zero documents.
Closes P7-08, P8-12.

**R21. Assessment.** Only the eight topic tiles can seed a quiz, so a registrar quiz on
autoimmune encephalitis cannot be built from the UI although the API does it in 12 s; questions
are undergraduate level with throwaway distractors and no source shown. Add a free-text topic,
`source_resource_id` per question shown after submit, and numeric or comparative stems at
intermediate and advanced depth.
Closes P8-05, P8-11.

**R22. Generate.** A briefing on seizure forecasting had no study names, numbers or in-body
citations although its sources array carried ten strong passages. Give the briefing schema
per-section sources and require concrete figures; refuse a section with no source.
Closes P6-07.

**R23. Investigations.** Synthesis ignores the researcher's note, tags and `contradicts`
verdict and repeats the misattributed figure as fact. Pass notes and tags into the numbered
evidence, explain verdict semantics in the prompt, exclude or caveat contradicted items, and
warn before synthesising over unjudged evidence.
Closes P3-06.

**R24. Export.** The Word export has an unnumbered bracket of curated titles with no authors,
journal, year or DOI, so markers cannot be resolved offline; exporting mid-stream saves a
document containing only the question; Markdown is not rendered. Emit a numbered reference
list from citation metadata, disable Export while streaming, reuse the page renderer.
Closes P9-12.

**R25. Document chat.** Misses STAR-methods tables (strain "not mentioned" when the key
resources table says male Sprague-Dawley), uses the portal-wide decline template in document
scope, accepts a wrong premise (reports a mean as a median), and answers "which medications"
with one drug. Include tabular blocks in the per-document context, a document-scope decline,
preserve the statistic's name, and enumerate on "which".
Closes P7-18, P6-11, P9-16, P6-25, P1-21.

**R26. Extraction Lab.** The compare recommended Default over table-aware on a document
where table-aware found 32 table rows and Default found none, `yieldVsDefault` is filled for
one method only, and the before/after ask refused on both methods (it appears to ask the
production configuration, which excludes the sandbox). Make the recommendation a function of
the profile class first; fill yields per method; point the sandbox ask at the lab box.
Closes P4-10.

**R27. Agentic page** redirects to Ask and the pipeline disclosure is admin-only. Decide and
document; the Deep research sub-question list is a good public substitute. Closes P9-19.

### Phase 5 - What the personas asked for (v1.1 candidates)

Ranked by how many personas independently asked for it.

1. **Per-claim verification in the UI** (8 of 10): hover a marker to see the cited sentence;
   a tick when the passage contains the claim; strike-through for unsupported figures; "open
   PDF at the sentence" for every number.
2. **A study-design facet that is true** (6 of 10): RCT, cohort, case-control, open-label
   extension, registry, review, protocol, preclinical.
3. **Identifier and author search** (5 of 10): PMCID, PMID, DOI resolve to exactly one
   resource; "Vajda" returns the register papers; author pages.
4. **Publication-year sort and year-range facet** (4 of 10).
5. **Export with a real reference list** (4 of 10): Vancouver from DOI, RIS or BibTeX, the
   quoted passage, and the verified-figure audit attached.
6. **Reference-list exclusion with a toggle** and a "cited by papers in this corpus but not
   held" state (3 of 10).
7. **Structured extraction per paper type** (4 of 10): methods card for imaging papers (field
   strength, sequence, TR/TE, voxel, n); outcome fields for surgical papers (Engel/ILAE class,
   follow-up, n); data-and-code panel; table viewer and "ask this table".
8. **Cross-paper comparison tables** (5 of 10): drug, dose, endpoint, value, CI, n, source;
   ATL vs RFTC vs LITT; kainate vs pilocarpine vs FPI; cohort comparison for the AE consortium.
9. **Dossier pages** (4 of 10): per gene, per syndrome, per antibody, per outcome instrument,
   listing every corpus paper with cohort sizes and outcomes.
10. **Preclinical lens** (3 of 10): species and strain facet from stored MeSH; a "preclinical
    only" toggle on Ask; a methods intent over Methods sections and key-resources tables.
11. **Corpus-boundary statement** in every answer ("the corpus holds 11 papers on SEEG, none
    on LITT primary outcomes") and nearest matches on refusal (4 of 10).
12. **Conflicts-between-sources callout** when two cited papers disagree (2 of 10).
13. **A Watches page** with last-run date and optional email (2 of 10).
14. **Gene-first knowledge graph** and variant-level search (2 of 10).
15. **Videos tab in Search**, video cards stating patient or species, seizure type, duration
    and "silent" (1 of 10, but the clinician's whole use case).
16. **Weight-based dose calculator** beside any mg/kg answer (1 of 10).
17. **Save a comparison** from Compare configurations (1 of 10).

## The same work cut by lever

Which part of the system each theme lives in, so the work can be split across agents and
branches without collisions.

| Lever | Themes | Notes |
|---|---|---|
| Application code (`apps/api`, `apps/web`) | R1, R2, R3, R5, R8, R9, R10, R15, R16, R17, R18, R19, R21 to R27 | Grounding gate order, citation binding, claim validator, audit addendum, error copy, page off-by-one, Library sort, layout, secondary surfaces |
| Intent router and ARAG stored search configurations | R4 (filter expressions), R6, R7 | `portal-intent-data` must include articles with supplements boosted; reference-list paragraphs excluded via `filter_expression` in every config; lookup, length and "dose" rules; DOI and PMCID rules |
| Enrichment agents and tenant config | R4 (labelling reference paragraphs at ingestion), R11, R12, R13, R14, R19 (placeholders) | Kind and topic re-runs with MeSH priors; media and supplement summaries from the parent article; graph slice; tenant-config placeholders |
| Knowledge-box content (out of scope) | Coverage gaps | LITT primary data, RNS and DBS trials, hemispherotomy, Austroads and PBS material, a 2005 paper's own CI typo. The portal's job is to say so cleanly, which is R1 and R8 |

**Generic product versus EpRePo-specific.** R1, R2, R3, R5, R7 to R10, R15 to R27 and the
supplement-fallback half of R6 are corpuskit product fixes that would show up identically on
the FRDC portal or any other knowledge box, and belong upstream. R11 to R14, the `data`
intent's keyword list, the safety-prequery drug lexicon and the media re-summarising are
enrichment or domain configuration for this tenant.

**Suggested order for the pilot gate:** R6 (data-intent routing and its configuration) and R1
plus R3 (grounding gate, claim validator) remove every P0 seen; then R2 (citation binding),
R15 (page off-by-one) and R23 (synthesis notes) make the checking loop trustworthy; then R11
(kind re-run) because every persona hit it. Everything after that is polish or v1.1.

## What to keep (the personas' "what is good")

- Document chat and resource pages: verified correct on 55 of 60 questions; real titles,
  first-author bylines, journal, year, DOI; PDF at the cited page with a highlight when the
  page index is right; videos play with range requests and are labelled by paper.
- Verbatim-correct grounded answers when the router picks the right configuration:
  fenfluramine dosing and cardiac monitoring, cannabidiol with clobazam and valproate, STXBP1
  and SYNGAP1 natural history, anti-NMDAR relapse and rituximab hazard ratio, EpiBioS4Rx
  22% PTE and adjusted RR 1.59, seizure-forecasting AUCs and GitHub links, valproate register
  figures, MRS acquisition parameters, ENIGMA Cohen's d, first-seizure QoL and employment
  figures.
- Honest declines on PBS subsidy, rescue midazolam, Austroads standards, Indigenous incidence,
  head-to-head brivaracetam versus levetiracetam, and ASO therapy.
- The route chip and Low confidence badge are honest and visible on mobile; Compare
  configurations exposed a real over-claim in the review prompt; sessions persist and reload.
- The investigation workflow (evidence file, tags, verdicts, synthesis with numbered
  references, export) is the right shape for MDT preparation.
- Search is fast and handsome; no horizontal overflow on any page at a true 390 px viewport.

## Per-persona verdicts

| Persona | Would use again for | Would not yet | P0/P1/P2/P3 |
|---|---|---|---|
| 1 Paediatric epileptologist | Dosing and phenotype questions, videos | Family or registrar until the vigabatrin class of error is caught | 1/6/8/6 |
| 2 Clinical geneticist | Search, Library, single-paper reading | Repeating a number to a family; the graph | 1/7/10/3 |
| 3 Neurosurgeon | Discovery, library, document chat, investigations | MDT evidence until router, page index and synthesis notes are fixed | 3/3/11/7 |
| 4 Neuroimaging scientist | Document chat, parameters from a known paper | Whole portal until data-intent routing and the answer guard are fixed | 1/3/9/7 |
| 5 Neurotrauma professor | Orientation, finding papers, document chat | Grant panel without opening every PDF | 1/7/6/5 |
| 6 Computational neuroscientist | Review-style questions, document chat | A student, until routing and metadata are fixed | 2/6/11/7 |
| 7 Basic neuroscience professor | Finding the paper, then interrogating it | Animal Models topic; Ask in front of a grant panel | 1/8/12/10 |
| 8 Neuroimmunologist | Own literature checks; resource page and document chat today | Unsupervised in front of a registrar | 0/5/10/8 |
| 9 Clinical trialist | First pass; trusts the declines | Grant panel without opening the PDF | 0/7/6/8 |
| 10 Neuropsychologist | Literature triage; document chat for students | Ask answer in front of a patient (driving question) | 1/5/12/5 |

## Environment notes (not product defects, but they shaped the run)

- Ten agents on one IP hit the 20-per-minute ask limiter repeatedly (429 on `/route` and
  `/ask`); every retry succeeded. This did expose the raw error copy and the IP keying (R9).
- The tenant has no viewer dark mode, so dark-mode passes were not possible (R18).
- The brief named `formatIds=` and `labelsets=` query parameters; the working ones are
  `format=` and `ls=`; `kindIds=` is ignored (P9-18). `/catalog` reports total 981 while 881
  rows are reachable through paging (P2 env note).
- The `kg-eprepo` agent was still running throughout, so empty entity relations may resolve
  once it completes; re-check R14 after it finishes.
