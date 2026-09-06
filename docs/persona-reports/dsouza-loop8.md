# D'Souza persona test - loop 8 report

Persona: Professor Wendyl D'Souza (epileptologist and epidemiologist, St Vincent's Melbourne),
eighth use of the portal, after the loop 7 fixes (PRs #23 and #24: retrieval PINNED to the
antibody, consortium, registry, trial acronym, quoted title or described cohort the question
names; safety verbs bound to the medication nearest them with strength tiers; removals take their
dependent sentences; an answer that asserts anything with nothing to cite is refused; the cohort
guard and several checker rules deleted).

Build under test: `http://localhost:8787/t/eprepo`, `/api/health` =
`{"ok":true,"web":true,"version":"178f439158a5","build":{"sha":"178f439158a5","builtAt":"2026-09-06T05:51:35.513Z"},"docs":{"eprepo":{"documents":14,"ok":true}},"docsOk":true}`
(`git log`: `178f439 Merge PR #24: pin retrieval to what the question names...`). Read-only run,
6 September 2026. Nothing edited, no server started or stopped, no commit; one investigation, two
evidence cards, one synthesis and one watch created under the anonymous client. Corpus counters:
998 resources, 106,750 paragraphs, 103,293 sentences.

---

## The one fact you asked for first

**Yes. A wrong figure is still served under a confident badge, and I reproduced it on the desktop
and on the phone, in light and in dark.**

Query (the trial-design question I actually ask): *"If I am powering an add-on trial, what placebo
responder rate should I assume, and from how many patients is that estimate drawn?"*

> For powering an add-on trial, you should assume a placebo responder rate of **22% (n = 1,674,
> full analysis set)**.[1] This estimate is drawn from a pooled analysis of 1,674 participants with
> focal-onset epilepsy who were randomized to placebo across multiple trials.[1]

Badge: **"3 figures checked"**. Badge tooltip: **"Every figure in this answer was found beside its
claim in a cited passage. 2 of 2 sentences carry a citation."** Confidence:
**"High confidence - answer quality"**. Audit: `figuresChecked 3, figuresUnsupported [],
sentencesRemoved 0, denominatorsMissing []`. First word 5.7 s, done 7.7 s.

The paper (`89ca061f`) says: *"Data from **1,674** participants ... of which **395 (23.6%)** were
50% responders."* The 22% is a different sentence entirely: *"there were 2 groups of 50% responder
rate: high (42%, 95% CI: 33-50%) and not high (**22%, 95% CI: 19-24%**)"* - a mixture-model class
covering "all 40 other countries". The portal has paired the mixture-model subgroup's rate with the
whole pooled denominator and called it the full analysis set, and **the passage that contradicts it
is printed on the same screen, in the evidence list, three centimetres below the answer**. Ask the
same paper directly in document chat and it gets it right in 15.6 s: *"The placebo 50% responder
rate was 23.6% among 1,674 participants, with 395 participants being 50% responders."*

If I take 22% to a grant panel as the planning assumption, I under-power the trial. This is the
same defect loop 7 logged as D7-05 and it is unchanged, because the question names no study and so
no pin fires.

---

## 1. Session summary

| | |
|---|---|
| Ask requests (API, SSE) | **61** - 25 pinned across 15 families in 2-3 wordings each, 26 unpinned topic/comparison questions, 5 document chats, 5 absent-study and safety probes |
| Every cited figure verified | against `/api/t/eprepo/resources/:id/content` (whole extracted text pulled and grepped) for 14 papers: `8565cc8f`, `2c1353ee`, `59d5117c`, `89ca061f`, `453cb4c1`, `020e1d7c`, `dc05b6a3`, `73114ce9`, `433567db`, `7622042349`, `e5bffb27`, `b2383b42`, `8b337b45`, `83bc89d3`, `7f3cec99` |
| Searches / lookups | 12 (author x2, DOI, PMCID, PMID, 5 phrase searches, an unknown term, BREATHS), facets, 3 catalogue filters, entities, entity |
| Document chats | 5 (`89ca061f`, `8565cc8f`, `9dd53383`, `dc05b6a3`, a bad id) |
| Generate | 1 assessment (16.9 s), 1 briefing (18.9 s) |
| Investigation | created 0.1 s, 2 evidence cards, synthesised 9.3 s |
| Browser | 11 routes x light/dark x 16 px/22 px root at a **true 390 px layout viewport** (`innerWidth` 390 measured), plus 1440 px and 1600 px passes; resource detail, unknown-id state, entity page, knowledge map, streaming marks, badge and confidence tooltip |
| Help assistant | 3 questions |

Timings: first word median **9.0 s**, done median **12.1 s**, audit tail median **4.7 s**
(loop 7: 8.8 / 11.6 / 2.4). 11 of 60 asks over 15 s to first word; worst **78.7 s** (U1). Two
batteries overlapped for part of the run, so the tail is a soft upper bound.

---

## 2. Regression table

### The loop 7 findings

