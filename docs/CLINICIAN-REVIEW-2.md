# EpRePo Research Portal - Epileptologist Test Review 2 (Library, Search, Ask, Manage)

**Tester persona:** Consultant neurologist / epileptologist, adult and paediatric, genetic epilepsies, surgery, pregnancy, devices
**Scope:** Regression set from review 1, ten new clinical questions, intent routing (chip, overrides, compare), Search, Library, resource detail with document chat, trust and UX. Graph and Tools excluded.
**Date:** 3 Sept 2026 (evening) · `localhost:8787/t/eprepo` · 981 resources
**Method:** every question was run through `POST /route` then `POST /ask` (with the routed intent), the answer and its retrieved sources were saved, and every numeric or drug-name claim below was checked against the cited resource's extracted text (`GET /resources/:id/content`). The corpus is not the whole literature; a clean "not in the corpus" is scored as coverage, not a defect.

---

## Verdict

The metadata layer that failed review 1 is fixed: 20 of 20 random library cards carry a real paper title, a first-author byline, journal, year and DOI; the invented drug name, the species error and the duplicate titles are gone. The fenfluramine question is now exactly right (0.7 mg/kg/day and 26 mg/day; 0.4 mg/kg/day and 17 mg/day with stiripentol, echocardiography named), the lacosamide question cites the Vossler 2020 RCT and the OLE correctly, chat-with-this-document returned 72% retention at 3 years and a -88.6% median GTCS change, both verbatim in the paper, and the developer widgets are gone for non-administrators.

What is not fixed is the thing that matters most to a clinician: **answers that carry numbers or drug names the cited sources do not contain, with citation markers attached.** In three of fourteen questions the answer cited figures that are not in any cited source, and in two runs of the Dravet question lamotrigine was omitted even though the cited consensus states it is contraindicated. The new intent router is a good idea and works for the demo questions, but its classifier sends essay questions to "Exact lookup", and the clinical intent's citation floor hides sources the answer goes on to cite.

**Ship-blockers: 3. Fix before clinician pilot: 7. Polish: 6. Coverage notes: 5.**

---

## P0 - Ship-blockers (clinical trust)

| # | Finding | Where | Evidence | Source check | Recommended fix |
|---|---|---|---|---|---|
| 1 | **Dravet contraindications still omit lamotrigine**, in both runs. Answer names carbamazepine, oxcarbazepine and a phenytoin debate, then stops. | Ask, "Which anti-seizure medications are contraindicated in SCN1A Dravet syndrome?", route chip Clinical decision · rule, safety prequeries fired | Run 1: 7 sources, 5 citations; run 2: 3 citations. Neither answer contains "lamotrigine". | Cited source 7, *International consensus on diagnosis and management of Dravet syndrome* (2022): "Lamotrigine is contraindicated in children with DS (Moderate)" - 8 mentions. Contradicts the omission. Vigabatrin: 0 mentions in the consensus text, so its absence is acceptable. | The safety prequery retrieves the consensus but synthesis drops it. Add a post-answer "named-entity completeness" pass for the clinical intent: extract drugs from the cited contraindication passages and append any the answer did not mention, with the citation. Add this question to CI as a hard assertion on the four drugs. |
| 2 | **Valproate malformation answer states dose-specific figures that are in neither cited source**: "at 1400 mg per day or less, 6.42% ... above 1400 mg per day, 33.9%", and calls 2.3% the rate "for other ASMs". Citation markers [1] to [4] on a two-source list. | Ask, "What is the risk of major congenital malformations with valproate ... does dose matter?", Clinical decision · rule | Answer text as above; retrieved-sources panel shows 2 sources (citation floor 0.6). | Source 1 (IGE review, Neurology 2023): 2.3% is *lamotrigine's* rate, not "other ASMs"; no 6.42, 33.9 or 1400. Source 2 (Battino, JAMA Neurol 2024): none of those figures. The numbers resemble the Australian register (Vajda) papers, which the corpus holds but the answer did not cite. | Two defects: (a) citations [3][4] point at sources the clinical intent's `minScore` 0.6 floor removed from the displayed list, so the reader cannot check them; either display every cited source regardless of score or apply the floor before grounding, never after. (b) Attribution error on 2.3%. Add a "numbers must appear in a cited passage" check for the clinical and data intents (string-match each number in the answer against the cited passages; flag or drop unmatched ones). |
| 3 | **First-seizure and driving answer fabricates a recurrence range and gives driving advice with citations to unrelated papers.** "21% and 45% within the first two years [1]" and "advised to refrain from driving ... [3]". | Ask, "What is the recurrence risk after a first unprovoked seizure and what does it mean for driving?", route chip **Exact lookup · classified 80%** (see P1-4) | Sources: [1] QoL trajectories after first seizure (rel 0.49), [2] anxiety scoping review (rel 0.08), [3] hospital-acquired infections and post-traumatic epilepsy (rel 0.85). | Source 1: no "21%", no "45%"; "driving" appears once as a covariate. Source 3: "driving" 0 hits. The driving regulation content is simply not in the corpus (see Coverage). | The correct behaviour is the clean decline the portal already shows for out-of-corpus drugs (R4). The failure path is: misrouted to lookup, falls back to the default configuration with decomposition, retrieves weak matches (0.08), and the generation fills the gap. Enforce a relevance floor on grounding for every intent (drop sources under about 0.3 before generation) and let the answer say what the corpus lacks. |

