# D'Souza persona test - loop 7 report

Persona: Professor Wendyl D'Souza (epileptologist and epidemiologist, St Vincent's Melbourne),
seventh use of the portal, after the loop 6 fixes (PRs #21 and #22: bind a located figure to the
population clause of the sentence it was found in; exact outcome matching; table cells checked
under their column heading; bibliographies actually cut; a paper's own voice or abstract makes a
Discussion figure first-hand; How this works reworded so both branches of each rule are stated).

Build under test: `http://localhost:8787/t/eprepo`, `/api/health` =
`{"ok":true,"web":true,"version":"ba069234d866","build":{"sha":"ba069234d866","builtAt":"2026-09-06T01:16:20.875Z"},"docs":{"eprepo":{"documents":13,"ok":true}},"docsOk":true}`.
Read-only run, 6 September 2026. Nothing edited, no server started or stopped, no commit; one
investigation, two evidence cards, one synthesis and one watch created under the anonymous client.
Corpus counters: 998 resources, 106,749 paragraphs, 103,292 sentences (the same three numbers the
How this works page prints, checked in the browser).

---

## 1. Session summary

| | |
|---|---|
| Ask requests (API, SSE) | **72** - 8 loop 6 P0/P1 regressions, 8 removal regressions (R/C/D series), 8 wrong-figure probes, **15 paraphrase probes across 6 figure questions**, 6 How-this-works falsification probes, 4 contraindication probes, a 2-turn trial-design chain, a 3-turn epidemiology chain, 4 document chats, 9 fresh job questions, 3 BREATHS retrieval probes |
| Every cited figure verified | against `/api/t/eprepo/resources/:id/content` for 14 papers (whole extracted text pulled and grepped): `8565cc8f`, `7622042349`, `9dd53383`, `dc05b6a3`, `433567db`, `89ca061f`, `453cb4c1`, `020e1d7c`, `1a33ad7e`, `83bc89d3`, `6d1d883c`, `527d096c`, `f0c5046b`, `7f652beb` |
| Searches / lookups | 14 (name x2, DOI, PMCID, PMID, 4 phrase searches, an unknown term, facets, 2 catalogue filters, entities, entity) |
| Document chats | 4 (`89ca061f` placebo, `8565cc8f` LGI1 relapse, `9dd53383` consortium mRS, plus a stale-id probe) |
| Generate | 1 assessment (12.6 s), 1 briefing (14.9 s) |
| Investigation | created 0.06 s, 2 evidence cards, synthesised 11.8 s |
| Browser | 11 routes x light/dark x 16 px/22 px root at a **true 390 px layout viewport** (`innerWidth` 390 measured), plus a 1440 px and a 1600 px desktop pass, resource detail, PDF reader page, unknown-id state, library facet, Ask streaming marks and the answer badge tooltip |
| Help assistant | 3 questions |

Timings: first word median **8.8 s** (loop 6: 10.3), done median **11.6 s** (12.1), audit tail
median **2.4 s** (1.2, maximum 8.0). 6 of 71 asks over 15 s to first word. Page loads 0.55-2.27 s
desktop; resource detail 1.19 s, library facet 1.16 s, graph API 0.12 s, entity API 4.14 s.

---

## 2. Regression table

All 16 loop 6 findings, then the earlier findings still open after loop 6.