| ID | Status | Evidence |
|---|---|---|
| **D7-01** P0: one antibody's question answered with another antibody's figures | **Fixed** | P0c, same wording: "In anti-LGI1 antibody encephalitis, **16 out of 55 patients (30%)** experienced at least one relapse. The median time to first relapse was **414 days**, with an interquartile range of 256 to 967 days." One source pinned (`8565cc8f`), `figuresChecked 6, figuresUnsupported [], sentencesRemoved 0`. PA2a and PA2b return the same numbers. Three wordings, one answer. |
| **D7-02** P0: a named cohort answered from a sub-study | **Fixed on two wordings of three; a new sub-study substitution on the third** | X2 (10.0 s->15.6 s): "154 patients (67%) had a favourable modified Rankin score (mRS <= 2) at 12 months (**n = 231**).[1]" PA3a the same. But **PA3b** ("what share of patients reached a good functional outcome (mRS 0-2) **one year on**") returns "**82.7%** had good functional outcome (mRS <=2)" from `2c1353ee` - also a consortium paper, but n = 57 and **a median follow-up of 700 days**, not 12 months. See **D8-02**. |
| **D7-03** P0: contraindication check passing on the wrong drug | **Fixed on the drug; open on the condition** | HW4 now: "*The cited sources do not state that carbamazepine is contraindicated here. What the cited sources do say: \"Carbamazepine, which is not recommended for treatment of JME\" [1].*", `contraindicationsUnsupported ["carbamazepine"]`. The drug binding works. The **second** sentence does not: "carbamazepine and phenytoin can exacerbate myoclonus, which is a symptom of JME, and should be avoided.**[2]**" - [2] = `7f3cec99`, *"Guidelines on the diagnosis, clinical assessments, treatment and management for **CLN2 disease** patients"*. See **D8-08**. |
| **D7-04** P1: the same question answered differently across wordings | **Fixed inside the pin, unchanged outside it** | Fixed: LGI1 relapse 3/3; SUDEP hazard 2/2 (PA6a "aHR of **0.56** (95% CI 0.31-1.01, p = 0.054)", PA6b the same plus the GTCS 2.24 - both verbatim in `020e1d7c`, and both consistent for the first time in eight loops); brivaracetam switch J1/PA1b/HW5/DC4 consistent. Still broken: **PA1a** (names EXPERIENCE, asks two rates) withholds where J1 answers; **PA3b** vs X2; **U8** (22%) vs **PA4a** ("23.6% among 1,674 participants, with 395 participants achieving this response"); **PA5b** vs PA5a; **J10** vs U5; **JOB5** vs X3. Six families still split - and every one of the six splits along the pinned/unpinned line. |
| **D7-05** P1: mixture-model subgroup rate with the pooled n | **Not fixed** | U8, above. Identical to loop 7's PA4b, verbatim. |
| **D7-06** P1: a denominator taken from an unrelated paper | **Fixed on one wording, unchanged on the original** | Fixed: U5 "17.1% (range 13-28%) in first seizure cohorts.[1] This prevalence was measured in **three studies using validated cutoffs**.[1]" - `8b337b45` reads "**Three studies** provided prevalence based on validated cut-offs. The mean prevalence of depressive symptoms was **17.1% (range 13-28%)**". Unchanged: **J10**, loop 7's exact wording, still returns "Additionally, **a total of 26 patients were enrolled in the study**.[2]" with [2] = `527d096c`, the ambulatory-device paper. |
| **D7-07** P1: the conclusion outlives the removed evidence | **Mostly fixed; the lead claim survives** | U9 `sentencesRemoved 3`: the "Yes, medication adherence is associated with mortality" opener and the "This suggests that adherence ... is crucial" closer are both gone. What remains: "**The cited sources indicate that non-adherence to antiepileptic drugs is linked to increased mortality.[1]**" with [1] = `453cb4c1`; `grep -i adheren` on that paper returns one hit, in the Discussion, citing someone else's study of *response to medication* in adherent patients. See **D8-09**. |
| **D7-08** P1: an uncited answer asserting a study's finding | **Fixed** | Z2 now: "This portal's sources do not answer this question directly, so no answer has been generated. **This collection holds no paper reporting RANSOM.** The closest matches in the corpus are *Facilitators and barriers of antiseizure medication adherence...* - listed below but not used." `refused: true`. HT2 does the same for ESETT. |
| **D7-09** P1: "no source comes close" for BREATHS | **Fixed, at the cost of the other half** | JOB2 now answers: "The BREATHS trial ... comparing BCT to a control intervention called 'Befriending' over a 24-week period.[1] ... a clinically relevant absolute risk difference of 20% ... between BCT (**40%**) and Befriending (**20%**) at Week 12.[1]" But the first half of the same question - how often functional seizures are misdiagnosed as epilepsy - now returns "The cited sources do not provide specific data", because the BREATHS pin narrowed the sources to **one** paper. Asked alone, JOB2c answers it: "approximately **30%** of patients admitted to video-EEG monitoring units.[3]" See **D8-06**. |
| **D7-10** P1: a removed figure quoted two lines below; a rescue offering an unrelated study | **Half fixed, half turned into a refusal, and a worse variant appeared** | JOB5 no longer quotes what it removed - it now refuses outright, for a question X3 answers correctly minutes later (**D8-07**). But the reverse defect is now live: in **U7**, **U19** and the **briefing**, a figure listed in `figuresRemoved` is **still printed in the answer**. See **D8-03**. |
| **D7-11** P2: quiz shortfall, quote from a generated field, wrong source label | **Mostly fixed** | `source_label` is now `null`; both quotes are verbatim runs from `2c1353ee` ("First line treatment failure corresponded with increased odds of ICU admission."). Shortfall reported: `"requested": 6, "questions": 2, "omitted_questions": 1, "omitted_secondhand": 2, "omitted_unsourced": 4`. Still only 2 of 6. |
| **D7-12** P2: bogus absent-study banner on extraction artefacts | **Fixed** | No "JME1 2" or "SUDEP1" banner in 61 asks. Four banners fired, all on real study names (RANSOM, ESETT, GWPCARE6, plus SANAD II earlier), and the two coverage refusals name the study correctly. |
| **D7-13** P2: an "**Inference:**" heading with uncited clinical advice | **Fixed in that shape; the leak moved** | No `**Inference:**` heading in 61 asks. But **CI5** prints an internal check notice as **item 2 of a numbered list** - "2. *The cited sources do not state that lamotrigine is seizure-aggravating here.*" - and closes with an entirely uncited clinical recommendation: "Based on these points, while lamotrigine is not contraindicated, valproate may be preferred for its efficacy... However, lamotrigine remains an option due to its tolerability". See **D8-10**. |
| **D7-14** P2: Help assistant's bare false assurance | **Partly** | The answer now carries markers - "No, the portal does not show a figure it could not verify. If a figure cannot be verified ... the sentence containing it is removed ...**[1][2]**" - but the top retrieved source is still *"Watch a search"* at **relevance 0.01**, and the assurance is false on this build (see the headline). No relevance floor. |
| **D7-15** P3: citation markers on papers that do not carry the statement | **Fixed in one place, worse in others** | Fixed: W6 "The projection ... uses the year 2024 as its base for the Australian adult population aged 18-80 years, covering the period from 2024 to 2033.**[1]**" - one marker, right paper. Open and now attached to **figures**: U13 "In a study of **56** patients with refractory epilepsy, **6** became seizure-free on the third to sixth anti-seizure drug.**[4][5][6]**" where [4] = *Seizures in Sotos syndrome*, [5] = *Neonatal DEE with movement disorder and arthrogryposis*, [6] = *SYNGAP1 encephalopathy*. U22, U10, U18, U21, JOB2c the same. See **D8-04**. |
| **D7-16** P3: weak reformat-table cells | **Not re-tested this loop** (the reformat turn was dropped in favour of the pinned/unpinned split you asked for). |
| **D7-17** P3: latency tail | **Worse** | first-word median 8.8 -> **9.0 s**, done 11.6 -> **12.1 s**, **audit tail 2.4 -> 4.7 s median**. Worst case U1 **78.7 s** to done (loop 7's worst was 50.8 s). |
| **D7-18** P3: a bad document link reported as "no answer in this document" | **Not fixed** | `POST /ask {"resourceId":"89ca061f5f4e4e2ba3b5d8b0a5c6d7e8"}` (`GET /resources/<id>` = **404**) still returns, in 2.3 s: "This document does not state an answer to that question. Ask about something it covers - its methods, findings or limitations - or search the whole corpus instead." The library page for the same id gets it right. |
| **D7-19** P3: every paper's tab reads "Document" | **Not fixed** | `/library/8565cc8f77a444608d6fded78f602c79` -> `document.title` = **"Document \| EpRePo Research Portal"**, at 1440 px and at 390 px. Every other route now has its own title. |
| **D7-20** P3: malformed effect-size quote | **Not fixed, new instance** | U10: "*Effect size in the cited passage: for **"... channel function in the SUDEP cohort compared to the epilepsy control cohort"**, OR = 0.8, 95% confidence interval 0.17-3.8 [3].*" - a quote that opens with an ellipsis, on a cardiac-channel sub-analysis, under a question about modifiable SUDEP risk factors. |
| **D7-21** P3: stripped marker template in Help | **Not fixed** | Verbatim, this loop: "Every factual claim in an answer carries a bracketed citation marker **like, which links to** the exact source passage." |
| **D7-22** P3: half a two-part question dropped after a removal | **Recurs in a new form** | HT4 removes the half it can answer (see D8-05); JOB2 drops the half the pin excluded (D8-06); PA1a drops the half it has. |

### Older findings still under test

| ID | Status | Evidence |
|---|---|---|
| D5-01 the gate removes the paper's own sentences | **Reopened inside the pin** | HT4: `figuresRemoved ["28%"]`, reason "the cited passage carries them for a different outcome or follow-up". The paper's Results sentence is *"A total of **19 patients (28%)** had at least 1 relapse, which occurred at a median of **764 (IQR 355, 1,193)** days"* - **one sentence**. The build keeps the 764 and deletes the 28%. |
| D5-04 wrong quantity under a clean badge | **Still open** | D8-01, D8-02, D8-03, D8-04, D8-05. |
| D5-13 denominator addendum nags | **Regressed** | Fires on J1's 13.9% ("13.9% is stated without a denominator"), DC4's 71.1%, U3's 29%/11%, U18's 50%, U21's 0.6%, JOB2c's 30% - 6 of 61 asks, all on figures the paper genuinely gives without one. |
| D5-14 the paper's own figure offered after a removal | **Partly, and sometimes irrelevant** | HT4's offer, after deleting the relapse proportion, is *"Rituximab was administered in 33 patients (49%) during their acute admission..."* - not the outcome asked about. PA3b's offer is *"A subsequent study examined a group of 50 AE cases and their long-term functional outcomes (10)."* - a reference-list sentence. |
| D5-15 second-hand classifier | **Right most of the time, silent where it matters** | Correct: U13 flags 225/12%/37.0%; U23 flags 40%/50%; U25 flags 66%; U21 flags 4%; PA2b removes 14%/35%. Silent: U2's Dravet "16 per 1,000 ... 59%", which is second-hand in the paper it came from (the sentence there ends "(14)"), while its siblings 0.2/1.2/2.46 from the **same paper** were flagged. |
| D5-16 template leaks | **A new, worse one** | A raw platform error string reaches the browser verbatim. See **D8-07**. |
| D5-17 two clinical words routed as a lookup | **Holds** | `lamotrigine SUDEP` 21 resources, no lookup route, 38 ms; `sub-scalp EEG seizure forecasting` 18; `Zzzznotaname` 0. |
| D4-16 author and identifier lookup | **Holds** | `D'Souza` and `D'Souza W` -> `rule "author"`, 62 resources, 33-55 ms; DOI 33 ms, PMCID 33 ms, PMID 30 ms - all resolving `8565cc8f` exactly. |
| D3-02 correct figures withheld | **Regressed** | E1 and JOB5 both now refuse questions the collection answers and loop 7 answered. See **D8-11**. |
| D3-21 weak-match badge | **Works and is now correctly triggered** | The only refusals this loop were on genuinely absent studies (RANSOM, ESETT) or after a removal. |
| D6-13 synthesis dated in my timezone | **Holds** | `"title": "Synthesis - 2026-09-06"`, `createdAt 06:41:54Z` = 16:41 AEST. |
| D6-14 per-route page titles | **Holds except the paper page** | 10 of 11 routes distinct; D7-19 above. |
| D6-15 tap targets on the phone | **Holds** | At a true 390 px layout viewport, light and dark, 16 px and 22 px root: no control under 24 px on any of 11 routes. Residual: the desktop "Cards across the grid" slider is 16 px. |

**Summary of the 22 loop 7 findings: 8 fixed** (D7-01, D7-02 on 2 of 3 wordings, D7-08, D7-09,
D7-11, D7-12, D7-13 in shape, D7-15 in one place), **7 partly** (D7-03, D7-04, D7-06, D7-07,
D7-10, D7-14, D7-22), **6 not fixed** (D7-05, D7-17, D7-18, D7-19, D7-20, D7-21), **1 not
re-tested** (D7-16). **All three loop 7 P0s are closed on the wordings that named them.** Older:
D5-17, D4-16, D6-13, D6-15 hold; **D5-01, D5-13 and D3-02 have regressed**.

---

## 3. Verdict as Prof D'Souza, and score

The pin works, and it works exactly where you said it would: I asked about anti-LGI1 relapse in
three wordings and got 16 of 55 (30%) at 414 days every time, I asked about the consortium's
twelve-month mRS and got 154 of 231 (67%) instead of last loop's borrowed 80%, I asked whether
carbamazepine is contraindicated in juvenile myoclonic epilepsy and was told plainly that the
sources say "not recommended", not "contraindicated", and for the first time in eight loops the
lamotrigine SUDEP hazard came back the same - 0.56 (0.31-1.01) for the drug, 2.24 (1.07-4.68) for
tonic-clonic seizures - however I phrased it. But I do not spend my week asking about named
studies. I spend it asking what the evidence is for something, how common something is, and
whether one drug beats another, and in that half of the portal nothing has changed: I asked what
placebo responder rate to assume for powering a trial and was told **22% of 1,674, full analysis
set, "3 figures checked", "every figure was found beside its claim", High confidence** - and the
paper's own sentence, printed on the same screen, says 395 of 1,674, which is 23.6%. I asked to
compare brivaracetam and perampanel and got a perampanel open-label extension's 74.6% printed
**under a heading that says Brivaracetam**, and in the seizure-freedom version the answer gave me
22.1% for the placebo-converted arm when the paper says 17.1% for that arm, **while the same
answer's own footnote told me 22.1% had been removed as unverifiable**. And two questions this
build answered correctly last loop - the SMR in psychiatric comorbidity, and relapse after
withdrawal in JME - now refuse outright while the papers that answer them sit in the retrieved
list. You have made the tenth of my questions that name a study trustworthy and left the other
nine tenths where they were, and one of them now contradicts itself inside a single answer.

**Impact score: 7 / 10** (unchanged, but for a different reason: last loop the named-study
questions were the problem, this loop they are the good part). Open **P0: 2**. Open **P1: 8**. The
bar - 9 or higher with no open P0 or P1 - is **not met**.

---

## 4. What now has a positive impact (specific)

- **The pin is real and it holds across wordings.** 20 of 25 pinned asks were clean. LGI1 relapse
  3/3, SUDEP hazard 2/2, brivaracetam switch 4/5, UMPIRE (by acronym) 2/2, PERMIT, EXPERIENCE,
  RESILIENCE, SEEG survey, the lacosamide PGTCS trial and a **quoted title** all resolved to the
  right paper and the right number, most of them with a single source in the pin.
- **The absent-study decline is now exactly right.** "This collection holds no paper reporting
  RANSOM ... The closest matches in the corpus are *Facilitators and barriers of antiseizure
  medication adherence* ... listed below but not used." No fabricated finding, no bogus banner on
  an extraction artefact, and ESETT handled the same way.
- **The safety verb binds to the drug.** "*The cited sources do not state that carbamazepine is
  contraindicated here. What the cited sources do say: \"Carbamazepine, which is not recommended
  for treatment of JME\"*" is the sentence I wanted, and it quotes the weaker claim rather than
  hiding it.
- **The briefing is publishable.** Nine figures across two sections - 35.6-50.0%, 5.7-29.4%, 55.6%,
  30.3%, 90.5%, 79.8%, 64.2%, 58.3%, 23.2% - every one verified verbatim in `59d5117c`, `9a294fd1`
  and `433567db`, every one carrying `{figure, outcome, population, study}`, `takeaway_refs
  [[1,2],[3]]`, references with journal, year and full author lists. 18.9 s.
- **Document chat remains the most trustworthy surface** and is now the proof of the gap:
  23.6% of 1,674 (DC1, 15.6 s), 16 (30%) at 414 days (DC2, 7.5 s), 71.1% and 14.9% with n = 1111
  (DC4, 5.8 s) - all correct, all on papers where Ask was wrong or inconsistent.
- **Chrome.** Dark mode correct on all 11 routes (`body rgb(18, 19, 22)`); zero horizontal overflow
  at 1600, 1440 and a true 390 px viewport at the default font; no sub-24 px tap target on the
  phone; per-route titles; "This document does not exist ... the link is out of date" for a bad id;
  the paper page opens with the reader, three suggested questions and the chat box in 2.3 s; the
  streaming marks are honest and quick ("still streaming" at 11.9 s, "Answer complete" plus the
  badge at 13.1 s on a 390 px phone).
- **Investigations, watches, exports and the entity pages all work.** The synthesis is dated in my
  timezone and says plainly which evidence card it did not use (`"notUsed": [1]`).

---

## 5. New findings table

Severity: P0 trust/safety, P1 blocks a job, P2 misleading but workable, P3 polish. Application
defects only; corpus coverage is section 7.

| ID | Sev | Job | Surface | What happened (exact query) | Expected | Evidence (verbatim, timings, ids) | Suggested fix |
|---|---|---|---|---|---|---|---|
| **D8-01** | **P0** | trial design, clinic | Ask body, badge, confidence | An unpinned figure question answered with a subgroup rate paired to the whole cohort's denominator, under a High confidence badge. U8: "If I am powering an add-on trial, what placebo responder rate should I assume, and from how many patients is that estimate drawn?" | "23.6% (395 of 1,674)". | first 5.7 s, done 7.7 s. "you should assume a placebo responder rate of **22% (n = 1,674, full analysis set)**.[1]" `figuresChecked 3, figuresUnsupported [], sentencesRemoved 0, denominatorsMissing []`. UI badge "**3 figures checked**", tooltip "**Every figure in this answer was found beside its claim in a cited passage. 2 of 2 sentences carry a citation.**", confidence "**High confidence - answer quality**" - reproduced at 1440 px light and 390 px dark. `89ca061f`: "Data from **1,674** participants ... of which **395 (23.6%)** were 50% responders"; the 22% sentence is "high (42%...) and **not high (22%, 95% CI: 19-24%)**" for "all 40 other countries". PA4a, the pinned wording, returns 23.6% (395/1,674); DC1 on the same paper returns it in 15.6 s. Unchanged from loop 7's D7-05. | The denominator helper must take the n from the **same sentence** as the figure. A figure whose sentence names a mixture-model class or a country group must not inherit a pooled n, and "full analysis set" must never be attached to a figure whose sentence does not use the phrase. |
| **D8-02** | **P0** | all | Ask, removal notice vs body | A figure the audit reports as **removed** is still printed in the answer - three times, and in one of them the printed figure is the wrong trial arm's. | Either the figure or the removal notice, never both. | **U19** ("Compare seizure freedom rates between brivaracetam and perampanel at 12 months in real-world cohorts", done 21.8 s): body prints "In the OLEx Phase of Study 332, seizure freedom rates for all seizures at 12 months were **22.1%** for patients who received **placebo** during the Core Study before converting to perampanel (n = 70).[3]" and "seizure freedom at 12 months was achieved by **14.9%** of patients (n = 1111).[2]", while the same answer's footnote reads "*2 sentences were removed from this answer: their figures (33.8%, **22.1%**, **14.9%**) could not be verified*", `figuresRemoved ["33.8%","22.1%","14.9%"]`. And 22.1% is the wrong arm: `73114ce9` reads "For all seizure types, 39.7% and **22.1%** of patients who received **perampanel** during the Core Study and 35.7% and **17.1%** of patients who received **placebo** during the Core Study were free". **U7** does the same with 71.1% and 74.6%. The **briefing** does it too: `figuresRemoved ["100mg/day","90.5%","79.8%"]` while the section still reads "retention rates for perampanel at 3, 6, and 12 months were **90.5%, 79.8%,** and 64.2%". | The removal must be applied to the emitted text and the `statements` list, not only recorded in the audit; and a figure that appears in `figuresRemoved` must be absent from `done.text` - assert that invariant in a test. |
| **D8-03** | **P1** | clinic, research | Ask, unpinned wording | A paraphrase that describes a study instead of naming it is answered from two unrelated papers, under a clean audit. | "45 years (23-71); 13 of 26 (50%) female" (`f9e7bfdb`, which PA5a returns). | **PA5b** ("How old were the participants in the sub-scalp monitoring trial and how many were female?", first 16.3 s, done 17.9 s): "In *Seizure Forecasting Using a Novel Sub-Scalp Ultra-Long Term EEG Monitoring System*, the participants ... were aged **18-75 years** at the time of implantation.[1] In *Neonatal developmental and epileptic encephalopathy with movement disorder and arthrogryposis: A shared phenotype across brain-expressed sodium channelopathies*, of the **46** individuals, **25** were female.[2]" `figuresChecked 4, figuresUnsupported [], sentencesRemoved 0`. A neonatal channelopathy cohort's sex split, offered as the sub-scalp trial's. Same class: **J10**, "Additionally, a total of **26 patients** were enrolled in the study.[2]" ([2] = the ambulatory-device paper) - the loop 7 defect, verbatim. | Resolve a **described** cohort ("the sub-scalp monitoring trial", "the study") the way an acronym is resolved, and when it cannot be resolved to one paper, decline the clause rather than answering it from whichever paper ranked next. |
| **D8-04** | **P1** | research, teaching | Ask markers | Citation markers, including on sentences carrying figures, point at papers that do not contain the statement. | One marker per source that carries it - which Generate already does. | **U13**: "In a study of **56** patients with refractory epilepsy, **6** became seizure-free on the third to sixth anti-seizure drug.**[4][5][6]**" - [4] *Seizures in Sotos syndrome: Phenotyping in 49 patients*, [5] *Neonatal DEE ... sodium channelopathies*, [6] *SYNGAP1 encephalopathy*. **U22**: "This proportion has remained stable despite the introduction of new antiseizure medications.**[2][3][4]**" - [2] a saliva/beta-hydroxybutyrate correlation study, [3] a **rat** sodium selenate study, [4] a GWAS. **U10**: "The strongest modifiable risk factor for SUDEP is the control of generalised tonic-clonic seizures.**[1][2][3]**" - [3] a Kv11.1 cardiac-channel variants paper; and "[5]" is a lacosamide monotherapy conversion trial. **U2**: the Dravet sentence cited to `e5bffb27` (*Early mortality in STXBP1-related disorders*), whose own text says Dravet mortality **8.6%** and SUDEP **52%**, not 16 per 1,000 and 59%; those two figures live in `b2383b42`, and `figuresRescued ["16","1000","59%"]` shows the checker found them there and left the marker pointing at the wrong paper. | The per-sentence check already computes which resources support the sentence; emit only those markers, as the briefing path does. When the rescue read rebinds a figure, rebind the marker with it - the documentation already promises "the sentence is cited to that paper instead". |
| **D8-05** | **P1** | clinic, research | Ask gate, inside the pin | The gate deletes half of a Results sentence and keeps the other half, then offers an unrelated sentence in its place. | "19 patients (28%) had at least 1 relapse, at a median of 764 (IQR 355, 1,193) days." | **HT4** ("In the anti-NMDAR receptor encephalitis rituximab study, what proportion relapsed and at what median time?", done 10.2 s): "The median time to first relapse was **764 days (IQR 355, 1,193)** from initial admission.[1] *One sentence was removed from this answer: its figures (**28%**) could not be verified - the cited passage carries them for a different outcome or follow-up.*" then "*For the outcome asked about, [1] itself reports: \"Rituximab was administered in 33 patients (49%) during their acute admission...\"*". `7622042349` Results: "A total of **19 patients (28%)** had at least 1 relapse, which occurred at a **median of 764 (IQR 355, 1,193) days** from the initial admission" - **one sentence, both figures**, and the build kept one and deleted the other. | When two figures in an answer sentence are located in the **same** source sentence, they stand or fall together. The "different outcome or follow-up" reason cannot fire on a figure whose sibling in the same sentence just passed. |
| **D8-06** | **P1** | teaching | Ask retrieval, the pin | The pin narrows a two-part question to the named study's paper and silently loses the half the other papers answer. | Both halves - and both are answerable. | **JOB2**: "### Misdiagnosis of Functional Seizures as Epilepsy - The cited sources **do not provide specific data** on how often functional seizures (FS) are misdiagnosed as epilepsy." Final `sources`: **one** resource (`f0c5046b`, the BREATHS protocol). Asked alone 30 seconds later, **JOB2c** answers: "They represent approximately **30%** of patients admitted to video-electroencephalogram (v-EEG) monitoring units.[3]" from `5d5e5781`, which the pin excluded. Loop 7 answered this half and failed the other; the two failures have simply swapped places. | Pin only the clause that names the study. Run the unnamed clause over the unpinned set and merge, or state which clause the pin covered. |
| **D8-07** | **P1** | all | Ask, error surface | A raw Progress Agentic RAG error - the vendor name, the endpoint host and the knowledge-box UUID - is rendered verbatim to the user. | "That document link is not valid." | `POST /ask {"resourceId":"9dd53383", ...}` returns, at **0.12 s**: `{"type":"error","message":"Agentic RAG API 422 for https://aws-ap-southeast-2-1.rag.progress.cloud/api/v1/kb/991906b6-1f55-4916-aa2e-33e566956ce3/ask: {\"detail\":[{\"type\":\"value_error\",\"loc\":[\"body\",\"resource_filters\"],\"msg\":\"Value error, resource id filter '9dd53383' should be a valid UUID\"...`. `AnswerStream.tsx:492-494` sets it straight into state and line 691 renders "Answer unavailable right now - {errorMessage}"; `AskPage.tsx:2404` does the same. This is the own-system framing broken open in front of whoever is watching the screen. | Map platform errors to portal wording before they leave the API, log the detail server-side, and validate a `resourceId` against the catalogue before any platform call (which also fixes D7-18). |
| **D8-08** | **P1** | clinic, teaching | Ask safety verbs | The safety verb is bound to the right drug but transplanted from a different disease, with the wrong disease named in the answer. | "That statement comes from a CLN2 disease guideline, not a JME source." | **HW4** ("Is carbamazepine contraindicated in juvenile myoclonic epilepsy?", done 10.6 s): after the correct refusal, "The cited sources report that carbamazepine and phenytoin can exacerbate myoclonus, **which is a symptom of JME**, and **should be avoided**.[2]" [2] = `7f3cec99` = *"Guidelines on the diagnosis, clinical assessments, treatment and management for **CLN2 disease** patients"*, whose sentence is "Certain AEDs such as carbamazepine and phenytoin have been reported to exacerbate myoclonus and should be avoided [20]" - about neuronal ceroid lipofuscinosis, and itself a second-hand citation. `contraindicationsUnsupported ["carbamazepine"]` fired on sentence one and not on sentence two. | Bind a safety verb to the **condition** as well as the medication: a "should be avoided" sentence whose paper is about a different disease is not support for this question, and a second-hand safety statement must be flagged as one. |
| **D8-09** | **P1** | epi, clinic | Ask body after a removal | The dependent-removal rule takes the conclusion but leaves the lead claim, cited to a paper that does not carry it. | "This collection holds no study of adherence and mortality." | **U9** (done 13.5 s, `sentencesRemoved 3`): "**The cited sources indicate that non-adherence to antiepileptic drugs is linked to increased mortality.[1]** *A sentence naming RANSOM was removed...*" [1] = `453cb4c1` (*Association Between Psychiatric Comorbidities and Mortality in Epilepsy*). The paper's only use of the word is "higher scores of neuropsychiatric symptoms predict poorer **response to antiepileptic medication in adherent patients**" - a Discussion sentence citing reference 22, about drug response, not mortality. | The lead claim is a dependant too. When every sentence carrying evidence for the topic sentence is removed, the topic sentence goes with them and the coverage decline is shown instead - which the same build does correctly for Z2. |
| **D8-10** | **P2** | clinic | Ask body | An internal check notice is rendered as a numbered list item, and the answer closes with an uncited clinical recommendation. | The notice under the answer; the recommendation cited or dropped. | **CI5** ("Should lamotrigine be avoided in patients with juvenile myoclonic epilepsy?", done 17.5 s): "2. *The cited sources do not state that lamotrigine is seizure-aggravating here.*" sits as item 2 of a five-item list; the closing paragraph - "Based on these points, while lamotrigine is not contraindicated, valproate may be preferred for its efficacy, especially in achieving seizure freedom. However, lamotrigine remains an option due to its tolerability" - carries **no marker** (`sentencesChecked 8, sentencesCited 5`). And [2], cited for a lamotrigine tolerability claim, is *Tau pathology in epilepsy: emerging mechanisms and translational...*. | Render check notices outside the answer body; strip an uncited recommendation sentence from a clinical answer, as the loop 7 fix did for the "Inference:" heading. |
| **D8-11** | **P2** | epi, research | Ask, over-refusal | Two questions the collection answers - and this build answered last loop - now refuse, while the paper that answers them is in the retrieved list. | The paper's own sentence. | **JOB5** ("What is the standardised mortality ratio in people with epilepsy and a psychiatric comorbidity?", done 10.6 s): "The generated answer stated figures (3.6, 2.9, 4.4) that no retrieved passage carries beside their claim, so it has been withheld". Minutes later, **X3** ("...who have a lifetime psychiatric disorder, compared with those who do not?") answers "**3.6 (95% CI 2.9-4.4)** ... compared to those who do not, which is **2.5 (95% CI 1.9-3.2)**.[1]" from the same paper. **E1** ("What proportion of patients with juvenile myoclonic epilepsy relapse after withdrawing antiseizure medication?") refuses while naming, in its own decline, *Individualised prediction of drug resistance and seizure recurrence after medication withdrawal in people with juvenile myoclonic epilepsy* as where the figures were found. | Before declining, run the rescue read inside the paper the decline names - the machinery already knows which paper it is, and the answer is one sentence away. |
| **D8-12** | **P2** | epi | Ask, pinned wording | Inside the consortium pin, a paraphrase answers from a different consortium paper at a different time point, while the removal notice claims the time point matched. | "154 (67%) of 231 at 12 months". | **PA3b** ("In the Australian Autoimmune Encephalitis Consortium cohort, what share of patients reached a good functional outcome (mRS 0-2) **one year on**?", first 9.2 s, done 28.0 s): "The paper itself reports: \"After a median follow-up of **700 days**, **82.7%** had good functional outcome (mRS <=2) while five patients had died.\"[1]" [1] = `2c1353ee` (n = 57). The notice reads "*One sentence cited to the wrong paper was replaced by the sentence of the paper that carries **the same figure at the same time point**...*" - 700 days is not one year. Also "*its figures (**1 years**) could not be verified*" is malformed, and the offer that follows is a reference-list sentence: "*A subsequent study examined a group of 50 AE cases and their long-term functional outcomes (10).*" | The pin resolves a consortium to four papers; rank them by which one the question's time point and outcome match, and make the "same time point" claim in the replacement notice actually checked. |
| **D8-13** | **P2** | clinic | Ask, cross-paper comparison | A "which drug is best" question retrieves genetics papers and answers from a trial extension of a different drug class, then flags the study as absent. | "EXPERIENCE 71.1% for brivaracetam; PERMIT 64.2% for perampanel" - both in the collection. | **U6** ("Which anti-seizure medication has the best real-world 12-month retention?", done 18.1 s, `answerRelevance 1`): retrieved list = FOXG1 syndrome, STXBP1 natural history, MAST3 variants, SCN2A, seizure diaries, Dravet consensus, stress hormones. Answer: "cannabidiol (CBD) had a 1-year retention rate of **79%** in the **GWPCARE6** open-label extension study ... This is the highest retention rate mentioned in the provided context." plus "*This collection does not hold GWPCARE6 itself.*" **U7**, the same question with the two drugs named, retrieves EXPERIENCE and PERMIT immediately. | A comparison question needs a comparison retrieval: enumerate the medications in the entity graph, retrieve per medication, and compare like with like. "The highest rate **mentioned in the provided context**" is not an answer to "which is best". |
| **D8-14** | **P2** | research | Ask, cross-paper comparison | A drug comparison prints one drug's figure under the other drug's heading. | The perampanel figure under Perampanel. | **U7** ("Compare the 12-month retention rates of brivaracetam and perampanel in real-world studies", done 25.3 s): "**Brivaracetam:** - In the EXPERIENCE study, the 12-month retention rate for brivaracetam was 71.1% (n = 1644...).[2] - **In another study, the retention rate at 1 year was 74.6% (n = 103/138).[3]**" [3] = `73114ce9` = *Long-term open-label **perampanel**: Generalized tonic-clonic seizures in idiopathic generalized epilepsy*, whose sentence is "The retention rate at 6 months was 88.4% (n = 122/138), at 1 year was **74.6% (n = 103/138)**". Perampanel's real-world 12-month retention - PERMIT's "64.2% (**2698/4201**)", from `433567db`, cited in the same answer as [1] - is never given. | Bind each row of a comparison to the medication its source is about, using the catalogue's medication entities, before the row is written. |
| **D8-15** | **P3** | all | Search, phone at large text | `/search` overflows the viewport horizontally at 390 px with a 22 px root font, in both themes. | No horizontal scroll. | Measured: `scrollWidth 467`, `clientWidth 390`, `innerWidth 390`. Offending nodes: `DIV.flex items-center gap-2 lg:ml-auto` and `SELECT.rp-focus rp-select rounded-[var(--rp-radius-input)]`, both right-edge 467. `apps/web/src/pages/SearchPage.tsx:904` - the no-query toolbar cluster (ViewToggle, GridDensity, "Sort" label, select) has no `min-w-0` and no wrap. Every other route is clean at the same settings. | `flex-wrap` on the cluster and `min-w-0` on the select, then re-measure at 22 px. |
| **D8-16** | **P3** | teaching | Assessment | A knowledge check asked for six questions returns two. | Six, or a plain sentence saying why not. | `POST /generate {"kind":"assessment","count":6}`, 16.9 s: `"questions"` has **2**; `"requested": 6, "omitted_questions": 1, "omitted_secondhand": 2, "omitted_unsourced": 4`. Both surviving questions are verbatim-quoted and correctly sourced (D7-11's quality fix holds); there are simply not enough of them, and both open "according to Broadley et al." rather than naming the study. | Generate candidates until `count` survive, and print "2 of 6 questions survived the source check" in the UI. |
| **D8-17** | **P3** | research | Investigation synthesis | The synthesis ignores the evidence card that answers the investigation's own question. | The pooled 23.6% of 1,674 card. | Investigation "Loop8: placebo response and trial powering", question "What placebo responder rate should an add-on trial assume, and from how many patients?". Card [1] = "Data from 1,674 participants ... 395 (23.6%) were 50% responders". Synthesis (9.3 s): "The placebo responder rate for an add-on trial should assume a 50% responder rate of **46.3%** based on a group size of **121** patients [2]", `"notUsed": [1]`. Honest, but it dropped the card that matched the question. | Rank evidence cards against the investigation question before synthesising, and say why a card was not used. |
| **D8-18** | **P3** | all | Latency | The tail is worse than loop 7 and the audit tail has doubled again. | Under 20 s. | Medians over 60 asks: first **9.0 s**, done **12.1 s**, end **18.2 s**, audit tail **4.7 s** (loop 7: 8.8 / 11.6 / 16.6 / 2.4). Worst: **U1** first 55.7 s, done **78.7 s**, end 86.6 s; U24 46.1 s; U15 38.6 s; PA3a first 34.1 s. 11 of 60 asks over 15 s to first word. (Two batteries overlapped for part of the run, so treat this as an upper bound.) | Cap the rescue read's breadth on multi-source answers; the slowest asks are all unpinned ones with 10+ retrieved papers. |
| **D8-19** | **P3** | research | Resource detail | Every paper's browser tab reads "Document". | The paper's short title. | D7-19 unchanged: `/library/8565cc8f77a444608d6fded78f602c79` -> `"Document \| EpRePo Research Portal"` at both 1440 px and 390 px, while the `h1` is the full title. |
| **D8-20** | **P3** | all | Help assistant, effect-size helper | Two text defects from loop 7, verbatim. | Clean prose. | D7-21: "carries a bracketed citation marker **like, which links to** the exact source passage." D7-20, new instance in U10: "*Effect size in the cited passage: for **\"... channel function in the SUDEP cohort compared to the epilepsy control cohort\"**, OR = 0.8, 95% confidence interval 0.17-3.8 [3].*" And the Help assistant still answers from 0.01- and 0-relevance passages (D7-14). |

**Counts: P0 2 (D8-01, D8-02), P1 7 (D8-03 to D8-09), P2 5 (D8-10 to D8-14), P3 6 (D8-15 to
D8-20).** Carried over open: D7-05 (= D8-01), D7-15 (= D8-04), D7-17, D7-18, D7-19, D7-20, D7-21,
D5-13, D5-14.

---

## 6. The pinned / unpinned split - the boundary question, answered

### What the pin does when it fires

25 asks across 15 families named a study, cohort, antibody, registry, trial acronym or quoted
title. **20 were clean**, and the three most damaging figure families in the report's history are
now stable across wordings:

| Family | Wordings | Result |
|---|---|---|
| anti-LGI1 relapse | P0c, PA2a, PA2b | 3/3 "16 (30%) of 55 ... 414 days (IQR 256, 967)" |
| Lamotrigine and SUDEP | PA6a, PA6b | 2/2 "aHR 0.56 (0.31-1.01, P = 0.054)" for the drug, "2.24 (1.07-4.68, P = 0.031)" for GTCS |
| Consortium 12-month mRS | X2, PA3a | 2/2 "154 patients (67%) ... (n = 231)" |
| Brivaracetam LEV switch | J1, PA1b, HW5, DC4 | 4/4 "13.9% (FAS)", "71.1% (n = 1644)", "14.9% (n = 1111)" |
| UMPIRE (by acronym) | PA5a, stream test | 2/2 "45 years, range 23 to 71", "13 of 26 (50%)" |
| PERMIT, RESILIENCE, SEEG survey, lacosamide PGTCS, quoted title | HW6, HT3, HT5, D02, HT1 | 5/5 correct and verified |
| Absent studies | Z2, HT2 | 2/2 named in the decline, nothing invented |

The five that were not clean: **PA3b** (a fourth consortium paper at 700 days, D8-12), **PA1a**
(withholds the half it has), **HT4** (deletes 28% out of the sentence it keeps 764 days from,
D8-05), **HW4 sentence 2** (a CLN2 guideline applied to JME, D8-08), **JOB2** (the pin excluded the
half the other papers answer, D8-06). Four of those five are new defects created by, or exposed by,
the pin itself.

### What happens when it does not fire

26 unpinned asks - the shape a clinician actually uses. **Twelve carried a defect**, and the
defects are the same ones loop 7 logged:

| Question | Defect |
|---|---|
| U8 "what placebo responder rate should I assume" | **22% with n = 1,674 under High confidence** (D8-01) |
| U19 / U7 "compare brivaracetam and perampanel" | removed-but-printed figures, wrong arm, wrong drug's row (D8-02, D8-14) |
| U6 "which ASM has the best real-world retention" | genetics papers retrieved; CBD/GWPCARE6 answered (D8-13) |
| PA5b "the sub-scalp monitoring trial" | a neonatal channelopathy cohort's 25/46 (D8-03) |
| J10 "how many participants were enrolled" | 26 patients from an ambulatory-device study (D8-03) |
| U2 "how common is SUDEP" | Dravet 16/1,000 and 59% cited to the STXBP1 paper; the same paper's siblings flagged second-hand and these two not (D8-04) |
| U13, U22, U10, U18, U21, JOB2c | markers on papers that do not carry the sentence (D8-04) |
| U9 "is adherence associated with mortality" | the lead claim survives its evidence (D8-09) |
| JOB5, E1 | refusals where the paper is in the retrieved list (D8-11) |
| U1 "evidence that sleep deprivation increases seizure risk" | 78.7 s; "Rajna and Veres showed ... 6-fold" carried un-flagged as second-hand |
| U3 "does forecasting work well enough" | one uncited assertion survives (`sentencesChecked 13, sentencesCited 12`) |

Clean and genuinely useful in the unpinned class: U5, U11, U12, U14, U16, U17, U20, U23, U24, U25,
W6, X3 - twelve of them, several excellent (U11 on sub-scalp EEG, U16 on psychiatric comorbidity
and mortality, U24 comparing the lamotrigine and GTCS hazards).

### The proportion

Speaking as the person who uses this between patients: **roughly one question in six names something
the catalogue can resolve.** In a clinic week I ask "what is the evidence for X", "how common is Y",
"does Z work in this group", "which of these two drugs", and "what is the number for this
population" - none of which name a study. I name a study when I am reading that paper (which is
what document chat is for), preparing a journal club, or checking a figure someone quoted at me.
Across my five jobs: clinic ~10% pinned, teaching ~30%, research ~35%, trial design ~25%,
epidemiology ~10%. Call it **15-20% pinned, 80-85% unpinned.**

And **the failures cluster in the unpinned class**: 12 defects in 26 unpinned asks (46%) against 5
in 25 pinned asks (20%), and both open P0s and five of the seven P1s are unpinned. The pin is a
real fix for a real class of question - it is simply the smaller class.

### What the next structural move should be

For a question that legitimately spans several papers, **decompose the question, answer each part
against a single pinned resource, then compose - and never let one sentence draw on two papers.**
Concretely:

1. **Decompose before retrieving.** "Compare brivaracetam and perampanel" is two questions; "how
   old were the participants and how many were female" is two clauses about one study; "how often
   are functional seizures misdiagnosed and what does BREATHS test" is two questions with one pin.
   The router already classifies intent; make it emit *clauses*, each with its own entity set.
2. **Resolve every clause to a resource set, including described ones.** The resolver already
   handles acronyms, antigens, consortia and quoted titles. Extend it to the entity graph's
   medications and conditions, so "brivaracetam retention" pins to the brivaracetam papers and
   "perampanel retention" to the perampanel papers - which is the fix for D8-13 and D8-14. A drug
   alone should not pin the *answer*, but it must scope the *clause*.
3. **Answer each clause as a document chat.** Document chat got right every figure Ask got wrong
   this loop, in a third of the time, because it sees one paper. A multi-paper answer should be
   several one-paper answers, composed - not one generation over a bag of ten papers.
4. **Compose with hard attribution.** Each composed sentence inherits exactly one resource id from
   the clause that produced it. That single rule closes D8-03, D8-04 and D8-14, and makes D8-02
   structurally impossible because there is no shared pool from which a removed figure can
   reappear.
5. **When a clause resolves to nothing, decline that clause by name** - "this collection holds no
   real-world retention study for X" - instead of refusing the whole answer (D8-11) or filling the
   gap from a neighbour (D8-03).

**Platform.** This is `resource_filters` per clause plus `rag_strategies: full_resource` on each
pinned resource, run in parallel - the same primitives the pin already uses, applied once per
clause instead of once per question. `citations: true` gives the paragraph-level attribution that
makes step 4 a platform answer rather than a local grep.

---

## 7. How this works - fresh falsification attempt

Six statements are falsifiable on this build. Two that loop 7 falsified are now true.

| Statement on the page | Verdict | Evidence |
|---|---|---|
| "Every number, percentage, dose and range in a sentence is first located in the cited paper, and the sentence or table row that carries it there must share the claim's own quantity ... **at the same follow-up ... and the same denominator**" | **False** | D8-01: 22% paired with n = 1,674 from a different sentence; D8-12: 82.7% at 700 days answering "one year on". |
| "A figure the cited passage does not carry is looked for in the full text of the retrieved papers: where one of them carries it beside the same claim, **the sentence is cited to that paper instead**" | **False** | D8-04/U2: `figuresRescued ["16","1000","59%"]`, found in `b2383b42`, marker left on `e5bffb27`. (The UI run of the same question *did* rebind and said so in the tooltip - so this is non-deterministic, which is worse than simply false.) |
| "**A figure found nowhere means the sentence is removed**, and the answer says that it was" | **False in the other direction** | D8-02: the answer says the sentence was removed and prints it anyway - U19, U7 and the briefing. |
| "The same holds for '**should be avoided**' ... a medication the cited sources flag is never dropped silently" | **False on the condition axis** | D8-08: a CLN2 disease guideline's "should be avoided" delivered as a JME statement, with "which is a symptom of JME" written into the sentence. |
| "**Every sentence that states a finding carries a citation** to the passage it came from (an item in a list takes the citation of the paragraph it belongs to)" | **False** | U3 `sentencesChecked 13, sentencesCited 12`; CI5's closing recommendation uncited; U13's list items cited to three papers that do not carry them; U14 4 of 5. |
| "When a sentence is removed, **what rested on it goes too**" | **Partly false** | D8-09: the lead claim outlives the removal in U9. It *is* now true of the conclusion, which is the half loop 7 asked for. |
| "It never answers without a source. An answer with nothing to cite is not shown" | **True now** | Z2 and HT2 both decline and name the missing study. This was loop 7's D7-08. |
| "A study the question names by title or acronym is looked up by name and pinned into the sources, so it cannot be crowded out" | **True** | HT1 (quoted title), HT3, HT5, HW5, HW6, PA2a, PA5a all pinned correctly; several to a single resource. |
| "It says plainly when the collection does not hold something, and shows the closest passages it found ... A study the question names that no paper here reports is named in the decline" | **True** | RANSOM, ESETT, GWPCARE6. |
| "The confidence label ... an unverified figure, year or contraindication marks it low, removed sentences cap it at moderate, and **high is earned only when every figure was found**" | **True as written, and that is the problem** | `apps/web/src/lib/confidence.ts:auditConfidence` implements it exactly. D8-01 earns High legitimately, because "found" means "the string appears somewhere in the cited paper". The sentence is accurate and the guarantee it implies is not. |
| "The generated fields ... are shown on the document page as generated fields, **never as the paper's own words**" | **Unproven, worth checking** | HT1's "82,723 ... 125,223" appears once in the extracted text as `keyTakeaways[0]`/`[1]`; the paper's abstract writes the same numbers with a thin space ("82 723", "125 223"), so I could not establish which one the check matched. `figuresRescued ["125223"]` suggests normalisation. Worth a test either way. |
| "The collection currently holds 998 resources, indexed as 106,750 paragraphs and 103,293 sentences" | **True** | Matches `/api/t/eprepo/counters` exactly, live. |

The page is still the best-written document in the portal, and it is now the main reason a careful
reader would be misled: every sentence in it is defensible as engineering description, and three of
them promise a guarantee the build does not deliver. **Rewrite the figure rule to say what it
actually checks** - "the number is found in the cited paper, and the sentence carrying it is
matched against the claim's outcome and follow-up where those can be read" - or make the check
match the sentence as written.

---

## 8. The single change that would move the score most, then the next three

**Make the answer composed of single-paper answers, one clause at a time, instead of one generation
over a pool.** The pin proved the thesis: when Ask sees one paper it is as good as document chat,
and document chat this loop got 23.6% of 1,674, 16 (30%) at 414 days, and 71.1%/14.9% (n = 1111)
right in 6-16 seconds while Ask got two of those three wrong. The pin only reaches the one question
in six that names something. Decomposing the question into clauses, resolving each clause to its
own resource set (using the medication and condition entities as well as the study names), running
each as a constrained one-paper ask, and composing with one resource id per sentence, extends the
same guarantee to the other five. It closes D8-01, D8-02, D8-03, D8-04, D8-13 and D8-14 - both P0s
and four P1s - and it is the same platform primitives applied per clause rather than per question.

**Next three:**

1. **Make the removal actually remove** (D8-02). A figure in `figuresRemoved` must not appear in
   `done.text` or in a briefing's `statements`; assert it in a unit test. Right now the audit and
   the answer contradict each other in three surfaces, and in U19 the surviving figure is the wrong
   trial arm's. Nothing else in the report damages trust faster than an answer that tells me it
   deleted the number it just showed me.
2. **Stop refusing what the collection answers, and stop cutting sentences in half** (D8-11,
   D8-05). E1 and JOB5 refuse while naming the paper that holds the answer; HT4 deletes "28%" out
   of the very sentence it quotes "764 days" from. Before declining, read the paper the decline
   names; and when two figures in an answer sentence were located in one source sentence, keep them
   together.
3. **One marker per sentence, from the resource that carries it** (D8-04), and then re-audit How
   this works against the build. The briefing path already does this correctly. Until it is true in
   Ask, no figure in an answer is traceable in one click, which is the whole promise.

---

## 9. Coverage notes (corpus, not application)

- No adherence-and-mortality study - the decline is now correct (Z2), the topic-shaped version
  (U9) still fills the gap.
- No ESETT, no RANSOM, no SANAD II, no GWPCARE6 - all four correctly named as absent.
- No Australian annual incidence rate for adults; U21's answer comes from the ten-year projection
  paper's prevalence and is honest about what it is.
- The consortium is represented by at least four papers with different n and different follow-up
  (231 at 12 months, 57 at a median 700 days, plus the LGI1 sub-study of 55 and the QoL paper) -
  a genuine corpus feature that the pin has to disambiguate, not a gap.
- The Australian sub-scalp literature includes both UMPIRE (26 patients) and a separate Minder
  feasibility paper; "the sub-scalp monitoring trial" is genuinely ambiguous, which is why it must
  be declined rather than guessed.
- No head-to-head brivaracetam-versus-perampanel study; the comparison must be assembled from
  EXPERIENCE and PERMIT, which is exactly the multi-paper case section 6 is about.
- The knowledge map holds 120 entities and 86 relations, and its top nodes include amoxicillin,
  omeprazole, iodixanol and urticaria from a drug-hypersensitivity meeting abstract - corpus noise,
  not an application defect, but it is the first thing a visitor sees on `/graph`.
- All 42 of his articles are present; author lookup returns 62 (42 articles plus 20 supplements).

---

## 10. Performance table

Seconds from the request. "first" = first delta, "done" = final text, "end" = audit and quality
received. Medians over **60** asks: **first 9.0, done 12.1, end 18.2**; audit tail median 4.7 s,
maximum 8.0. Loop 7 medians: first 8.8, done 11.6, end 16.6, tail 2.4. Two batteries overlapped for
part of the run, so these are upper bounds.

| Q | first | done | end | verdict |
|---|---|---|---|---|
| **U8** | 5.7 | 7.7 | 8.4 | **D8-01 (P0)**: 22% with n = 1,674, "3 figures checked", High confidence |
| **U19** | 11.7 | 21.8 | 23.6 | **D8-02 (P0)**: 22.1% (wrong arm) printed and listed as removed |
| **U7** | 12.8 | 25.3 | 25.7 | **D8-02 / D8-14**: perampanel's 74.6% under a Brivaracetam heading |
| **PA5b** | 16.3 | 17.9 | 19.7 | **D8-03 (P1)**: a neonatal cohort's 25 of 46 for "the sub-scalp trial" |
| **J10** | 5.7 | 7.5 | 14.0 | **D8-03**: 26 patients from an ambulatory-device study - unchanged from loop 7 |
| **U2** | 9.1 | 12.8 | 20.0 | **D8-04 (P1)**: Dravet 16/1,000 and 59% cited to the STXBP1 paper |
| **U13** | 6.6 | 11.5 | 12.5 | **D8-04**: "56 patients ... 6 seizure-free" cited to Sotos, neonatal DEE and SYNGAP1 |
| **HT4** | 8.8 | 10.2 | 11.9 | **D8-05 (P1)**: 28% deleted from the sentence 764 days was kept from |
| **JOB2** | 12.2 | 15.1 | 16.6 | **D8-06 (P1)**: BREATHS answered; the misdiagnosis half lost to the pin |
| DC3 | - | - | 0.1 | **D8-07 (P1)**: raw Progress Agentic RAG 422 with the endpoint and KB uuid |
| **HW4** | 8.7 | 10.6 | 12.6 | D7-03 **fixed** on the drug; **D8-08 (P1)** on the condition (CLN2 -> JME) |
| **U9** | 9.9 | 13.5 | 13.9 | **D8-09 (P1)**: lead claim survives, cited to a paper with no adherence result |
| **CI5** | 8.9 | 17.5 | 19.1 | **D8-10 (P2)**: check notice as list item 2; uncited closing recommendation |
| **JOB5 / E1** | 9.0 / 5.8 | 10.6 / 8.2 | 18.5 / 9.2 | **D8-11 (P2)**: refusals; X3 answers the same question at 10.2 s |
| **PA3b** | 9.2 | 28.0 | 34.5 | **D8-12 (P2)**: 82.7% at 700 days for "one year on" |
| **U6** | 16.0 | 18.1 | 22.8 | **D8-13 (P2)**: CBD/GWPCARE6 for "best real-world retention", answerRelevance 1 |
| P0c / PA2a / PA2b | 9.6 / 17.7 / 8.6 | 11.4 / 19.1 / 10.4 | 15.9 / 20.9 / 11.3 | **D7-01 fixed**: 16 (30%), 414 days, all three wordings |
| X2 / PA3a | 12.1 / 34.1 | 15.6 / 35.6 | 19.3 / 43.5 | **D7-02 fixed**: 154 (67%) of 231; PA3a slow |
| J1 / PA1b / HW5 / DC4 | 12.1 / 13.1 / 10.7 / 4.2 | 14.1 / 15.2 / 12.2 / 5.8 | 21.7 / 22.7 / 20.1 / 13.8 | consistent: 13.9% (FAS), 71.1% (n = 1644), 14.9% (n = 1111) |
| PA1a | 11.6 | 13.5 | 14.3 | **D7-04 residual**: withholds where J1 answers |
| PA6a / PA6b | 13.3 / 8.7 | 13.3 / 12.6 | 15.1 / 20.5 | **consistent for the first time**: 0.56 and 2.24, both verified |
| PA5a / stream | 13.4 / - | 15.1 / 13.1 | 19.9 / - | 45 years (23-71), 13 of 26; correct on a 390 px phone |
| PA4a / DC1 | 5.7 / 11.4 | 7.4 / 15.6 | 15.3 / 23.5 | correct: 23.6%, 395 of 1,674 - the answer U8 should have given |
| HW6 / D02 / HT1 / HT3 / HT5 / X3 / W6 | 9.0-16.6 | 8.2-18.6 | 9.8-26.6 | all correct and verified |
| Z2 / HT2 | 6.2 / 22.6 | 9.7 / 27.0 | 16.0 / 27.5 | **D7-08 fixed**: correct declines naming RANSOM and ESETT; HT2 slow |
| U5 / U11 / U12 / U14 / U16 / U17 / U20 / U23 / U25 | 5.3-16.5 | 8.2-30.5 | 11.6-38.4 | clean unpinned answers |
| U1 | **55.7** | **78.7** | 86.6 | **D8-18**: the slowest ask in eight loops |
| U15 / U24 | 23.4 / 34.9 | 38.6 / 46.1 | 42.9 / 52.8 | correct, very slow |
| DC2 / DC5 | 6.1 / 2.3 | 7.5 / 2.3 | 15.4 / 2.3 | document chat right; DC5 = D7-18 unchanged |

Non-ask: search 30 ms (PMID) to 883 ms (long phrase); author lookup 33-55 ms; facets 499 ms;
catalogue filter 32-311 ms; entities 234 ms; entity 965 ms; briefing 18.9 s; assessment 16.9 s;
investigation create 0.1 s, evidence 0.07 s each, synthesis 9.3 s; Help assistant 7.2-13.7 s
(much better than loop 7's 41 s); page loads 0.54-2.9 s desktop, 0.56-2.7 s at 390 px.

---

## Is the bar met?

**No.** The bar is a score of 9 or higher with no open P0 and no open P1. This loop scores **7**
with **two open P0s** (D8-01 a wrong figure under High confidence; D8-02 a figure printed and
simultaneously reported as removed, once with the wrong trial arm) and **seven open P1s** (D8-03 to
D8-09).

**What stands between this build and the bar** is now precisely locatable, and it is not the same
thing it was last loop. Loop 7's diagnosis was right and its fix worked: pin the retrieval to what
the question names, and the named-study questions become trustworthy - twenty of twenty-five clean,
three wordings giving one answer, the three P0s closed and verified against the papers. What loop 7
did not change is the other five sixths of my questions, the ones that name a topic rather than a
study, and every one of the defects that mattered last loop is still there in that half: the
mixture-model rate with the pooled denominator, the enrolment count borrowed from an unrelated
paper, the markers on papers that do not carry the sentence, the comparison that puts one drug's
figure under another drug's heading. The structural move is the same one, applied one level down:
**decompose the question into clauses, pin each clause, answer each clause against one paper, and
compose with one resource id per sentence.** Everything the pin already knows how to do, done per
clause instead of per question.

**This gap is application work with one platform dependency.** The application work is clause
decomposition, extending the resolver to the medication and condition entities, per-clause
composition with hard attribution, applying the removal to the emitted text, reading the named
paper before declining, and keeping two figures from one source sentence together. The platform
dependency is running `resource_filters` plus `rag_strategies: full_resource` once per clause in
parallel, with `citations: true` supplying the attribution - the same primitives the pin uses
today. The corpus limits I met (no adherence-mortality study, no ESETT, no RANSOM, no GWPCARE6, no
head-to-head brivaracetam-perampanel trial) were all handled honestly this loop except where the
application filled the gap itself, which is D8-09 and D8-13. The remaining latency - a 78-second
answer and a 4.7-second audit tail - is a P3 and is not what holds the score at 7.

---

## Loop 8 fixes (merged 6 September 2026, PRs #25 and #26 into `feat/eprepo-portal`)

The report's boundary analysis was accepted and acted on: the loop 7 pin was applied one level
down, to clauses.

| Finding | Outcome |
|---|---|
| D8-02 (P0) | Removal is applied to the answer rather than recorded beneath it. The gate sweeps a kept sentence that repeats a removed figure without its own passing check, a table row keeps its place with the cell blanked, and the notice is reconciled against the emitted body before the addendum is appended. A test asserts that no figure in `figuresRemoved` appears in the body, a briefing section or the statements list. The same answer's wrong trial arm is fixed: a figure belongs to the arm its own allocation phrase names. |
| D8-01 (P0) | A denominator must come from the figure's own sentence and a claimed analysis set must be the paper's own words, so the pooled "22% (n = 1,674, full analysis set)" is gone; clause pinning then returns the correct 23.6% of 1,674 on both wordings. |
| D8-03, D8-06, D8-13, D8-14, D8-04, D8-05, D8-08 | Clause pinning: a question that asks for a quantity, compares two treatments or weighs a drug in a condition is decomposed before retrieval, each clause resolves to one paper (its own names, then the medications and conditions that scope it), each clause is answered as a one-paper ask, and the answers are composed with exactly one resource id per sentence. A clause resolving to nothing is declined by name while the rest stands. Two rules mattered as much as the architecture: a clause introducing no new name inherits the previous clause's paper outright, and a paper that answers every clause is asked the question as written. |
| D8-11, D3-02, D8-18 | A paper in the retrieved list is read and its sentence quoted before any decline; sub-question decomposition is capped and skipped where clause pinning applies. |
| Rules removed | The per-entity retrieval pin and its cap, which existed so one drug's figure was never read off another drug's paper. Clause pinning makes that structural. |

Pass rates over a 56-question replay of every prior loop's P0 and P1 questions, in the reports'
wordings: unpinned 51% to 89% clean (18 of 35 to 31 of 35), pinned 85% to 75% (17 of 20 to 15 of
20). The three pinned regressions are recorded, not hidden: one loses a figure to the gate on the
same Results sentence, one hedges a projection year, one hedged on a single run of three. Latency:
done median 16.6 s to 15.8 s with much better worst cases, first word 10.1 s to 14.2 s because the
clause path cannot stream until its first clause composes.

Verified on the merged build (`4c99abccba13`): the placebo responder question returns 23.6% drawn
from 1,674 participants; the brivaracetam and perampanel comparison attributes each drug's figure
to its own paper; no figure listed as removed appears anywhere but in the notice that names it.

Platform fact worth recording: `rag_strategies: full_resource` on a one-paper ask measured 117
seconds against 9 for document chat's shape on the same question, and was less accurate, reading a
cohort's age off the eligibility criteria. The clause ask uses document chat's shape instead.

Left for loop 9: the consortium time-point ranking, the three pinned regressions above, and first
word on the clause path.