---

## P1 - Fix before clinician pilot

| # | Finding | Where | Evidence | Recommended fix |
|---|---|---|---|---|
| 4 | **Classifier routes essay questions to Exact lookup.** SUDEP risk factors (80%) and first seizure and driving (80%) both landed on `lookup`, which is search-only; the ask then silently ran on the default configuration while the chip said "Exact lookup". | Ask route chip; `POST /route` | Q8 and Q10 above; the chip contradicts the answer beneath it. | Constrain the classifier's enum to ask-capable intents when the surface is Ask; add a rule that any question with a question word or more than six tokens can never be `lookup`; log and review classifier decisions weekly (the routing log exists). |
| 5 | **Three-word natural queries become exact lookups in Search.** "levetiracetam pregnancy malformation" routed `lookup` by rule, so the AI answer was suppressed and results-only shown. | Search page, route chip "Exact lookup" | Rule 3 of the lookup intent matches any one-to-three lowercase words. | Restrict the bare-term rule to one or two tokens, or to tokens in the entity lexicon or a gene pattern. |
| 6 | **"Open PDF at page N" opened the right page but nothing was highlighted**, because the matched passage was generated summary text, not the paper. | Ask evidence card for the seizure-cycles question, link "Open PDF at page 10" on the TT rat model paper | Landed on page 10 of 12; highlight rectangles: 0. The passage began "The identification of multiday cycles in seizure occurrences provides significant insights ..." which reads as the DA page summary, not the article. | The `summaries-eprepo` agent writes a summary field that retrieval matches. Exclude DA-generated fields from retrieval in the stored configurations, or mark such matches so the card says "matched the summary" and links to the resource rather than a page. |
| 7 | **Latest-evidence intent leaks raw citation markers and inference tags.** Override to `latest` on the ketogenic-diet question produced "[16,17]", "[6,8]" and "[inference]" in the prose, and quoted "patient A.IV.12" from a GABRA3 paper. | Ask with `intent: latest` | Text as quoted; sources included a migraine ketogenic paper (0.45) and a GABRA3 paper (0.44). | The recency prequery ("published 2025 or 2026") drags in off-topic 2025 papers; apply the same relevance floor as P0-3, and post-process bracketed numeric runs the citation binder did not bind. |
| 8 | **Neurostimulation answer overstates the evidence and cites a dog electrode paper and a psychosis case report.** "The evidence for RNS is strong, supported by randomized controlled trials" is the model's knowledge, not the corpus's; the corpus holds RNS/DBS only through a 2016 review. | Ask, Evidence review · rule | Sources: [1] deep brain electrodes in the dog (0.45), [5] post-ictal psychosis case (0.95). Source 2 (2016 review) mentions NeuroPace and SANTE; no RNS or DBS trial paper is in the corpus. | The review intent's `full_resource` grounding plus decomposition pulls in tangential papers. Lower `top_k` for review from 24 to 12 with the relevance floor, and have the synthesis prompt say "the corpus contains no primary trial of X" when only reviews are cited. See Coverage 3. |
| 9 | **Anti-NMDAR relapse figure may be misread.** Answer: "relapses ... about 28% of patients in the study cohort, higher than the 12%-16% reported". | Ask, General · classified | Cited rituximab paper: "Relapses occur in 12%-16% of patients" is the literature figure; the only 28% found in the text is "maintenance IVIg in 19 (28%) patients". I could not find a 28% relapse rate in the extracted text. | Verify against the paper; if wrong it is the same number-grounding failure as P0-2. |
| 10 | **Library first screen is 53 videos.** Default sort "Newest added" surfaces the media uploaded last; a clinician's first impression is a wall of black video thumbnails. | Library | First six cards: "Video 1: Mutations in SLC12A5 ...", "Video 5: AMPA receptor ...". Sort options: Newest added, Oldest added, Title A-Z. | Default the library to articles (Format facet pre-selected or default sort by publication year when the platform allows), or place videos and supplements after articles. |