| ID | Status | Evidence |
|---|---|---|
| **D6-01** the P0: neighbouring subgroup's figures under a clean badge | **Fixed on the loop 6 wording; unstable on paraphrases** | J1, same wording: "In patients with psychiatric comorbidity who switched from LEV to BRV, seizure freedom was achieved in **13.9%** at 12 months (FAS).[2]" - the paper's own switcher figure, `figuresRemoved []`, `sentencesRemoved 0`. But the same question in three other wordings gives three different behaviours - see **D7-04**. |
| **D6-02** a finding manufactured from a reference-list line | **Fixed in Ask, and the conclusion survives it** | J9 now prints "*A sentence naming RANSOM was removed: this collection holds no paper reporting that study, and no cited source states the finding.*" But the answer still opens "Yes, medication adherence is associated with mortality in people with epilepsy.**[1][2]**" and closes "This suggests that adherence to medication regimens is crucial for reducing mortality risk in this population.**[2]**" where [1] = `453cb4c1` (psychiatric comorbidity, no adherence) and [2] = `cb8ba600` (qualitative barriers, no mortality). See **D7-07**. And Z2 still asserts the RANSOM finding outright with no citation at all - **D7-08**. |
| **D6-03** wrong outcome in a table cell, no n | **Fixed** | TF2: "\| Brivaracetam \| EXPERIENCE \| FAS \| **1644** \| **71.1%** \| **14.9% (n = 1111)** [2] \|". The continuous-seizure-freedom 11.7% is gone. Unverifiable cells read "not verified" with the count stated: "*5 table cells were marked \"not verified\"*". Residuals in **D7-16**. |
| **D6-04** a trial's own placebo rate removed as second-hand | **Fixed** | D02 `done` 11.5 s: "the placebo 50% responder rate was **46.3%** with a group size of **121** patients.[1]" `figuresRemoved []`, `figuresSecondhandRemoved []`. |
| **D6-05** SUDEP aHR 2.24 removed, wrong effect size offered | **Fixed** | J2: "an adjusted hazard ratio (aHR) of **2.24** (95% CI: 1.07-4.68, P = 0.031).[1]" cited to `020e1d7c`, 6 figures checked, nothing removed. PA6a repeats it. (PA6b, a synonym of the same question, withholds - **D7-04**.) |
| **D6-06** Ask removes what document chat delivers; a removed figure quoted back two lines below | **Half fixed, half regressed** | Fixed: HC1 "the mean age at enrollment was **45 years, with a range of 23 to 71** years.[1] The sex distribution was equal, with **13** participants (50%) assigned female sex at birth.[1]", nothing removed; TF1 returns 71.1% (n = 1644). **Regressed**: JOB5 removed "3.6, 2.9, 4.4" - "*could not be verified - the cited passage carries them for a different outcome or follow-up*" - and then printed "*For the outcome asked about, [1] itself reports: \"...(SMR **3.6**, 95% confidence interval [CI] **2.9-4.4**...)\"*". The removal notice and the answer are two lines apart. See **D7-10**. |
| **D6-07** consortium question answered from the LGI1 sub-study | **Not fixed; the flag that softened it is gone** | X2: "In the Australian Autoimmune Encephalitis Consortium cohort, **80%** of patients had a favourable modified Rankin score (mRS <= 2) at 12 months.[1]" [1] = `8565cc8f` (LGI1, n = 55). `9dd53383` was in the retrieved sources and reports "At 12 months, a favourable mRS (<= 2) occurred in **154 (67%)** patients". Loop 6 at least flagged the 80% and quoted the paper's own 79% beside it; this build prints it bare with a "figures checked" badge. Document chat on `9dd53383` answers "**154** patients out of **231**" in 6.8 s. See **D7-02**. |
| **D6-08** denominator addendum nags | **Fixed where it mattered, still nags twice** | Fixed: TF2 prints no addendum inside the table; J1 now prints "*Denominators: the cited passage gives **103 of 583** for 17.7% [1]*" (`dc05b6a3`: "BAEs (103 [17.7%])" with "n = 583" in the same sentence); JOB3 gives "99 of 119 for 83% [1], 10 of 11 for 91% [4]"; R01's F1 statistic no longer draws one; J10's range no longer draws one. Still fires on X2/PA3b's 80% and on J7's 40%/33.3%/31%. |
| **D6-09** quiz answer key points at the wrong paper | **Partly** | `source_resource_id` now matches the paper carrying the quote (`9dd53383`). But `source_label` on the same question names a **different** paper ("Second-line immunotherapy and functional outcomes ... systematic review"), and the `source_quote` is lifted from the DA-written page summary, not the paper. And I asked for `count: 6` and got **one** question. See **D7-11**. |
| **D6-10** author review lists one paper while citing two | **Fixed** | X5 now renders one item per paper from the catalogue with year, journal and study design, and names the protocol as such: "*[2] is the study protocol: the numbers it gives are the planned recruitment, not the enrolment. The results paper [1] reports: \"Of the 196 participants included in the study...\"*". |
| **D6-11** table rounding preferred to the Results sentence | **Regressed into a P0** | P0c now returns "**28%** of patients experienced a relapsing course (n = 55).[1] The median time from initial admission to first relapse was **764 days (IQR 355, 1,193)**.[2]" - both figures belong to the anti-NMDAR paper `7622042349` ("A total of 19 patients (**28%**) had at least 1 relapse, which occurred at a median of **764 (IQR 355, 1,193)** days"). `grep` for `28%`, `(28)` and "relapsing course" in `8565cc8f` returns **nothing**. Loop 6's complaint was 31% instead of 30%. See **D7-01**. |
| **D6-12** citation markers on papers that do not carry the statement | **Fixed in briefings, not in Ask** | Briefing `takeaway_refs [[1],[2],[1],[2]]`, every takeaway on the one paper that carries it. Ask still: W6 "The base year for this projection is 2024.**[1][2]**" ([2] = `4492ee1d`, a work-productivity paper); J2 "**[1][2][3]**" on a sentence [2] and [3] do not carry; HW1 cites **[2][3][4]** for a sentence saying the sources do *not* provide the result. |
| **D6-13** synthesis titled with the UTC date | **Fixed** | `{"title": "Synthesis - 2026-09-06", "createdAt": "2026-09-06T03:58:38.727Z"}` - 13:58 AEST on 6 September. |
| **D6-14** nine of eleven pages share one `<title>` | **Fixed** | "Search \| EpRePo Research Portal", "Library \| ...", "Investigations \| ...", "Generate \| ...", "Assessment \| ...", "Knowledge graph \| ...", "Help \| ...", "How this works \| ...", "Tools \| ...", "Ask \| ...". Residual: a paper's page is "Document \| EpRePo Research Portal" - **D7-19**. |
| **D6-15** a 23 px control on the phone | **Fixed** | At a true 390 px layout viewport, light and dark, 16 px and 22 px root: **no** control with an effective tap height under 24 px on any of 11 routes. The library facet checkboxes measure 17 px but sit in 30-51 px labels. Residual: the desktop "cards across the grid" range slider is 16 px with no label wrapper. |
| **D6-16** four How-this-works promises falsifiable | **Two fixed, two still falsifiable, and four new ones are** | (a) unverified table cells now read "not verified" - fixed; (b) a second-hand figure never leads - fixed (X2 no longer leads with a flagged figure, because it no longer flags it at all); (c) "the sentence is cited to that paper instead" - still false (JOB5, JOB4); (d) "a study named in the question is pinned" - held for EXPERIENCE (HW5 71.1%, n = 1644) and RANSOM/SANAD II banners, but PA1a names EXPERIENCE and gets a total withhold. Newly falsifiable: "It never answers without a source" (Z2), "every sentence with a figure must cite a paper about that cohort" (P0c, X2), "a denominator is only ever added from the figure's own bracket or table cell" (J10, PA4b), "A medication the answer calls contraindicated must be called that by a cited passage" (HW4). Full list in section 3 and **D7-03/07/08**. |
| D5-01 the gate removes the paper's own sentences | **Fixed** | All eight removal regressions clean: R01 "80% ... just over a third (37%)"; R02 "937 ... out of a total of 1,805"; R03 "147 ... 87"; R04 "9 years, IQR 5 to 13"; R05 "14.9% (n = 1111, full analysis set)"; R06 "HR 0.11 ... 0.02-0.70, p = 0.02, n = 51"; R08 "AUC 0.70 ... 0.68 to 0.72"; C01 "four subjects ... 160 mg/day"; C02 "101 SUDEP cases and 199 living epilepsy controls"; D01 "11% of patients (3/28)". `figuresRemoved []`, `sentencesRemoved 0` on all but C02. |
| D5-04 wrong quantity under a clean badge | **Still open, in new instances** | D7-01, D7-02, D7-05, D7-06. |
| D5-11 protocol recruitment given as sample size | **Fixed** | X5, above; the protocol's 450/405 is labelled as planned. |
| D5-13 denominator addendum nags | **Mostly fixed** | See D6-08. |
| D5-14 the paper's own figure not offered after a removal | **Partly** | It fires (JOB4, JOB5, X5 name where the figures were found) but twice offers the wrong paper's figure (JOB4 offers a lacosamide drug trial's retention under a device question) and once offers the very figure it just removed (JOB5). C02 removes the recruitment-period sentence and offers nothing, so "where were they recruited" goes unanswered. |
| D5-15 second-hand classifier misfires | **Fixed both directions** | X4 "a total of 312 saliva samples were collected from 13 participants.[1]" - no flag. J6 flags all six borrowed prevalence figures. J7 flags 4%, 27%, 5% and leaves the paper's own 23.6%/22%/42% alone. D02's Discussion figure is first-hand again. |
| D5-16 format and template leaks | **Partly - a new one** | No code fences, no empty headings in 72 asks. New: J1 prints a "**Inference:**" heading carrying an uncited clinical recommendation; JOB4 prints "so this is an inference based on available data"; the Help assistant prints "a bracketed citation marker like that links to the exact source passage" with the marker template stripped out; HW3's effect-size helper prints a broken quote. **D7-13, D7-20, D7-21**. |
| D5-17 two clinical words routed as a lookup | **Holds** | `lamotrigine SUDEP` 21 resources, no lookup route; `sub-scalp EEG seizure forecasting` 18; `Zzzznotaname` 0. |
| D5-18 docs silent on document-chat checking | **Holds** | Help answers it, and document chat demonstrably runs the check. |
| D4-09 UMPIRE demographics withheld | **Fixed** | HC1, PA5a, PA5b all deliver 45 (23-71) and 13/26, consistently across three wordings. |
| D4-16 author and identifier lookup | **Holds** | `D'Souza` and `D'Souza W` both `rule "author"`, 62 resources, 27 ms after the first call; DOI 12.8 ms, PMCID 12.8 ms, PMID 12.5 ms. |
| D4-18 univariable HR passed off as adjusted | **Fixed** | J2, PA6a. |
| D4-22 two-part refusal | **Regressed** | JOB2 asks two things the corpus answers separately and gets "This portal's sources do not answer this question directly ... **No source in the corpus comes close to this question**, so none is listed as a match" - about **his own BREATHS trial**, which `/search?q=BREATHS` returns as hit 1. **D7-09**. |
| D3-02 correct figures withheld | **Improved but wording-dependent** | 6 withholds or removals in 72 asks, and two of them (PA1a, PA6b) are paraphrases of questions the build answers correctly under another wording. |
| D3-05 / D1-09 latency | **Improved on the median, worse in the tail** | First word 10.3 -> **8.8 s**, done 12.1 -> **11.6 s**. But the audit tail doubled (1.2 -> 2.4 s median) and the reformat turn TF2 went 16.7 -> **46.6 s**; X1 took 47.7 s to first word. |
| D3-09 / D2-13 / D1-16 stray markers | **Partly** | Fixed in Generate, open in Ask. See D6-12. |
| D3-21 weak-match badge | **Works** | JOB2 printed "The closest passages found were only weakly related (best match 22%)" - correctly formatted, wrongly triggered. |
| D2-17 audit tail | **Regressed** | median 2.4 s (was 1.2), maximum 8.0 s. |

**Summary of the 16 loop 6 findings: 9 fixed** (D6-02 in Ask, D6-03, D6-04, D6-05, D6-08, D6-10,
D6-13, D6-14, D6-15), **4 partly** (D6-01, D6-06, D6-09, D6-12), **2 not fixed** (D6-07, D6-16),
**1 regressed into a worse defect** (D6-11 -> D7-01). Earlier: D5-01, D5-11, D5-15, D5-17, D5-18,
D4-09, D4-16, D4-18 fixed or holding; D5-13, D5-14, D5-16, D3-02, D3-09 partly; **D4-22 and D2-17
regressed**. The loop 6 P0 is closed on its own wording and reopened on its paraphrases; three new
P0s are open.

---

## 3. Verdict as Prof D'Souza, and score

The machinery you rebuilt does work: every sentence you deleted from under me last loop came back
clean this time, the trial table now carries n = 1644 and 14.9% (n = 1111) with the cells it cannot
stand behind marked "not verified", the lacosamide trial's own 46.3% (n = 121) is back, the SUDEP
adjusted hazard ratio 2.24 (1.07-4.68) is back, UMPIRE's 45 (23-71) and 13 of 26 are back, the
PERMIT discontinuation figures you refused me last loop came back verbatim as 17.6% (739/4201) and
20.6% (856/4164), my briefing on real-world effectiveness was accurate to the decimal in nine
figures with the right population on each, my three-turn epidemiology chain held, and the phone is
clean in both themes at a real 390 px and at a 22 px font. But I asked about relapse in anti-LGI1
encephalitis and was told 28% at a median of 764 days, cited to the LGI1 paper, badged four figures
checked, tooltip "Every figure in this answer was found beside its claim in a cited passage", label
**High confidence** - and those are the anti-NMDAR paper's numbers, a different antibody, a
different cohort; my own paper says 16 (30%) at 414 days and the document chat on that same paper
tells me so in six seconds. I then asked whether carbamazepine is contraindicated in juvenile
myoclonic epilepsy and got "Yes ... [1]" against a paper whose only use of that word is
"**valproate** is now contraindicated in women of childbearing potential", so your contraindication
check is matching a word, not a drug. And the thing that undoes the rest: the same clinical question
in a different sentence gives me a different answer - 23.6% or 22% for the placebo responder rate,
80% or 154/231 for the consortium's twelve-month outcome, 13.9% or a blank refusal for my
levetiracetam switch, 2.24 or a blank refusal for the SUDEP hazard - five of the six figure
questions I paraphrased came back inconsistent, which means I cannot use any single answer without
checking it, which is the work the software was supposed to do for me.

**Impact score: 7 / 10** (unchanged from loops 5 and 6, and now for the third loop the same defect
class is what holds it there). Open **P0: 3**. Open **P1: 7**. The bar - 9 or higher with no open
P0 or P1 - is **not met**.

---

## 4. What now has a positive impact (specific)

- **The removal problem is finished.** 10 of 10 deletion regressions came back with the paper's own
  sentence and a clean audit. Across 72 asks the gate removed a sentence 6 times, and 4 of those
  were right.
- **Figures the build refused last loop now arrive.** HW6: "17.6% (739/4201) ... discontinued
  perampanel due to adverse events ... 20.6% (856/4164) ... 9.6% (414/4294)" - all three verbatim
  in `433567db`, from the very table extraction that made loop 6's W3 refuse.
- **The briefing is publishable.** Nine figures in two sections, every one verbatim
  (32.1%, 36.9%, 22.4%, 14.9%, 89.4%, 71.1%, 33.6%, 44.6%, 35.0%), every one carrying
  `{figure, outcome, population, study}`, the discontinuation reasons correctly scoped to "patients
  with documented reason for discontinuation", and `takeaway_refs [[1],[2],[1],[2]]` with no stray
  marker. 14.9 s.
- **The reformat table honours its promise.** Three rows, no fence, "not verified" in five cells
  with the count stated, and the brivaracetam row right across n, retention and seizure freedom.
- **Document chat is the most trustworthy surface in the portal.** DC3 gave "16 (30%) ... 414 days
  (IQR 256, 967)" in 6.0 s and DC4 "154 patients out of 231" in 6.8 s - both the answers Ask got
  wrong on the same papers.
- **The author review reads like a bibliography now.** X5 lists each paper with year, journal and
  study design, names the protocol as a protocol, and quotes the results paper's own "196
  participants ... enrolled".
- **Denominators are being supplied, not demanded.** "the cited passage gives 103 of 583 for 17.7%",
  "99 of 119 for 83%, 10 of 11 for 91%", "416 out of 2018 individuals (20.6%)".
- **Second-hand classification is now right in both directions.** X4 clean, J6 flags all six
  borrowed prevalences, J7 flags 4%/27%/5% and leaves the paper's own 23.6% alone.
- **Chrome.** Dark mode on all 11 routes (body `rgb(18, 19, 22)`), zero horizontal overflow at
  1600 px, 1440 px and a true 390 px layout viewport, in both themes, at 16 px and 22 px root font;
  no sub-24 px tap target on the phone; per-route page titles; "This document does not exist ...
  Back to library" for a bad id; the paper page opens with the PDF reader, three suggested
  questions and the chat box in 1.19 s.
- **Speed.** First word median 8.8 s, done 11.6 s - the fastest of the seven loops.
- **Investigations and watches** work end to end and the synthesis is now dated in my timezone.

---

## 5. New findings table

Severity: P0 trust/safety, P1 blocks a job, P2 misleading but workable, P3 polish. Application
defects only; corpus coverage is section 7. "Platform" names where a Progress Agentic RAG feature
should carry the fix.

| ID | Sev | Job | Surface | What happened (exact query) | Expected | Evidence (verbatim, timings, ids) | Suggested fix |
|---|---|---|---|---|---|---|---|
| **D7-01** | **P0** | clinic, research | Ask body, badge, confidence | A question about one antibody answered with another antibody's figures, cited to the first paper, under High confidence. P0c: "In anti-LGI1 antibody encephalitis, what proportion of patients relapsed, and at what median time to first relapse?" | "16 (30%) relapsed, at a median of 414 (IQR 256, 967) days" (`8565cc8f`). | `done` 8.2 s, `figuresChecked 5, figuresUnsupported [], sentencesRemoved 0, figuresRescued ["764days","355","1193"]`. Answer: "In the study of anti-LGI1 antibody encephalitis, **28%** of patients experienced a relapsing course (n = 55).**[1]** The median time from initial admission to first relapse was **764 days (IQR 355, 1,193)**.[2]" Desktop UI, same question: route chip "General: a results question, answered from the papers themselves (**LGI1**)", badge "4 figures checked", badge tooltip "**Every figure in this answer was found beside its claim in a cited passage. 2 of 2 sentences carry a citation.**", quality control "**High confidence - answer quality**". `8565cc8f` Results: "A total of **16 (30%)** patients experienced at least 1 relapse, at a median of **414 (IQR 256, 967)** days"; `grep` for "28%", "(28)" and "relapsing course" in `8565cc8f` returns **nothing**. `7622042349` (anti-NMDAR): "A total of 19 patients (**28%**) had at least 1 relapse, which occurred at a median of **764 (IQR 355, 1,193)** days from the initial admission". Document chat on `8565cc8f`, 6.0 s: "A total of **16 (30%)** patients experienced at least one relapse.[1] The median time to first relapse was **414 days (IQR 256, 967)**.[1]" | The check must locate the figure in **the paper the marker names**, not anywhere in the retrieved set: 28% is not in `8565cc8f` and the marker still says [1]. Then bind the claim's disease/antibody qualifier the way the population clause is now bound - "anti-LGI1" must not be satisfied by a paper whose cohort clause says "anti-NMDAR". Platform: the DA relation graph already links each paper to its antibody entity; take `resource_filters` from the entity the question names and run the answer over that filtered set, instead of letting the rescue lookup roam the whole retrieval. |
| **D7-02** | **P0** | epi, research | Ask cohort pin | A named cohort's headline outcome answered from a sub-study, with no flag, in two of three wordings. X2 / PA3b: "What proportion of the Australian autoimmune encephalitis consortium cohort had a favourable modified Rankin score at 12 months?" | "154 (67%) of 231" (`9dd53383`, which was in the sources). | X2 `done` 10.0 s, PA3b 8.4 s. Both: "In the Australian Autoimmune Encephalitis Consortium cohort, **80%** of patients had a favourable modified Rankin score (mRS <= 2) at 12 months.[1]" + "*Denominators: 80% is stated without a denominator*". [1] = `8565cc8f`, whose sentence is "Consistent with this observation, our cohort had an **80%** favorable mRS score at 12 months" - an **LGI1** cohort of 55. `9dd53383` (title: "Multimodal prognostication of autoimmune encephalitis: an **Australian autoimmune encephalitis consortium** study") was retrieved on both runs and reports "At 12 months, a favourable mRS (<= 2) occurred in **154 (67%)** patients"; document chat on it returns "**154** patients out of **231**" in 6.8 s. PA3a, which names the study and the 231, returns 154/231 correctly. Loop 6 at least flagged the 80% and printed the paper's own 79% beside it; that flag is now gone (correctly, the sentence is first-hand) and nothing replaced it. | The cohort pin must resolve a cohort named in the question to the paper whose **title or cohort clause** names that cohort, and prefer it over a member study. When two retrieved papers both claim the cohort, the one whose n matches the cohort wins. Platform: `/find` with `resource_filters` built from the consortium entity in the relation graph, not title-string similarity; the entity page already lists both papers under the consortium. |
| **D7-03** | **P0** | clinic, teaching | Ask contraindication check | The contraindication check passes on the presence of the word in the cited paper, without binding it to the drug. HW4: "Is carbamazepine contraindicated in juvenile myoclonic epilepsy?" | "The cited sources do not state that carbamazepine is contraindicated" (the wording CI1 produces). | `done` 9.3 s, `contraindicationsUnsupported []`. Answer: "**Yes, carbamazepine is contraindicated in juvenile myoclonic epilepsy (JME).[1]** The cited sources report that carbamazepine can exacerbate myoclonus, which is a symptom of JME, and should be avoided in its management." (second sentence uncited). [1] = `1a33ad7e`, whose **only** occurrence of the word is "**Valproate** is now contraindicated in women of childbear- ing potential without special precautions." The check demonstrably works when the word is absent: CI1 produced `contraindicationsUnsupported ["carbamazepine","phenytoin"]` and printed "*The cited sources do not state that carbamazepine or phenytoin are contraindicated or should be avoided here.*"; CI4 passed "levetiracetam is **not** contraindicated" against the same paper. | Require the contraindication sentence in the cited paper to name **the same medication** as the claim (and the same population), the way the figure check now requires the population clause. A word-presence test on a class-wide safety verb is the single most dangerous check in the portal. Platform: the DA relation graph records medication entities per paragraph - require the located paragraph's medication entity to match the claim's before the contraindication passes. |
| **D7-04** | **P1** | all five | Ask, across wordings | The same figure question gives different answers depending on phrasing: 5 of 6 families were inconsistent across 15 wordings. | One answer per question, or a consistent refusal. | **Switch to brivaracetam** - J1 "13.9% ... (FAS).[2]"; PA1c "13.9% of patients with psychiatric comorbidity who switched from LEV to BRV (FAS).[1]"; PA1b drops the qualifier - "patients who switched from levetiracetam (LEV) to brivaracetam (BRV) achieved seizure freedom at 12 months in **13.9%** of cases (full analysis set).[1]" (13.9% is the psychiatric-comorbidity subgroup only); PA1a, which names EXPERIENCE and asks for both rates, **withholds everything**: "The generated answer stated figures (16.0%, 10.6%) that no retrieved passage carries beside their claim, so it has been withheld", `figuresRemoved ["16.0%","10.6%"]` - and 10.6% is the paper's own continuous-seizure-freedom figure for exactly that subgroup. **SUDEP hazard** - PA6a "aHR of 2.24 (95% CI: 1.07-4.68; P = 0.031).[1]"; PA6b, a synonym, **withholds** with `figuresRemoved ["2.10","4.84","0.082"]`. **LGI1 relapse** - PA2a correct (16 (30%), 414 days); P0c wrong (D7-01); PA2b leads with a second-hand range "approximately **14%-35%**" and then offers the NMDAR paper's 764 days as "another study". **Consortium mRS** - PA3a correct (154/231), X2 and PA3b wrong (D7-02). **Placebo rate** - PA4a "23.6% (395 out of 1,674)", PA4b "**22%** (n = 1,674, full analysis set)" (D7-05). Only **UMPIRE** was consistent across three wordings. | Two mechanisms have to converge: (a) the answer for a given claim must not depend on which paragraph retrieval happened to rank first - pin the answer to the paper the entity/cohort resolves to, then read it; (b) when the gate cannot tie a figure, run the rescue read over the pinned paper's full text before withholding, so PA1a and PA6b end where J1 and PA6a end. Platform: `rag_strategies: full_resource` on the pinned resource for the rescue read; `/find` with `resource_filters` for the pin. |
| **D7-05** | **P1** | trial design | Ask body | A mixture-model subgroup rate handed over as the planning assumption, paired with the whole analysis set's n. PA4b: "If I am powering an add-on trial, what placebo responder rate should I assume, and from how many patients is that estimate drawn?" | "23.6% (395 of 1,674)". | `done` 9.5 s, `figuresChecked 3, figuresUnsupported [], sentencesRemoved 0`. Answer: "you should assume a placebo responder rate of **22% (n = 1,674, full analysis set)**.[1] This estimate is drawn from a pooled analysis of 1,674 participants with focal-onset epilepsy who were randomized to placebo across multiple trials.[1]" `89ca061f` Results: "Data from **1,674** participants ... of which **395 (23.6%)** were 50% responders"; the 22% is a different sentence: "there were 2 groups of 50% responder rate: high (42%, 95% CI: 33-50%) and not high (**22%, 95% CI: 19-24%**)" for "all 40 other countries". PA4a on the same paper returns 23.6% (395/1,674). | Same defect class as D6-01, now in the denominator helper: the n must come from the figure's own sentence, and "22%" whose sentence says "not high group ... 40 other countries" must not inherit the pooled n. The outcome test should also reject a mixture-model component as an answer to "what rate should I assume". |
| **D7-06** | **P1** | epi | Ask denominator | A denominator taken from an unrelated paper and placed beside the figure as if it were its own. J10: "What proportion of people report depressive symptoms after a first seizure, and how many participants were enrolled?" | "196 participants ... 101 (51.5%) newly diagnosed epilepsy..." (`9cb1d5d7`, which was in the sources) - loop 6's answer. | `done` 7.7 s, `figuresChecked 4, figuresUnsupported [], sentencesRemoved 0`. Answer: "the mean prevalence of clinically significant depressive symptoms in people with first seizures is 17.1% (range 13-28%).[1] Additionally, **a total of 26 patients were enrolled in the study.[2]**" [1] = `8b337b45` (a scoping review), [2] = `527d096c` = "The utility of an **automated and ambulatory device** for detecting and differentiating epileptic and psychogenic non-epileptic seizures", whose Results read "**A total of 26 patients were enrolled in the study.**" Two papers, one sentence pair, "the study" singular. | "the study" in a two-part question must resolve to the paper that answered the first part. A second sentence that supplies an n for the first sentence's figure has to be checked against the first sentence's paper, or dropped. |
| **D7-07** | **P1** | epi, clinic | Ask body after a removal | The conclusion outlives the evidence that was removed for being fabricated. J9: "Is medication adherence associated with mortality in people with epilepsy?" | "This collection holds no study of adherence and mortality." | `done` 13.9 s, `sentencesRemoved 1, sentencesChecked 5, sentencesCited 4`. Answer: "**Yes, medication adherence is associated with mortality in people with epilepsy.[1][2]** The cited sources indicate that non-adherence to antiepileptic drugs is linked to increased mortality.**[1]** *A sentence naming RANSOM was removed: this collection holds no paper reporting that study, and no cited source states the finding.* Additionally ... hazard ratio of 1.41 (95% CI 1.02-1.97; 1,805 patients).[1] **This suggests that adherence to medication regimens is crucial for reducing mortality risk in this population.[2]**" [1] = `453cb4c1` (psychiatric comorbidity and mortality - no adherence result); [2] = `cb8ba600` (qualitative barriers - `grep -i mortalit` returns nothing). | When a removal takes out the only sentence supporting a claim, the claim's topic sentence and its concluding "this suggests" must go with it. The removal engine already knows which sentences depended on the removed one - CI3 and JOB4 print "*and a conclusion that rested on them*". Apply that here. |
| **D7-08** | **P1** | epi, teaching | Ask, absent-study banner | An answer with no source and no citation asserts a study's finding, and contradicts what the same build says two questions earlier. Z2: "What did the RANSOM study find about nonadherence and mortality?" | The banner alone, or "this collection holds no paper reporting RANSOM". | `done` 9.0 s, `sentencesChecked 2, sentencesCited 0, figuresChecked 0`, `citation` events: **none**, `sources` final: **empty**. Answer: "**The RANSOM study found that nonadherence to antiepileptic drugs is associated with increased mortality. This study highlights the significant impact of medication nonadherence on health outcomes for individuals with epilepsy.** *This collection does not hold RANSOM itself. The statements above come from sources that cite it second-hand; verify against the original before relying on them.*" There are no such sources: nothing was cited and nothing was listed. How this works: "**It never answers without a source. An answer with nothing to cite is not shown**" and "Nothing is drawn from general knowledge or from the internet." J9, on the same study, removes exactly this sentence as unsupported. | An answer with `sentencesCited 0` must not be shown; the banner should stand alone. And the banner's own wording ("come from sources that cite it second-hand") must be conditional on there being such sources. |
| **D7-09** | **P1** | teaching, research | Ask retrieval | A two-part question about a trial in the collection is answered "no source comes close", while search returns that trial first. JOB2: "For a registrar teaching session: what does the collection say about how often functional seizures are misdiagnosed as epilepsy, and what does the BREATHS trial test?" | Both halves; both are answerable. | `done` **2.2 s**: "This portal's sources do not answer this question directly, so no answer has been generated. The closest passages found were only weakly related (best match **22%**). **No source in the corpus comes close to this question**, so none is listed as a match." `/api/t/eprepo/search?q=BREATHS` returns `f0c5046b` "Breathing control training as a treatment for functional seizures (BREATHS trial)" as hit 1. Split, both halves answer: JOB2b (10.1 s) "The BREATHS trial tests the efficacy, acceptability, and cost-effectiveness of Breathing Control Training (BCT) compared with a control intervention called 'Befriending' ...[1]"; JOB2c (10.2 s) "approximately 30% of patients admitted to video-electroencephalogram (v-EEG) monitoring units.[3]". A plainer two-part version (JOB2d) answers one half and removes the other's figure. | A retrieval that scores 22% on a question naming a study the catalogue holds means the named-study pin did not run before the relevance floor was applied. Run the acronym/title lookup **first** and inject the resource, then apply the floor to what remains. Platform: `/find` with `resource_filters` on the looked-up resource, merged into the passage set before scoring. Also split a multi-clause question into its clauses before declaring no coverage - `/subqueries` already exists. |
| **D7-10** | **P1** | epi, trial design | Ask gate and the rescue helper | A figure removed as unverifiable is quoted verbatim two lines below - the loop 6 defect, reopened. And a rescue offers an unrelated study's figure. | Keep the sentence and cite it. | JOB5 `done` 12.4 s, `figuresRemoved ["3.6","2.9","4.4"]`, `foundIn ["Association Between Psychiatric Comorbidities and Mortality in Epilepsy"]`: "*One sentence was removed from this answer: its figures (3.6, 2.9, 4.4) could not be verified - the cited passage carries them for a different outcome or follow-up*" immediately followed by "*For the outcome asked about, [1] itself reports: \"Mortality of PWE with (SMR **3.6**, 95% confidence interval [CI] **2.9-4.4**; Table 2) and without a lifetime history of a comorbid psychiatric disorder (SMR 2.5, 95% CI 1.9-3.2; Table 2) were both greater than that of the general population.\"*" X3 answers the same question cleanly minutes earlier. JOB4 (implanted-device retention) removes two sentences and then offers "*For the outcome asked about, [4] itself reports: \"The Kaplan-Meier estimated retention rate was 87%, 72%, and 60% at 1, 3, and 5 years, respectively (FAS, n = 238)\"*" where [4] = `e9f426d9`, an **oral lacosamide** open-label extension, under a question about implanted devices - and never mentions UMPIRE, which is in `foundIn`. | When the rescue read finds the sentence in the cited paper, **rebind and keep it** rather than removing and quoting - How this works promises exactly this. The offered sentence must share the question's intervention class, not only its outcome noun ("retention"). |
| **D7-11** | **P2** | teaching | Assessment | A knowledge check asked for six questions returns one, its quote comes from a machine-written summary, and its source label names a different paper. | Six questions, each quoting the paper. | `POST /generate {"kind":"assessment","query":"Autoimmune encephalitis: immunotherapy and outcomes","count":6}`, 12.6 s: `"questions"` has **1** entry; `"omitted_questions": 2, "omitted_secondhand": 1, "omitted_unsourced": 1`. That question: `source_resource_id "9dd53383..."`, `source_title "Multimodal prognostication ... consortium study"`, but `source_label "Second-line immunotherapy and functional outcomes in autoimmune encephalitis: A systematic review and individual patient data meta-analysis"`, and `source_quote "anti-LGI1 antibody-mediated encephalitis was associated with better recovery"` - which appears in `9dd53383` only inside `texts/da-pagesummary-f-...`, a generated field, not the paper. How this works: generated fields are "shown on the document page as generated fields, **never as the paper's own words**". | Generate more candidates and keep asking until `count` survive the checks, or say plainly "1 of 6 questions survived the source check". Restrict `source_quote` to the extracted paper text, excluding `da-*` generated fields. Drop `source_label` or make it the same paper as `source_resource_id`. |
| **D7-12** | **P2** | all | Ask, absent-study banner | The coverage banner fires on things that are not studies, telling me the collection does not hold papers it holds. | Fire only on a recognised study name. | 4 banners in 72 asks, **2 of them bogus**: E1 "*This collection does not hold **JME1 2** itself*" on an answer whose only source is `e265c72c`, the JME withdrawal cohort paper it cites in the sentence above; CI2 "*This collection does not hold **SUDEP1** itself*" on an answer sourced entirely from `020e1d7c`. "JME1 2" and "SUDEP1" are extraction artefacts - a condition abbreviation glued to a reference marker. The two real ones (RANSOM, SANAD II) are correct. | Require a candidate study name to look like one (an acronym of >= 4 characters with no trailing digit-space-digit, or a title match in the catalogue) and to be absent from the catalogue by lookup, before the banner fires. Platform: run the candidate through the same `/search` author/title/acronym lookup the search box uses; it resolves BREATHS and SANAD II correctly in 12-27 ms. |
| **D7-13** | **P2** | clinic | Ask body | A bolded "Inference" section carrying uncited clinical advice, and an "this is an inference" aside. | Either cited, or not shown. | J1, after the cited body: "**Inference:**\n Given the modest seizure freedom rate and improved tolerability, BRV may be a suitable alternative for patients experiencing behavioural side effects on LEV, but expectations should be managed regarding seizure freedom outcomes." No marker, `sentencesChecked 10, sentencesCited 7`. JOB4: "The specific retention rate for the seizure advisory system trial is not explicitly stated, **so this is an inference based on available data**." The app renders inline `(inference)` / `[inference]` marks (`AnswerStream.tsx:222`), so a `**Inference:**` heading is a leak the renderer does not catch. | Treat a heading or a lead-in whose text is "inference" the same way as the inline mark, and strip an uncited recommendation sentence in a clinical answer. |
| **D7-14** | **P2** | all | Help assistant | The Help assistant gives a bare, uncited, false assurance about the check. | "It withholds a figure it cannot verify, and says so; here is how to read the badge." | `POST /docs/ask {"query":"Does the portal ever show a figure it could not verify?"}`, 25.0 s, one delta: "**No, the portal does not show a figure it could not verify.**" No citation. Retrieved sources were "Watch a search" (relevance **0.01**) and "Explore" (relevance **0**). The same session showed 28%, 80% and 22% under clean badges. | Apply the Ask citation floor to the Help assistant: a one-sentence answer over 0.01-relevance passages should be a "the documentation does not cover that" instead. |
| **D7-15** | **P3** | all | Ask markers | Citation markers on papers that do not carry the statement, including on a sentence asserting an absence. | One marker per source that carries it. | W6 "The base year for this projection is 2024.**[1][2]**", [2] = `4492ee1d` (work productivity). J2 "The strongest modifiable risk factor for SUDEP is the frequency of tonic-clonic seizures.**[1][2][3]**", [2] = a cardiac-arrhythmia variants paper, [3] = a polygenic burden paper. HW1 "the specific findings regarding levetiracetam versus valproate for generalised epilepsy are not detailed in the provided context.**[2][3][4]**" - four citations for a statement of absence. The Generate path has this right; Ask does not. | Emit a marker only for a resource whose located passage supports the sentence - the per-sentence check already computes that set, and the briefing path already uses it. |
| **D7-16** | **P3** | trial design | Ask reformat table | Three cells in the reformat table are wrong or empty when the figures are in the sources, and the header carries markers. | n = 4201 for perampanel; "Pooled analysis" under Design. | TF2: "\| Drug \| Study \| Design \| n \| 12-month Retention \| **12-month Seizure Freedom [1][2]** \|" (markers inside a header cell); "\| Brivaracetam \| EXPERIENCE \| **FAS** \| 1644 \| 71.1% \| 14.9% (n = 1111) [2] \|" - "FAS" is an analysis set, not a design, and the addendum says 5 cells were marked for exactly that reason yet this one was not; "\| Perampanel \| PERMIT \| Not reported \| **not verified** \| 64.2% \| not verified \|" while `433567db` reads "64.2% (**2698/4201**)" and R05/HW5 returned it minutes earlier. | Take the Design cell from the catalogue's study-design label (`kind`), which reads "pooled-analysis" for both. Take the n from the same parenthesis as the retention figure. Strip markers from header cells. |
| **D7-17** | **P3** | trial design, research | Latency | The reformat turn and one research question are far slower than anything else, and the audit tail doubled. | Under 20 s. | TF2 first word **32.1 s**, done **46.6 s**, end 54.5 s (loop 6: 14.4 / 16.7). X1 first word **47.7 s**, done 50.8 s (loop 6: 17.0 / 20.9). Help assistant first question 41.4 s. Audit tail median 1.2 -> **2.4 s**, maximum 7.0 -> **8.0 s**. | Build the reformat turn from the session's already-verified statements rather than re-retrieving; cap the rescue read's breadth (JOB4's `foundIn` names nine papers). |
| **D7-18** | **P3** | clinic | Document chat | A stale or wrong document link is reported as the document having no answer. | "This document does not exist." | `POST /ask {"resourceId":"89ca061f5f4e4e2ba3b5d8b0a5c6d7e8", ...}` (a non-existent id; `GET /resources/<id>` returns **404**) responds in 2.3 s with "This document does not state an answer to that question. Ask about something it covers - its methods, findings or limitations - or search the whole corpus instead." The library page for a bad id gets this right ("This document does not exist ... the link is out of date"). | Resolve the resource before generating and return the not-found state that the library page already has. |
| **D7-19** | **P3** | research | Resource detail | Every paper's browser tab reads "Document", so six open papers are indistinguishable. | "Anti-LGI1 immunotherapy \| EpRePo Research Portal". | `/library/8565cc8f77a444608d6fded78f602c79` -> `document.title` = "Document \| EpRePo Research Portal"; the `h1` on the page is the full paper title. | Set the title from the paper's curated short title, truncated. |
| **D7-20** | **P3** | research | Ask effect-size helper | A malformed quote with an unbalanced bracket and a stray colon. | A clean quoted sentence. | HW3: "*Effect size in the cited passage: for \"8 of the 348 pregnancies exposed to AEDs other than valproate (15.1% vs 2.30%\", OR = 7.57: 95% CI = 3.35-17.1 [1].*" | Quote whole sentences with balanced brackets, and use a comma before "95% CI". |
| **D7-21** | **P3** | all | Help assistant | A stripped marker template leaves a broken sentence. | "a bracketed citation marker like [1] that links to..." | Help answer 1: "Each factual claim in an answer carries a bracketed citation marker **like that links to** the exact source passage." | The marker sanitiser is stripping the example marker in the documentation text; exempt the Help assistant's own prose. |
| **D7-22** | **P3** | epi | Ask two-part | Half a two-part question is silently dropped after a removal, with no rescue offered. | "recruited from Epilepsy Monitoring Units in Australia and the USA". | C02: "The lamotrigine SUDEP study included 101 SUDEP cases and 199 living epilepsy controls.[1] *One sentence was removed from this answer: its figures (18 years) could not be verified - no retrieved passage carries them beside the claim.*" The question's second half ("where were they recruited?") is never answered; loop 6 answered it. | When a removal takes out the only sentence answering one clause, run the rescue read for that clause before finishing. |

**Counts: P0 3 (D7-01, D7-02, D7-03), P1 7 (D7-04 to D7-10), P2 4 (D7-11 to D7-14) plus D6-07,
D6-16 and D5-14 carried over, P3 8 (D7-15 to D7-22).**

---

## 6. The single change that would move the score most

**Stop letting the answer roam the whole retrieved set, and pin the sources to the cohort, the
antibody, the drug and the study the question names before a word is generated.** Three loops have
now tried to fix this inside the checker - first by widening the net, then by narrowing it, then by
binding the population clause - and each time the same defect reappears somewhere the last rule did
not reach: this loop it is across antibodies (D7-01: the LGI1 question answered with the NMDAR
paper's 28% and 764 days), across a cohort and its sub-study (D7-02: the consortium's 154/231
replaced by an LGI1 sub-study's 80%), across drugs in a safety verb (D7-03: carbamazepine
"contraindicated" passing on a sentence about valproate), and across papers in a denominator
(D7-06: 26 patients from a device study attached to a scoping review's 17.1%). The checker is a
post-hoc string matcher over a paragraph bag that contains four other cohorts' papers; no matching
rule can make that bag safe, because the correct answer and a wrong-but-plausible answer are both
in it. The evidence that the fix belongs upstream is that **document chat, which sees one paper,
got every one of these right** - 16 (30%) at 414 days, 154 of 231, 23.6% of 1,674 - in six to seven
seconds, while Ask, which sees eight papers, got them wrong under a "High confidence" badge.

Concretely: (1) resolve every cohort, antibody, trial acronym, drug and study name in the question
against the catalogue and the entity graph **first**, and constrain retrieval to the resources that
resolve, exactly as document chat is constrained; (2) run the answer over that constrained set; (3)
let the rescue read look only inside the pinned resources, so it can rebind but never import from a
neighbouring cohort; (4) require the paper the marker names to carry the figure - 28% was cited to
a paper that does not contain it. This closes all three P0s and D7-05, D7-06 and D7-09, and it
should also close most of D7-04, because the wording sensitivity comes from which paragraph
retrieval happened to rank first, which a pin removes.

**Platform.** This is where Progress Agentic RAG carries the fix rather than the portal
re-implementing it. The DA relation graph already links each paper to its antibody, condition,
medication and consortium entities - the `/entity` endpoint returns 18 resources for SUDEP in one
call. Use those entities to build `resource_filters` for `/find`, then `rag_strategies:
full_resource` on the pinned resource for the rescue read and the contraindication check.
`citations: true` gives the paragraph-level attribution the marker check needs, so "28% is not in
the paper [1] names" becomes a platform-answered question rather than a local grep.

**Next three:**

1. **Bind the safety verbs the way figures are bound** (D7-03). The contraindication check must
   match the medication, not just the word; the same applies to "should be avoided", "black box"
   and "first-line". This is the one defect in the report that could hurt a patient.
2. **Make a removal take its dependants with it, and never answer with nothing** (D7-07, D7-08,
   D7-10). If the sentence carrying the evidence goes, the topic sentence and the "this suggests"
   go too; an answer with `sentencesCited 0` is not shown; and when the rescue read finds the
   sentence in the cited paper, rebind and keep it instead of removing it and quoting it two lines
   below.
3. **Answer the same question the same way** (D7-04), then re-audit How this works against the
   build. Six of its statements are falsifiable on this build - "It never answers without a source"
   (Z2), "every sentence with a figure must cite a paper about that cohort" (P0c, X2), "the sentence
   is cited to that paper instead" (JOB5), "a denominator is only ever added from the figure's own
   bracket or table cell" (J10, PA4b), "A medication the answer calls contraindicated must be called
   that by a cited passage" (HW4), and "the answer says so rather than [inventing]" for a study the
   collection lacks (Z2). The page is the best-written thing in the portal and the only document a
   CIO will read closely; every sentence in it has to survive three questions.

---

## 7. Coverage notes (corpus, not application)

- No adherence-and-mortality study in the collection - still true, still handled badly
  (D7-07, D7-08) rather than stated.
- No annual incidence rate for Australian adults; J8's "This portal's sources do not answer this
  question directly" with three closest matches is the right failure.
- No ESETT trial (HW2 correctly says so and lists the closest RCTs); no SANAD II (HW1 banner
  correct); no RANSOM (banner correct but the answer is not).
- No proportion of JME patients with generalised spike-wave on EEG - J4's boundary is right.
- No anxiety prevalence at first seizure separate from depression; `8b337b45` gives 17.1%
  (range 13-28%) for depressive symptoms only.
- The multiday heart-rate paper reports phase locking twice ("10 of these", abstract; "17 (89%)",
  Results); W5 and X1 are each right for their claim, which still reads as inconsistent across turns
  without being wrong.
- The BREATHS protocol gives "A total of 220 participants (110 per group)"; the answer's removed
  "110" was the per-arm figure, so the honest answer is 220 - a corpus phrasing the check reads
  conservatively rather than a gap.
- All 42 of his articles are present; author lookup returns 62 (42 articles plus 20 supplements).

---

## 8. Performance table

Seconds from the request. "first" = first delta, "done" = final text, "end" = audit and quality
received. Medians over **71** asks: **first 8.8, done 11.6, end 16.6**; audit tail median 2.4 s,
maximum 8.0. Loop 6 medians: first 10.3, done 12.1, end 13.2, tail 1.2.

| Q | first | done | end | verdict |
|---|---|---|---|---|
| P0c | 6.3 | 8.2 | 10.0 | **D7-01 (P0)**: 28% / 764 days from the NMDAR paper, High confidence |
| X2 | 8.3 | 10.0 | 17.6 | **D7-02 (P0)**: 80% from the LGI1 sub-study for the consortium |
| PA3b | 6.8 | 8.4 | 16.3 | **D7-02**: same, second wording |
| PA3a | 11.7 | 14.0 | 21.7 | correct: 154 of 231 |
| HW4 | 7.4 | 9.3 | 10.3 | **D7-03 (P0)**: "carbamazepine is contraindicated", check passed |
| CI1 | 7.8 | 10.5 | 11.6 | correct: `contraindicationsUnsupported ["carbamazepine","phenytoin"]` |
| CI4 | 8.7 | 11.1 | 12.0 | correct, second-hand 18% flagged |
| J1 | 12.5 | 24.6 | 24.6 | **D6-01 fixed**: 13.9%; "**Inference:**" leak (D7-13) |
| PA1a | 10.5 | 12.8 | 20.7 | **D7-04**: withheld where J1 answers |
| PA1b | 11.0 | 13.3 | 21.3 | 13.9% with the subgroup qualifier dropped |
| PA1c | 13.6 | 16.5 | 24.4 | correct |
| PA2a | 16.0 | 19.5 | 26.3 | correct: 16 (30%), 414 days |
| PA2b | 6.1 | 8.4 | 16.2 | second-hand 14-35% leads; 764 days offered as "another study" |
| PA4a | 10.0 | 11.6 | 19.5 | correct: 23.6% (395/1,674) |
| PA4b | 7.4 | 9.5 | 17.2 | **D7-05 (P1)**: 22% with n = 1,674 |
| PA5a / PA5b | 14.1 / 7.5 | 15.8 / 9.6 | 17.8 / 17.5 | consistent and correct |
| PA6a | 8.3 | 10.4 | 18.0 | correct: aHR 2.24 |
| PA6b | 12.8 | 13.0 | 14.4 | **D7-04**: withheld on a synonym |
| J9 | 10.6 | 13.9 | 21.6 | **D7-07 (P1)**: conclusion survives the removal |
| Z2 | 6.7 | 9.0 | 16.6 | **D7-08 (P1)**: 0 citations, 0 sources, a finding asserted |
| J10 | 5.8 | 7.7 | 8.3 | **D7-06 (P1)**: 26 patients from an unrelated study |
| JOB2 | 2.2 | 2.2 | 2.2 | **D7-09 (P1)**: "no source comes close" for BREATHS |
| JOB2b / JOB2c | 8.1 / 8.0 | 10.1 / 10.2 | 12.2 / 12.0 | both halves answer when split |
| JOB5 | 10.0 | 12.4 | 20.1 | **D7-10 (P1)**: SMR 3.6 removed then quoted |
| JOB4 | 6.9 | 13.5 | 14.3 | **D7-10**: a lacosamide retention offered under a device question |
| D02 | 8.7 | 11.5 | 18.4 | **D6-04 fixed**: 46.3%, n = 121 |
| J2 | 5.6 | 8.1 | 15.7 | **D6-05 fixed**: aHR 2.24; stray [2][3] |
| HC1 | 13.9 | 15.5 | 23.5 | **D6-06 fixed**: 45 (23-71), 13 (50%) |
| TF1 | 13.6 | 23.8 | 25.9 | 71.1% (n = 1644) returned; 74.2/57.7 correctly removed |
| TF2 | 32.1 | 46.6 | 54.5 | **D6-03 fixed**; slow (D7-17); three weak cells (D7-16) |
| X5 | 10.5 | 14.5 | 15.9 | **D6-10 fixed**: one item per paper, protocol labelled |
| HW6 | 9.0 | 11.6 | 19.5 | new: 17.6% (739/4201), 20.6% (856/4164), 9.6% (414/4294) |
| HW5 | 11.3 | 13.4 | 14.7 | named-study pin holds: 71.1% (n = 1644) |
| HW3 | 7.4 | 10.0 | 12.7 | honest; malformed quote (D7-20) |
| HW1 / HW2 | 24.4 / 24.3 | 28.3 / 24.3 | 29.5 / 24.3 | SANAD II banner correct; ESETT boundary correct; both slow |
| R01-R08, C01, C02, D01 | 5.1-11.9 | 7.0-14.9 | 8.0-17.3 | all correct, all clean audits |
| W1 / W4 / W5 / X1 / X3 | 5.9-47.7 | 7.7-50.8 | 9.9-58.7 | all correct; X1 very slow (D7-17) |
| E1 / E2 / E3 | 9.7 / 11.0 / 10.8 | 13.4 / 12.9 / 12.4 | 21.3 / 20.9 / 20.4 | chain holds; E3 now gives 416 of 2018 (20.6%); bogus banner on E1 (D7-12) |
| G01 / J3 / J4 / J5 / J6 / J7 / J8 | 5.6-20.7 | 8.1-20.7 | 9.9-20.7 | all correct or honest boundaries |
| DC1b / DC3 / DC4 | 5.1 / 4.3 / 6.8 | 6.5 / 6.0 / 6.8 | 9.6 / 7.8 / 8.3 | document chat right where Ask is wrong |

Non-ask: search 12.5 ms (PMID) to 2.52 s (two-word phrase); facets 543 ms; catalogue filter 14 ms;
entities 265 ms; entity 4.14 s; briefing 14.9 s; assessment 12.6 s; investigation create 0.06 s,
synthesis 11.8 s; Help assistant 14.7-41.4 s; page loads 0.55-2.27 s desktop, resource detail
1.19 s, library facet 1.16 s.

Streaming marks on a real 390 px layout viewport: "Unchecked - still streaming, the check follows"
at 1.13 s, "Answer complete" with the badge at 6.89 s on a second run - honest and quick.

---

## Is the bar met?

**No.** The bar is a score of 9 or higher with no open P0 and no open P1. This loop scores **7**
with **three open P0s** (D7-01 wrong-antibody figures under High confidence, D7-02 a named cohort's
outcome taken from a sub-study, D7-03 a contraindication passing on a different drug) and **seven
open P1s** (D7-04 to D7-10).

**What stands between this build and the bar** is one defect, in its third loop: the answer is
generated and checked over a bag of paragraphs drawn from several cohorts, and every rule added to
the checker - the outcome noun, then the exact outcome, then the population clause - is a filter on
a set that should never have contained the wrong cohort's paper. The proof is that document chat,
which is scoped to one paper, returned the right answer for all three P0 cases in six to seven
seconds. Loop 6 said the same thing about the population clause and the fix worked exactly as far
as the rule reached; extending it again will move the failure somewhere else next loop. The change
that ends it is scope: resolve the entities the question names, constrain retrieval to them, and
require the paper a marker names to carry the figure.

**This gap is application work, with one platform dependency.** The application work is the pin
(resolve cohort/antibody/drug/trial before retrieval and constrain to it), the marker-to-paper
check, the dependent-sentence removal, the citation floor on Z2's path, the two-part question split
before declaring no coverage, and the drug binding in the contraindication check. The platform
dependency is that the pin should be built from Progress Agentic RAG's own relation graph and
`resource_filters` rather than a local title-similarity heuristic - the entities are already there
(`/entity?name=SUDEP` returns 18 resources), which is what makes this a wiring job rather than a
new subsystem. The corpus limits I met this loop (no adherence-mortality study, no ESETT, no annual
incidence rate, no JME EEG proportion) were all handled honestly except where the application filled
the gap itself, which is D7-07 and D7-08. The remaining latency floor - a 32 s reformat turn and a
47 s outlier - is a P3, and is not what holds the score at 7.