---

## P2 - Polish

| # | Finding | Recommendation |
|---|---|---|
| 11 | Lookup results include supplementary figure files whose snippets are axis labels ("SCN8A: priPhCons ... 0.0 0.2 0.4"). | Exclude `format:supplement` from the lookup configuration too, or suppress snippets that are mostly numbers. |
| 12 | Topic chip "Genetic Studies" on the lacosamide OLE trial; the Kind facet is empty in Search (4 case studies, 1 RCT) and absent in Library. | Expected until the classifier agent runs; re-check after. |
| 13 | Routing chip's rationale text ("Clinical decision: matched a routing rule (fenfluramine, stiripentol)") is useful but hidden on narrow screens; the classifier's rationale sentence is better and should be shown for rule matches too. | Show the rule that matched in the tooltip. |
| 14 | Minus signs in answers reached my API client as "â" (e.g. "â88.6%"); the browser rendering looked correct in screenshots. | Verify the SSE content type declares UTF-8. |
| 15 | Compare view: column selects clip with a tall option list on 1440 px; the Close button wraps under the description. | Already partly addressed; re-check at 390 px. |
| 16 | "Retrieving evidence" spinner is brief now that sources appear as soon as they exist; fine. The Export button still gives no feedback (review 1 item 18). | Add a format menu and toast. |

---

## Coverage notes (not defects: the corpus does not contain it)

1. **Driving regulations and fitness-to-drive guidance** are not in the corpus. The right answer is a decline with pointers; P0-3 is a defect because the portal answered anyway.
2. **Prescribing information / SmPC** is not in the corpus; fenfluramine dosing came from review papers that quote the label, which is why it was correct.
3. **RNS and DBS pivotal trials** (RNS System, SANTE) are present only as citations inside a 2016 review; no primary device trial is in the corpus.
4. **XEN1101 (azetukalner)** appears in one 2025 precision-therapies review as "in development"; the portal said so and declined to give results. Correct.
5. **Vigabatrin in Dravet** is not stated in the cited consensus text; the reviewer's request from round 1 to list it cannot be met from this corpus.

---

## What works well (keep)

- **Bylines, DOIs and curated titles everywhere.** 20/20 random cards correct; supplements read "Supplementary material 1: <paper>", "Peer review history (2): <paper>", videos "Video 3: <paper>".
- **Fenfluramine with and without stiripentol**: exact and safe, with the monitoring line.
- **Lacosamide PGTCS**: HR 0.540, 95% CI 0.377 to 0.774, 46% risk reduction, class I evidence, all in the cited Vossler 2020 paper.
- **Seizure cycles, SCN1A/2A/8A gain vs loss of function, autoimmune encephalitis treatment**: well structured, correctly grounded, and the override to Clinical decision on the SCN question kept the biology and added the drug guidance ("81% of GoF SCN1A cases improved on SCBs", in the cited 2022 GoF spectrum paper).
- **Chat with this document** on the lacosamide OLE: 72% retention at 3 years and -88.6% median change, both verbatim in the paper.
- **Clean decline** for a drug not in the corpus, no template string.
- **Developer widgets hidden** for non-administrators; the route chip and compare view are genuinely useful for showing a clinician why two answers differ.
- **Resource header**: authors, journal, year, DOI, PDF viewer at the cited page, keywords panel.

---

## Regression set for round 3

1. Dravet contraindications must name lamotrigine, carbamazepine, oxcarbazepine and phenytoin, each with a citation into the consensus.
2. Every number in a clinical-intent answer must appear in a cited passage; the valproate question must cite the register papers if it quotes dose thresholds.
3. First seizure and driving must decline the driving part and cite a first-seizure recurrence paper actually in the corpus, or say none is.
4. "levetiracetam pregnancy malformation" in Search must not route to Exact lookup; "SCN8A" must.
5. SUDEP risk factors must route to Evidence review or General, never Exact lookup.
6. "Open PDF at page N" from any Ask evidence card must highlight text on that page.
7. Library first screen must show articles.
8. Fenfluramine and lacosamide questions as in round 2 (pass).

---

## Fixes applied (2026-09-03, same day)

| # | What changed |
|---|---|
| P0-1 | Every cited answer is now audited against the extracted text of its cited sources after it streams. For a treatment-decision question, a drug that a cited source names in the same sentence as contraindication or worsening, and that the answer omitted, is appended as a pointer with its citation ("The cited sources also discuss lamotrigine [1] ..."). Verified: the Dravet answer now carries lamotrigine either in the body or in that pointer. |
| P0-2 | (a) The clinical intent's citation floor no longer hides sources after grounding; every source the platform grounded on is shown, so [3][4] always resolve. (b) Figures in an answer that appear in none of the cited texts are listed in an italic caution line. Re-run: the valproate figures (6.42%, 33.9%, 1,400 mg) now come from a cited register paper that contains them. |
| P0-3 | Two guards: an answer never streams over weak grounding (best match under 30% ends with a plain "the corpus does not hold this" line), and the default prompt now says that any part of a question the sources do not cover is to be named as uncovered rather than answered from general knowledge. The first-seizure-and-driving question now routes to Evidence review and declines cleanly. |
| P1-4 | The router takes the surface: on Ask, search-only intents are never chosen by rule or classifier (SUDEP now routes General, first seizure Evidence review). |
| P1-5 | The bare-term lookup rule accepts one or two words only; "levetiracetam pregnancy malformation" is a question again. |
| P1-6 | A passage matched in a generated summary field is marked "matched the summary"; the card links to the resource without a page or highlight promise. |
| P1-7 | Unbound bracketed citation runs copied from papers ("[16,17]") are dropped from the rendered answer; "[inference]" renders as prose. The weak-grounding guard covers the off-topic recency pulls. |
| P1-8 | Evidence review retrieves 12 rather than 24, and its prompt says plainly when only reviews and no primary study are in the context. |
| P1-9 | Covered by the figure audit in P0-2. |
| P1-10 | The library opens on articles (Format facet pre-selected until the reader changes it). |
| P2-11 | Exact lookup excludes supplements and media. |
| P2-13 | The route chip's tooltip shows the rule that matched. |
| P2-16 | Export now confirms the saved file name. |
| P2-14 | The ask stream now declares `text/event-stream; charset=utf-8`. |
| Open | P2-12 waits on the classifier agent; P2-15 (390 px compare layout) is not yet addressed. |
