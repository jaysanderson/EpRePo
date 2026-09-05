# D'Souza persona test - loop 6 report

Persona: Professor Wendyl D'Souza (epileptologist and epidemiologist, St Vincent's Melbourne),
sixth use of the portal, after the loop 5 fixes (PRs #19 and #20, the "locate first" direction:
the figure check finds the figure in the cited paper and reads the sentence or table row it lives
in; the cohort guard never fires against a paper the question names; the denominator helper only
adds an n from the same parenthesis or cell; every follow-up turn pins the prior turns' papers).

Build under test: `http://localhost:8787/t/eprepo`, `/api/health` =
`{"ok":true,"web":true,"version":"d70a4b64981d","build":{"sha":"d70a4b64981d","builtAt":"2026-09-05T22:38:27.631Z"},"docs":{"eprepo":{"documents":12,"ok":true}},"docsOk":true}`
= merge of PR #20; repo HEAD `e04b00f` on `feat/eprepo-portal`. Read-only run, 6 September 2026.
Nothing edited, no server started or stopped, no commit; one investigation and one watch created
under the anonymous client. Corpus counters: 998 resources, 106,749 paragraphs, 103,292 sentences.

---

## 1. Session summary

| | |
|---|---|
| Ask requests (API, SSE) | **47** - 5 P0/P1 regressions, 8 wrong-figure probes, 6 removal probes, 4 cohort/denominator probes, a 3-turn epidemiology chain, a 2-turn trial-design chain, 2 document chats, 10 fresh job questions, 2 reference-list probes |
| Every cited figure verified | against `/api/t/eprepo/resources/:id/content` for 21 papers (full extracted text, key takeaways and quotes pulled and grepped) |
| Searches | 10 (`lamotrigine SUDEP`, 5 name forms, DOI, PMCID, PMID, an unknown term) |
| Document chats | 2 (`89ca061f` placebo response, `f9e7bfdb` UMPIRE) |
| Generate | 1 briefing (autoimmune encephalitis, 12.7 s), 1 assessment (12.0 s) |
| Investigation | created (0.2 s), 2 evidence cards saved, synthesised (10.6 s) |
| Browser | 4 Deno/astral runs: 11 pages desktop light, 6 pages dark, 4 pages at 22 px root, 10 pages at a true 390 px layout viewport (`innerWidth` 390 confirmed), 2 live Ask flows on the phone, library facet, resource detail, reader, unknown-document, entity, graph |
| Help assistant | 3 questions including two two-part questions |
| How this works | read in full (9,693 chars), desktop light and dark and at 390 px |

Timings: first word median **10.3 s** (loop 5: 12.0, loop 4: 9.8), done median **12.1 s**
(loop 5: 15.2), audit tail (end minus done) median **1.2 s** (loop 5: 4.1, maximum 7.0).
7 of 47 asks were over 15 s to first word. Page loads 0.56-1.40 s desktop; library facet
2.7 s, resource detail 2.8 s, graph 3.1 s. Full per-ask table in section 8.

---

## 2. Regression table

All 18 loop 5 findings, then the earlier findings still open after loop 5.

| ID | Status | Evidence |
|---|---|---|
| **D5-01** the gate removes the paper's own sentences (P1) | **Mostly fixed, 3 cases still fire** | Fixed: R01 "80% of epileptiform discharges in Group 1 occurred during the sleep period, while in Group 2, just over a third (37%)" (`6e052250`: "We found F1 = 0.8, suggesting that 80% of EDs in Group 1 were clustered during the sleep period. In contrast, F2 is 0.37"); R02 "937 patients had a psychiatric diagnosis out of a total of 1,805" (`453cb4c1` Table 1 "N (%) 868 (48) 937 (52)" under "Patients who had a complete neuropsychiatric evaluation (n = 1,805)"); R03 "147 people with epilepsy (PWE) died ... 87 had a lifetime history of a psychiatric disorder, and 60 had no psychiatric disorder"; R04 "median follow-up ... 9 years, with an interquartile range (IQR) of 5 to 13 years"; R05 "14.9% (n = 1111, full analysis set)"; R06 "odds ratio ... 10.00, with a 95% confidence interval of 1.68 to 59.31"; R08 "AUC ... 0.70 (95% CI 0.68-0.72)" (the "&#8901;" glyph is now normalised); DC2 UMPIRE "Twenty-six participants were implanted ... Twenty-four participants completed six months". All `figuresRemoved []`, `sentencesRemoved 0`. **Still fires**: HC1, TF1 and J2 - see D6-05 and D6-06. |
| **D5-02** cohort guard fires on the paper the question names (P1) | **Fixed** | C01 (ICV valproate) `done` 9.3 s, 6 sentences 6 cited: "four subjects experienced more than 50% seizure reduction at the highest tested dose of 160 mg/day, and two subjects had extended periods of complete seizure freedom"; C02 "It included 101 SUDEP cases and 199 living epilepsy controls.[1] These participants were identified from Epilepsy Monitoring Units (EMUs) in Australia and the USA.[1]"; `figuresRemoved []` on both. |
| **D5-03** denominator corrector states a wrong "correction" (P1) | **Fixed** | D01 `done` 7.0 s: "11% of patients (3/28) declined in language after thermocoagulation of language-negative sites.[1]" - the paper's own "11% (3/28)". No `attributionsCorrected`, no "One denominator was corrected" text anywhere in 47 asks; no nested "(56 (46.3%))". |
| **D5-04** wrong quantity under a clean badge (P1) | **Partly - old cases fixed, two new ones** | Fixed: W1/DC1 "The pooled placebo 50% responder rate was 23.6% out of 1,674 participants" (was "50%"); W4 "The PERMIT safety population included 4,617 patients" (was 1,216; `433567db`: "Tolerability Population included 4617 PWE"). Two loop 5 calls were themselves wrong and this build is right: W5 "17 out of 19 ... phase-locked" is the paper's Results ("Of these eligible participants, 17 (89%) had seizures significantly locked onto at least one heart rate cycle"), and W6's 125,223 is the abstract's own "In 10 years, 82 723 Australian adults had incident epilepsy, whereas 125 223 formed the prevalent cohort". **New instances**: J1 (D6-01) and TF2 (D6-03). |
| **D5-05** table follow-up returns one row in a code fence (P1) | **Fixed structurally** | TF2 `done` 16.7 s: a clean three-row Markdown table, no fence, no "stopped mid-sentence". But the n column reads "FAS", "not reported", "not reported" and one cell carries the wrong outcome - D6-03. |
| **D5-06** session context lost at turn two (P1) | **Fixed** | E2 "What was the strongest predictor in that study, with its odds ratio and confidence interval?" `done` **15.2 s** (was a 35.7 s refusal): "the age at the start of withdrawal ... a hazard ratio of 0.96 (95% CI 0.95-0.98).[1]" (`e265c72c` table: "Age at start of ASM reduction (years) 24 (19-31.75) - - 0.96 (0.95-0.98) <0.0001"). E3 "Back to the JME cohort ...": "20.6% of individuals had a psychiatric comorbidity (n = 2018).[1]" (table: "Yes 416/2018 (20.6%)"). |
| **D5-07** "Grant background:" scoped to an author named Grant (P1) | **Fixed** | G01 `done` 16.9 s, 15 figures checked, 10 sentences 10 cited, both halves answered ("HR 0.11, 95% CI 0.02-0.70, p = 0.02, n = 51 ... HR 0.60, 95% CI 0.15-2.44, p = 0.47" and the LGI1 early-immunotherapy section). No author scope note. |
| **D5-08** unchecked text shown then withdrawn (P2) | **Fixed** | Phone Ask (390 px): marks `["checking@1795","verified@11894","complete@13404"]` ms. Final: "The 12-month retention rate for perampanel in the PERMIT study was 64.2% (2698/4201) in the Retention Population.[1]", badge "4 figures checked", "5 retrieved &middot; 1 cited &middot; 2014-2026". |
| **D5-09** terse questions refused (P2) | **Fixed** | T01 "ICV valproate seizure reduction - number?" `done` **6.6 s**: "four subjects responded with more than 50% seizure reduction at the highest tested dose of 160 mg/day of ICV valproate.[1] Additionally, two subjects experienced extended periods of complete seizure freedom.[1]" |
| **D5-10** quiz and briefing rest on a second-hand figure (P2) | **Fixed** | Assessment JSON: `"omitted_secondhand": 1` - the 14%-35% relapse question is gone. Briefing takeaways: "Rituximab exposure reduces relapse risk in anti-LGI1 encephalitis (HR 0.10)", "Methylprednisolone improves mRS scores at 12 months (OR 4.48)", "Rituximab delays time to first relapse in anti-NMDAR encephalitis (HR 0.11)" - all three verbatim in `8565cc8f` and `7622042349`, no conflation. Every briefing figure now carries a `statements` entry `{figure, outcome, population, study}`. A new attribution defect in the quiz: D6-09. |
| **D5-11** protocol recruitment given as sample size (P2) | **Partly** | The "the 1 resources" plural is fixed ("Retrieval was limited to the 42 resources authored by D'Souza in this collection"), and no protocol figure is offered as the enrolment. But X5 now gives **no** sample size and lists one paper while citing two - D6-10. J10 on the same corpus does return "196 participants, with 101 (51.5%) having newly diagnosed epilepsy, 46 (23.4%) ... and 49 (25.0%) having syncope" (`9cb1d5d7` verbatim), so the figure is reachable. |
| **D5-12** two cohorts stitched into one sentence (P2) | **Fixed** | X1 answers entirely from `04a6acb8`: "heart rate cycles were found in all 46 participants, which included both people with epilepsy and healthy controls.[1] Among the participants with epilepsy, 19 individuals had at least 20 reported seizures, and 10 of these had seizures significantly phase-locked to their multiday heart rate cycles.[1]" The healthy-adult paper `a1b7fad1` is no longer merged into the cohort sentence. |
| **D5-13** denominator addendum mis-pairs or nags (P2) | **Not fixed** | The mis-pairing is gone; the nagging is not. R01 "*Denominators: 80% is stated without a denominator*" (an F1 statistic); TF1 "*4%*"; TF2 "*71.1%, 11.7%, 23.2%, 4% are stated without a denominator*" - in a table whose whole point is denominators; J10 "*17.1%, 28%*"; J1 "*39.8%, 38.3%*" where `dc05b6a3` gives them as "lack of effectiveness (232 [39.8%]), tolerability unrelated to behavioural AEs (BAEs) (223 [38.3%])" with "n = 583" in the previous line. |
| **D5-14** the paper's own figure is not offered after a removal (P2) | **Partly - the mechanism exists and works once, misses twice** | New and good: TF1 now prints "*For the outcome asked about, [3] itself reports: \"BRV retention was 89.4%, 79.8%, and 71.1% at 3, 6, and 12 months, respectively (FAS; Fig. 1d).\"*" X3 fixes the "overall" stratum label: "SMR for people with epilepsy (PWE) with a psychiatric disorder is 3.6 (95% CI 2.9-4.4).[1] For PWE without a psychiatric disorder, the SMR is 2.5 (95% CI 1.9-3.2).[1]" Still missed: X2 (D6-07); and in J2 the same mechanism offers two effect sizes that answer a different question (D6-05). |
| **D5-15** second-hand classifier misfires (P3) | **Partly - one direction fixed, the other worsened** | Fixed: X4 "a total of 312 saliva samples were collected.[1]" with no flag; J7 now flags "over 22% after 2020" ("*Second-hand figures: 50% [2], 10% [1], 22% [1]*"). Worsened: it now treats any Discussion figure as second-hand - D6-04 (removes the lacosamide trial's own 46.3%) and D6-07 (flags `8565cc8f`'s "Consistent with this observation, **our cohort** had an 80% favorable mRS score at 12 months"). |
| **D5-16** format and template leaks (P3) | **Mostly fixed** | No code fences in any of 47 asks; no empty "**Validation:**" heading; no "(inference)"; plurals fixed. Residual: the Help assistant put a marker in a heading ("### Why does the portal sometimes remove a sentence from an answer?[1]"); TF2 cells read "23.2% (not reported)". |
| **D5-17** two clinical words routed as an exact lookup (P3) | **Fixed** | `/search?q=lamotrigine SUDEP` now returns **21** resources in 1.63 s with no lookup route (was 1 resource). "sub-scalp EEG seizure forecasting" 18, "placebo response adjunctive antiseizure trials" 21, "brivaracetam elderly" 5, "Zzzznotaname" 0. |
| **D5-18** docs silent on document-chat checking (P3) | **Fixed** | help1 `done` 16.8 s: "Yes, the portal checks figures in document chat the same way as in Ask ... The same citation and confidence signals apply in both Ask and document chat.[1][2]" How this works: "Chat with a document ... Its answers are checked against that document's own text and badged the same way." |
| D4-09 UMPIRE demographics withheld (P2) | **Partly** | The whole answer is no longer withheld; the sex distribution comes through ("50% of participants being female (n = 13/26)"). The age sentence is still removed in Ask while document chat on the same paper delivers it - D6-06. |
| D4-18 univariable HR passed off as adjusted (P2) | **Regressed** | J2: the aHR 2.24 sentence is now removed altogether - D6-05. |
| D4-22 two-part refusal (P3) | **Fixed** | G01 answers both halves; help2 and help3 answer both halves, including an honest "The documentation does not specifically describe how to distinguish between a missing figure and a missing paper". |
| D4-16 author lookup (P2) | **Holds** | `D'Souza`, `D'Souza W` both `rule "author"`, 62 resources, 17-20 ms. DOI 2.1 ms, PMCID 1.7 ms, PMID 1.7 ms, 1 resource each. |
| D4-11 "overall" stratum label (P2) | **Fixed** | X3, above. |
| D3-02 correct figures withheld (P1) | **Mostly fixed** | 3 wrong removals in 47 asks (HC1, TF1, J2) against 14 in 108 last loop. |
| D3-05 / D1-09 latency (P1) | **Improved, not closed** | First word median 12.0 -> **10.3 s**, done 15.2 -> **12.1 s**, audit tail 4.1 -> **1.2 s**. Refusals are now fast (P0b 8.9 s, W2 10.3 s, Z2 9.3 s) rather than the slowest answers. Still 10 s before the first word appears. |
| D3-09 / D2-13 / D1-16 stray markers (P2) | **Partly** | W6 "The base year for this projection is 2024.[1][2]" ([2] = a work-productivity paper); J2 "[1][2][3]"; J9 "[1][2][3]"; briefing `takeaway_refs [[1,2],[1],[1,2]]` where takeaway 1 is an LGI1-only result. |
| D3-21 weak-match badge (P3) | **Not re-tested** (no refusal on the phone this loop showed the rail). |
| D2-17 audit tail (P3) | **Fixed** | median 1.2 s, maximum 7.0 s. |

**Summary of the 18 loop 5 findings: 12 fixed** (D5-01 mostly, D5-02, D5-03, D5-05 structurally,
D5-06, D5-07, D5-08, D5-09, D5-10, D5-12, D5-17, D5-18), **5 partly** (D5-04, D5-11, D5-14,
D5-15, D5-16), **1 not fixed** (D5-13). Earlier: D4-11, D4-22, D2-17 fixed; D4-16 holds; D4-09,
D3-02, D3-09 partly; D3-05 improved; **D4-18 regressed**. The seven loop 5 P1s are down to two
residuals, but a P0 is back and four new P1s are open.

---

## 3. Verdict as Prof D'Souza, and score

Most of what was missing last time has come back: my own sentences are no longer deleted from
under me - "80% of EDs in Group 1", "937 (52%)", "87" deaths, "9 (5-13)" years, "14.9% (n = 1111)",
"OR 10.00 (1.68, 59.31)", "AUC 0.70", the twenty-six implanted and twenty-four completing - and
the second turn of my epidemiology chain now answers "0.96 (95% CI 0.95-0.98)" in fifteen seconds
where it refused for thirty-five, the table has three rows without a code fence, "ICV valproate
seizure reduction - number?" comes back in six and a half seconds, "lamotrigine SUDEP" is a
search again, and it is a quarter faster to the first word with the checking mark on screen at
under two seconds. But the price of finding figures more eagerly is that it has started binding
them to the wrong claim: asked about my patient switching off levetiracetam it gave me 16.0% and
13.7% seizure freedom for the switchers when EXPERIENCE reports 13.9% and 10.6% for exactly that
subgroup, it put 11.7% - which is continuous seizure freedom - in a column headed twelve-month
seizure freedom, and it told me "the RANSOM Study found that nonadherence to antiepileptic drugs
is associated with increased mortality" when the only place RANSOM appears in either cited paper
is a line in the bibliography. It also now removes a trial's own placebo responder rate because
that rate sits in the Discussion, calls another paper's "our cohort had an 80% favorable mRS"
second-hand, deletes the SUDEP adjusted hazard ratio of 2.24 that it gave me correctly last loop
and offers me the lamotrigine 0.56 in its place, and deletes a retention figure it then quotes
back to me verbatim two lines below. So the portal now does far more of my week's work than it
did - sessions, tables, terse questions, document chat, briefings, a quiz that drops second-hand
answers - and I would use it; I will not raise the score while it can hand me a confident,
cleanly badged number for a subgroup my patient is not in.

**Impact score: 7 / 10** (unchanged from loop 5, for the opposite reason: last loop it withheld
what was right, this loop it shows some things that are wrong). Open **P0: 1**. Open **P1: 5**.
The bar - 9 or higher with no open P0 or P1 - is **not met**. Without the P0 this would be an 8.

---

## 4. What now has a positive impact (specific)

- **The removals have stopped being the story.** 3 wrong removals in 47 asks against 14 in 108.
  Every one of the eight loop 5 deletion cases I re-ran came back with the paper's own sentence
  and a clean audit (`figuresRemoved []`, `sentencesRemoved 0`).
- **Follow-ups hold the thread.** E1 -> E2 -> E3 kept the JME paper across three turns and pulled
  the odds ratio out of its Results table and the comorbidity proportion out of Table 1
  ("20.6% ... (n = 2018)" against "Yes 416/2018 (20.6%)").
- **The trial-design table works.** Three rows, no fence, markers in the cells, 16.7 s.
- **Terse phone questions are answered, fast.** T01 6.6 s, D01 7.0 s, R08 7.9 s, DC1 7.8 s,
  DC2 8.1 s, J10 8.5 s, X3 8.6 s.
- **The streaming UI is honest now.** "Checking" at 1.8 s, "verified" at 11.9 s, "Answer complete"
  and the badge "4 figures checked" at 13.4 s, on a real 390 px layout viewport.
- **Document chat is exact and quick.** DC1 "23.6% out of 1,674 participants with focal-onset
  epilepsy randomized to placebo" in 7.8 s; DC2 UMPIRE four sentences all cited in 8.1 s,
  including "mean age at implantation was 45 years, with a range of 23 to 71 years" - the very
  sentence the Ask path removes.
- **The rescue-and-offer mechanism.** `figuresRescued` fires (J6 rescued 60%, 15, 20, 30days) and
  TF1 prints the paper's own sentence after a removal.
- **Briefings and quizzes are clean of second-hand figures.** `omitted_secondhand: 1`; every
  briefing figure carries `{figure, outcome, population, study}` and all seven verified verbatim
  (HR 0.10 / 0.11 / 0.05 / 0.60, OR 4.48 / 4.96 / 4.39).
- **A named study the collection does not hold is labelled.** Z1: "*This collection does not hold
  SANAD II itself. The statements above come from sources that cite it second-hand; verify against
  the original before relying on them.*"
- **Search and identifiers.** 21 results for "lamotrigine SUDEP", 62 for every spelling of my name,
  DOI/PMCID/PMID in under 3 ms.
- **Library by study design.** `?kind=randomised-controlled-trial` gives 12 resources in 2.7 s;
  the Kind facet reads cohort-study 79, case-control-study 8, pooled-analysis 4, protocol 24 -
  the vocabulary I would actually filter by.
- **Investigations end to end**: create 0.2 s, two evidence cards, synthesis 10.6 s with the
  figures intact, a `gaps` list and numbered references.
- **Chrome.** Dark mode on every page (body `rgb(18, 19, 22)`), no horizontal overflow on any page
  at 1440 px, at 390 px, or at 22 px root font; "This document does not exist ... Back to library"
  for an unknown id; entity and graph pages load in 2.3 and 3.1 s.
- **How this works** is well written, honest in tone and technically accurate about the platform
  boundary. Four of its promises are not kept by this build - see D6-16.

---

## 5. New findings table

Severity: P0 trust/safety, P1 blocks a job, P2 misleading but workable, P3 polish. Application
defects only; corpus coverage is section 7. "Platform" names where a Progress Agentic RAG feature
should carry the fix.

| ID | Sev | Job | Surface | What happened (exact query) | Expected | Evidence (verbatim, timings, ids) | Suggested fix |
|---|---|---|---|---|---|---|---|
| **D6-01** | **P0** | clinic | Ask body | A specific-patient question answered with the neighbouring subgroup's figures under a clean badge. J1: "A 34-year-old woman with focal epilepsy has behavioural side effects on levetiracetam. What does the real-world evidence say about switching to brivaracetam, in seizure freedom and tolerability?" | 13.9% seizure freedom and 10.6% continuous seizure freedom for patients with psychiatric comorbidity who switched from LEV to BRV. | `done` 22.4 s, `figuresChecked 5, figuresUnsupported [], sentencesRemoved 0, sentencesChecked 7, sentencesCited 7`. Answer: "In the EXPERIENCE study, at 12 months, seizure freedom was achieved in **16.0% of patients with psychiatric comorbidity who switched from LEV to BRV** (FAS).[2] Continuous seizure freedom was achieved in **13.7%** of these patients.[2]" `59d5117c` Results: "At 12 months ... seizure freedom was achieved in 16.0% and 14.4% (FAS) (Fig. 1b); continuous seizure freedom was achieved in 13.7% and 10.4% (Fig. 1c)" - that is the **with/without psychiatric comorbidity** contrast; the very next paragraph reads "In patients with psychiatric comorbidity **who switched from LEV to BRV** and who switched from other ASMs to BRV, at 12 months ... seizure freedom was achieved in **13.9%** and 16.2% (FAS) ... continuous seizure freedom was achieved in **10.6%** and 15.0%". | The located sentence must be matched on its **population clause**, not only its outcome noun: extract the sentence's subject qualifier and require it to entail the claim's population before passing. Where adjacent paragraphs report one outcome for nested subgroups, the narrower wins when the question names it. Platform: `citations: true` with `rag_strategies: [{"name":"neighbouring_paragraphs","before":1,"after":1}]` so both paragraphs reach the check together; the DA `quotesOfInterest` field already isolates these two sentences separately. |
| **D6-02** | P1 | epi, clinic, research | Ask body, second-hand banner | A finding manufactured from a reference-list line, shown with citations to two papers that do not report it. J9: "Is medication adherence associated with mortality in people with epilepsy?" | "This collection holds no study of adherence and mortality" (loop 5's answer), or the banner Z2 produces. | `done` 8.8 s, `figuresChecked 5, figuresUnsupported [], sentencesRemoved 0, sentencesChecked 5, sentencesCited 5`, no second-hand banner. Answer: "For instance, **the RANSOM Study found that nonadherence to antiepileptic drugs is associated with increased mortality.[2][3]** ... Additionally, individuals with epilepsy and comorbid psychiatric illness have a higher mortality risk ... hazard ratio of 1.41 (95% CI 1.02-1.97; 1,805 patients).[1] This suggests that adherence to medication regimens is crucial for reducing mortality risk.[1][2]" [2] = `cb8ba600` (a qualitative barriers-to-adherence study) - `grep -i mortalit` on its full text returns **nothing**, and its only "RANSOM" is reference 7: "Faught RE ... Impact of nonadherence to antiepileptic drugs on health care utilization and costs: findings from the RANSOM study. Epilepsia. 2009;50(3):501-9." [3] = `89271a78`, whose only "RANSOM" is a reference: "Nonadherence to antiepileptic drugs and increased mortality: findings from the RANSOM Study. Neurology. 2008;71:1572-8." The answer is that reference **title**, restated as a result. The banner works when the question names the study: Z2 printed "*This collection does not hold RANSOM itself...*". | Exclude reference/bibliography blocks from the text the checks read (a numbered line ending in a journal-volume-page pattern, or everything after a References heading), so a bibliography can never ground a sentence. Then run the "collection does not hold X" banner on study names the **answer** introduces, not only those the question names. Platform: `/find` with `resource_filters` on the answer's own named study plus the DA study-design label answers "is it here?" in one call. |
| **D6-03** | P1 | trial design | Ask reformat-only follow-up | A table cell carries a different outcome's figure under the column heading, and the n column carries no n. TF2: "Put those figures in a table with one row per drug: drug, study, design, n, 12-month retention, 12-month seizure freedom." | Brivaracetam row: n = 1111 for the freedom cell, 71.1% retention, **14.9%** seizure freedom. | `done` 16.7 s, `figuresChecked 5, figuresUnsupported [], sentencesRemoved 0`. Table: "\| Brivaracetam\| EXPERIENCE \| **FAS** \| 71.1% (FAS) \| **11.7% (FAS)** [1] \|", "\| Perampanel \| Global Pooled Analysis \| not reported \| not reported \| 23.2% (not reported) [2] \|", "\| Lacosamide \| Cohort Study \| not reported \| not reported \| 4% (not reported) [3] \|". `dc05b6a3` abstract: "seizure freedom rates were 22.4% (n = 923), 17.9% (n = 1165), and **14.9% (n = 1111)**; and **continuous seizure freedom** rates were 22.4% (n = 923), 15.7% (n = 1165), and **11.7% (n = 1111)**". The corpus also carries perampanel 64.2% (n = 4201) retention, which R05 and the phone Ask returned correctly minutes earlier. | Treat a column heading as the claim's outcome noun for every cell beneath it and run the located-sentence check per cell; "continuous seizure freedom" must not satisfy "seizure freedom". The n column must take the n from the same parenthesis as the cell's figure, never an analysis-set name. Platform: build the reformat turn from the session's already-verified `{figure, outcome, population, n, study}` records - the briefing path already produces exactly that in its `statements` array. |
| **D6-04** | P1 | trial design | Ask second-hand classifier | A trial's own placebo responder rate removed because it appears in the Discussion. D02: "In the lacosamide primary generalised tonic-clonic seizure trial, what was the placebo 50% responder rate and the group size?" | "46.3% (n = 121)". | `done` 13.7 s, `refused true`, `figuresRemoved ["46.3%"]`, `figuresSecondhandRemoved ["46.3%"]`. Text: "The cited paper carries 46.3% only where it cites other studies (its introduction or discussion), not among its own results, so the figure is not that paper's finding about the cohort you asked about." `7f652beb` **abstract**: "More patients on lacosamide than placebo had &ge;50% (**68.1%/46.3%**) or &ge;75% (57.1%/36.4%) reduction from baseline in PGTCS frequency/28 days ... (n=119/n=121)"; **Discussion**: "The placebo responses seen in this trial were relatively high (median percent reduction in PGTCS frequency: -43.24%; **50% responder rate: 46.3%**; observed seizure freedom rate: 13.2%)." | Section is not provenance. A Discussion sentence is first-hand when its subject is self-referential ("this trial", "our cohort", "we found", "the present study") or when the same figure also appears in the abstract, Results or a table of the same paper. Only a sentence ending in a reference marker, or one whose subject is another named study, is second-hand. Check the abstract first: this figure was in it. |
| **D6-05** | P1 | clinic | Ask gate and the "effect size" helper | A clinic figure loop 5 returned correctly is now removed, and the substitute offers effect sizes for other questions. J2: "What is the strongest modifiable risk factor for SUDEP, and what is its adjusted hazard ratio?" | "aHR 2.24 (95% CI 1.07-4.68, P = 0.031)". | `done` 11.9 s, `figuresRemoved ["4.68"]`, `foundIn ["Risk of sudden unexpected death in epilepsy (SUDEP) with lamotrigine ..."]`. Text: "The strongest modifiable risk factor for SUDEP is the frequency of tonic-clonic seizures.[1][2][3] *One sentence was removed ... its figures (4.68) could not be verified* ... *Effect size in the cited passage: for \"... channel function in the SUDEP cohort compared to the epilepsy control cohort\", OR = 0.8, 95% confidence interval 0.17-3.8 [1]; for \"... at the time of EMU admission compared to those who were not\", adjusted hazard ratio [aHR] = 0.56; 95% CI: 0.31-1.01, P = 0.054 [2].*" `020e1d7c` (= [2]) carries the figure twice: "associated with >2- fold SUDEP risk, irrespective of lamotrigine (aHR = 2.24;" and "of lamotrigine or NaM- ASM use (aHR = 2.24; 95% CI: 1.07- 4.68, P = 0.031 and aHR = 2.25; 95% CI: 1.09- 4.67,". Loop 5's C3 returned this verbatim - D4-18 regression. | The rescue lookup already reaches this paper (`foundIn` names it); it must accept a figure split across a line break inside a parenthesis ("1.07- 4.68") - normalise the en dash and the intra-number space before matching. The effect-size helper must only offer an effect size whose own sentence shares the question's exposure noun; offering the lamotrigine aHR under a tonic-clonic-seizure question is worse than offering none. |
| **D6-06** | P1 | research, clinic | Ask gate vs document chat | The same figure in the same paper is removed by Ask and delivered by document chat, and one removed sentence is quoted back verbatim two lines below the removal notice. | One rule, one outcome. | HC1 "What was the median age and sex distribution of the UMPIRE participants?" `done` 18.9 s: "*One sentence was removed ... its figures (23, 71) could not be verified - the figures were found in \*The UMPIRE study ...\* but could not be tied to the claim*". `f9e7bfdb`: "Half were assigned female sex at birth, with a mean age at implantation of **45 years (range = 23-71)**." DC2, same paper, 8.1 s earlier: "The mean age at implantation was 45 years, with a range of 23 to 71 years.[1]" - kept, 9 figures checked, 4/4 cited. TF1: "*One sentence was removed ... its figures (71.1%) could not be verified*" immediately followed by "*For the outcome asked about, [3] itself reports: \"BRV retention was 89.4%, 79.8%, and **71.1%** at 3, 6, and 12 months, respectively (FAS; Fig. 1d).\"*" - and TF2 then printed 71.1% in the table without complaint. | Run the Ask gate against the same normalised full text the document-chat gate uses, with the same pinned scope. When the rescue lookup finds the sentence that carries the figure, rebind and keep it rather than removing it and quoting the rescue - How this works already promises exactly that. Platform: `rag_strategies: full_resource` on the pinned paper for the rescue read. |
| **D6-07** | P2 | epi, research | Ask population pin and second-hand classifier | A question naming the consortium cohort answered from an LGI1 sub-study, led by a figure the same answer flags as second-hand, while the consortium's own figure is retrieved and unused. X2: "What proportion of the Australian autoimmune encephalitis consortium cohort had a favourable modified Rankin score at 12 months?" | "154 (67%) at 12 months" in the consortium cohort, with the LGI1 sub-study's 38 (79%) named separately. | `done` 10.7 s. Answer opens: "In the Australian Autoimmune Encephalitis Consortium cohort, **80%** of patients had a favourable modified Rankin score (mRS &le; 2) at 12 months.[1]" then "The paper's own finding: \"At 12months, the mRS had improved in 34 (71%) patients, while a favorable mRS was recorded in 38 (79%) ...\"" then "*Second-hand figures: 80% [1] appears in the cited paper only where it cites other studies*". [1] = `8565cc8f`, whose sentence is "Consistent with this observation, **our cohort** had an 80% favorable mRS score at 12 months" - first-hand. `9dd53383` **was in the sources** and reports "At 12 months, a favourable mRS (&le; 2) occurred in **154 (67%)** patients". | (a) The second-hand test must not fire on "our cohort" (D6-04); (b) a flagged sentence must never lead the answer - demote it and promote "The paper's own finding"; (c) the cohort pin should resolve "the Australian autoimmune encephalitis consortium cohort" to the consortium's own paper when it is in the source set. Platform: the DA relation graph already links both papers to the consortium entity; use `resource_filters` from the entity rather than title-string similarity. |
| **D6-08** | P2 | all | Ask denominator addendum | The addendum demands denominators for figures that take none, and for figures whose denominator the cited paper gives in the same paragraph. | Silence, or the paper's n. | R01 "*Denominators: 80% is stated without a denominator, and the cited passage gives none beside the figure*" - an F1 statistic. TF2 "*71.1%, 11.7%, 23.2%, 4% are stated without a denominator*" printed under a table with an n column. J1 "*39.8%, 38.3% are stated without a denominator*" - `dc05b6a3`: "Among patients with data on the reasons for switching from LEV to BRV (**n = 583**), the most common reasons were lack of effectiveness (**232 [39.8%]**), tolerability unrelated to behavioural AEs (BAEs) (**223 [38.3%]**)". J10 "*17.1%, 28%*" for "17.1% (range 13-28%)" - a range, not a proportion. | Exempt fitted statistics (F1, AUC, R2), ranges, CIs and thresholds; before complaining, look one clause further for "n = " and the "count [percent]" pattern in the same sentence - the D5-03 fix already parses that shape for the positive case. Suppress the addendum entirely inside a table. |
| **D6-09** | P2 | teaching | Assessment | A quiz answer key's Source link points at the wrong paper. | The rituximab question sourced to the rituximab paper. | Assessment JSON, question 2: `"question": "What is the effect of rituximab on relapse in anti-NMDAR antibody-mediated encephalitis?"`, `"source_resource_id": "8565cc8f77a444608d6fded78f602c79"`, `"source_title": "Acute and Long-Term Immune-Treatment Strategies in Anti-**LGI1**..."`, `"source_quote": "A single course of rituximab reduces the risk of relapse of anti-NMDAR antibody-mediated encephalitis."` - `grep -i "single course of rituximab"` on `8565cc8f` returns nothing; the sentence belongs to `7622042349`. Also only 2 questions generated, neither carrying a figure. | Resolve `source_resource_id` by locating `source_quote` in the candidate papers and binding to the one that carries it (the Ask rescue lookup does this already); reject a question whose quote is in no cited paper; ask for a minimum count and prefer figure-bearing questions. |
| **D6-10** | P2 | research | Ask author-scoped review | An author review lists one paper while citing two, and omits the sample size the question asked for. X5: "Which of D'Souza's papers report patient-reported outcomes after a first seizure, and what sample size did they enrol?" | Both papers as separate items; "196 participants enrolled [1]; the protocol planned about 450 [2]". | `done` 15.4 s: "The paper titled \"Trajectories of quality of life, anxiety and depressive symptomatology, and health-related work productivity after first seizure events\" reports on patient-reported outcomes after a first seizure.[1][2] *One sentence was removed from this answer: its figures (3 years) could not be verified* ... *Retrieval was limited to the 42 resources authored by D'Souza in this collection.*" [2] = `eddde3fe` is never named. J10, three minutes later, returned "196 participants, with 101 (51.5%) having newly diagnosed epilepsy, 46 (23.4%) ... 49 (25.0%) having syncope" from `9cb1d5d7`. | Render one list item per cited resource with its title, year and journal; when the question asks a per-paper attribute, fetch it per resource. Platform: `/catalog` already holds year, journal and the DA `stat` field per resource - fill the list from the catalogue and use retrieval only for the finding. |
| **D6-11** | P3 | clinic, teaching | Ask body | A table row's rounding preferred to the paper's Results sentence, and the count dropped. P0c: "In anti-LGI1 antibody encephalitis, what proportion of patients relapsed ...?" | "16 (30%) relapsed, at a median of 414 (IQR 256, 967) days". | `done` 8.3 s, 5 figures checked, clean: "In anti-LGI1 antibody encephalitis, **31%** of patients relapsed (n = 55).[1] The median time to first relapse was 414 days (IQR 256-967).[1]" `8565cc8f` Results: "A total of **16 (30%)** patients experienced at least 1 relapse, at a median of 414 (IQR 256, 967) days"; the "31" comes from a table row "1 16 (31)". Same on the phone UI, badge "5 figures checked". | When a quantity appears in a Results sentence and a table row, prefer the Results sentence and carry its count as well as its percentage. |
| **D6-12** | P3 | all | Ask and Generate markers | Citation markers on papers that do not carry the statement. | One marker per source that carries it. | W6 "The base year for this projection is 2024.**[1][2]**" where [2] = `4492ee1d` "Work productivity, quality of life, and care needs..."; J2 "The strongest modifiable risk factor for SUDEP is the frequency of tonic-clonic seizures.**[1][2][3]**" where [1] is a cardiac-channel biomarker paper and [3] a polygenic risk score paper; J9 "[1][2][3]"; briefing `takeaway_refs [[1,2],...]` on an LGI1-only takeaway. | Emit a marker only for a resource whose located passage supports the sentence - the per-sentence check already computes that set. |
| **D6-13** | P3 | research | Investigations | A synthesis produced on 6 September in Melbourne is titled with the UTC date. | "Synthesis - 2026-09-06". | `{"kind": "synthesis", "title": "Synthesis - 2026-09-05", ... "createdAt": "2026-09-05T23:14:26.669Z"}` created at 09:14 on 6 September AEST. | Format user-facing dates in the tenant's timezone, not UTC. |
| **D6-14** | P3 | all | Every page | Nine of eleven pages set the same generic `<title>`, so tabs and bookmarks are indistinguishable. | "Library &#124; EpRePo Research Portal" etc. | `document.title` = "EpRePo Research Portal" on `/`, `/search`, `/library`, `/investigations`, `/generate`, `/assessment`, `/graph`, `/help`, `/how-it-works`; only `/ask` and `/tools` set their own. | Set a per-route title; each page's `h1` is already correct and can supply it. |
| **D6-15** | P3 | clinic | Library, Search (390 px) | An input control measures 23 px high on the phone. | 24 px minimum. | 390 px sweep: `/library` and `/search?q=D'Souza` each report one `INPUT` at height 23; every other page reports no control under 24 px. (Inline prose links measure 19-21 px on `/how-it-works`, `/tools`, `/help` - acceptable as text links.) | Raise the control to the 24 px minimum. |
| **D6-16** | P2 | all | How this works | Four statements on the page are not true of this build, and I checked each one deliberately. | The page describes what the build does. | (a) "a request to put the earlier answers in a table keeps every row, with any cell the check could not verify marked **\"not verified\"**" - TF2's cells read "not reported" and "FAS", and one unverified cell (11.7%) was neither marked nor blank but wrong (D6-03). (b) "a figure the cited paper only quotes from other studies is **removed rather than annotated**" - X2 annotated it and led with it; J6 and J7 also annotate. (c) "A figure the cited passage does not carry is looked for in the full text of the retrieved papers, and **if one of them carries it the sentence is cited to that paper instead**" - TF1 found it, printed it, and removed the sentence anyway (D6-06). (d) "A study named in the question is **pinned into the sources so it cannot be crowded out**" - X2 named the consortium cohort and was answered from a sub-study while the consortium paper sat in the sources; W3 named "the EXPERIENCE brivaracetam study" and got a refusal. | Either make the build match the page or soften the four claims. The page's honesty is its value; a promise I can falsify in three questions costs more than a vaguer sentence would. |

**Counts: P0 1 (D6-01), P1 5 (D6-02 to D6-06), P2 5 (D6-07, D6-08, D6-09, D6-10, D6-16) plus
D5-13 carried over, P3 5 (D6-11 to D6-15).**

---

## 6. The single change that would move the score most

**Bind every passed figure to the population clause of the sentence it was located in, and stop
the check reading bibliographies.** The P0 and three of the five P1s are the same defect in
different clothes: the locate-first change made recall excellent and left precision resting on the
outcome noun alone, so a figure now passes whenever it sits near the right words - in the adjacent
paragraph about a different subgroup (D6-01: 16.0% for "with psychiatric comorbidity" sold as "who
switched from LEV to BRV", when 13.9% is two lines below), under a differently defined outcome
(D6-03: continuous seizure freedom 11.7% under a "12-month seizure freedom" heading), or in a
reference list (D6-02: a bibliography title restated as the RANSOM study's finding). Concretely:
(1) when the check locates a figure, capture the located sentence's subject qualifier as well as
its outcome noun, and require the claim's population to be entailed by it - "patients with
psychiatric comorbidity" does not entail "patients with psychiatric comorbidity who switched from
LEV to BRV", and when the question names the narrower group the narrower paragraph must win;
(2) strip reference and bibliography blocks from the normalised text the check reads, so no
sentence can ever be grounded on a citation line, and extend the "this collection does not hold X"
banner to study names the *answer* introduces, not only those the question names; (3) make the
outcome test exact rather than substring - "continuous seizure freedom" must not satisfy "seizure
freedom", "all-cause discontinuation" must not satisfy "discontinuation for adverse events". This
alone takes me from 7 to 9, because it closes the P0, D6-02 and D6-03 without touching anything
that improved this loop.

**Platform.** Ask for `citations: true` with
`rag_strategies: [{"name":"neighbouring_paragraphs","before":1,"after":1}]` so the cited paragraph
*and its neighbour* arrive together - in D6-01 the correct paragraph is literally the next one, and
the check never saw it. Use `/find` with `resource_filters` on the pinned resource plus
`rag_strategies: full_resource` for the rescue read, and take the paragraph type from the platform
so a reference block is identifiable rather than inferred. The briefing path already produces
`{figure, outcome, population, study}` per statement - that structure is the fix; it just has not
been carried into Ask or into the reformat table.

**Next three:**

1. **Section is not provenance** (D6-04, D6-07). A Discussion sentence with a self-referential
   subject ("our cohort", "this trial", "we found") is first-hand; check the abstract before
   declaring anything second-hand; and never let a sentence the answer itself flags as second-hand
   be the answer's lead - promote "The paper's own finding" instead.
2. **One gate, one outcome** (D6-06, D6-05). Ask and document chat must run the same check over the
   same normalised text with the same pinned scope; when the rescue lookup finds the sentence,
   rebind and keep it rather than removing it and quoting the rescue two lines below; normalise a
   figure split across a line break inside a parenthesis ("1.07- 4.68"). Then correct How this
   works, or the build, so the four falsifiable promises in D6-16 hold.
3. **Denominators where they belong** (D6-08, D5-13, D6-03). Suppress the addendum inside tables
   and for fitted statistics, ranges and thresholds; look one clause further for "n = " and the
   "count [percent]" pattern before complaining; and fill a table's n column from the figure's own
   parenthesis rather than with an analysis-set name.

---

## 7. Coverage notes (corpus, not application)

- No adherence-and-mortality study in the collection - loop 5 said so and it is still true;
  D6-02 is application (the portal filled the gap from a bibliography instead of saying so).
- No annual incidence rate for Australian adults: `83bc89d3` gives "In 10 years, 82 723 Australian
  adults had incident epilepsy" and the 2024 prevalent cohort of 125 223 but no rate per 100,000.
  J8's "the specific annual incidence rate is not provided in the sources" is correct.
- SANAD II is absent and correctly banner-labelled (Z1). RANSOM is absent (Z2 banner correct).
- No proportion of JME patients showing generalised spike-wave on EEG that retrieval surfaced -
  J4's boundary statement is right.
- No anxiety prevalence at first seizure separate from depression; `8b337b45` gives "17.1%
  (range 13-28%)" for depressive symptoms only. J10's boundary is right.
- The EXPERIENCE discontinuation-for-TEAE figure still sits in a table the extraction renders as a
  column of bare numbers, so W3 refused rather than answering (the right failure mode, but the
  figure is in the corpus).
- The multiday heart-rate paper reports phase locking twice, "10 of these" (multiday, abstract)
  and "17 (89%)" (any cycle, Results); both W5 and X1 are correct for their respective claims,
  which reads as inconsistent across turns without being wrong.
- All 42 of his articles are present; author lookup returns 62 (42 articles plus 20 supplements).

---

## 8. Performance table

API asks, single request with automatic routing; seconds from the request. "first" = first delta,
"done" = final text, "end" = audit and quality received. Medians over 47 asks: **first 10.3,
done 12.1, end 13.2**; audit tail median 1.2 s, maximum 7.0 s. Loop 5 medians for comparison:
first 12.0, done 15.2, end 20.3, tail 4.1.

| Q | Job | first | done | end | verdict |
|---|---|---|---|---|---|
| P0a | epi | 15.3 | 16.9 | 19.5 | correct, verified (1,805 / 147) |
| P0b | epi | 6.4 | 8.9 | 15.9 | correctly withheld, names where 3.9 was found |
| P0c | clinic | 6.4 | 8.3 | 10.0 | 414 days correct; 31% vs the paper's 30% (D6-11) |
| W1 | trial | 9.0 | 11.3 | 12.4 | FIXED: 23.6% out of 1,674 |
| W2 | epi | 10.3 | 10.3 | - | clean refusal (my question was underspecified) |
| W3 | trial | 19.5 | 22.0 | 27.8 | refused; the figure is in a table the extraction flattens |
| W4 | trial | 14.2 | 15.8 | 17.5 | FIXED: 4,617 |
| W5 | research | 10.7 | 13.0 | 13.0 | correct (17/19, Results) |
| W6 | epi | 8.1 | 10.1 | 12.8 | correct per the abstract; stray [2] (D6-12) |
| R01 | teaching | 9.6 | 12.1 | 13.8 | FIXED: 80% and 37% both kept |
| R02 | epi | 11.2 | 12.6 | 12.6 | FIXED: 937 / 1,805 |
| R03 | epi | 12.0 | 14.3 | 16.0 | FIXED: 147, 87, 60 |
| R04 | epi | 18.5 | 22.3 | 22.3 | FIXED: 9 (IQR 5-13) |
| R05 | trial | 11.5 | 13.4 | 13.4 | FIXED: 14.9% (n = 1111, FAS) |
| R06 | research | 11.6 | 11.6 | 11.6 | FIXED: OR 10.00 (1.68-59.31) |
| R08 | research | 6.0 | 7.9 | 7.9 | FIXED: AUC 0.70 (0.68-0.72) |
| C01 | clinic | 6.3 | 9.3 | 9.3 | FIXED: ICV valproate, 6/6 cited |
| C02 | epi | 12.6 | 15.9 | 18.7 | FIXED: 101 cases / 199 controls |
| D01 | research | 5.4 | 7.0 | 8.7 | FIXED: 11% (3/28) |
| D02 | trial | 11.8 | 13.7 | 18.5 | **D6-04**: the trial's own 46.3% removed as second-hand |
| T01 | clinic | 5.1 | 6.6 | 7.6 | FIXED: terse question answered |
| E1 | epi | 11.1 | 13.3 | 15.0 | correct, 3/3 cited |
| E2 | epi | 13.2 | 15.2 | 17.2 | FIXED: HR 0.96 (0.95-0.98) on turn two |
| E3 | epi | 13.3 | 15.0 | 16.9 | FIXED: 20.6% (n = 2018) on turn three |
| G01 | research | 10.4 | 16.9 | 16.9 | FIXED: both halves, 10/10 cited |
| TF1 | trial | 16.6 | 29.8 | 29.8 | **D6-06**: 71.1% removed then quoted verbatim |
| TF2 | trial | 14.4 | 16.7 | 16.7 | table fixed; **D6-03** wrong outcome in one cell |
| DC1 | trial | 6.3 | 7.8 | 7.8 | FIXED: document chat 23.6% / 1,674 |
| DC2 | research | 5.8 | 8.1 | 8.1 | FIXED: 26 implanted, 24 completed, 45 (23-71), 13/26 |
| HC1 | research | 17.3 | 18.9 | 22.7 | **D6-06**: the same age sentence removed in Ask |
| X1 | research | 17.0 | 20.9 | 22.5 | FIXED: one cohort, correctly split |
| X2 | epi | 8.5 | 10.7 | 10.7 | **D6-07**: second-hand lead, wrong cohort |
| X3 | epi | 6.5 | 8.6 | 11.6 | FIXED: 3.6 and 2.5, no "overall" |
| X4 | research | 9.3 | 11.1 | 12.8 | FIXED: 312, no false second-hand flag |
| X5 | research | 12.4 | 15.4 | 16.4 | **D6-10**: one paper of two, no sample size |
| J1 | clinic | 12.9 | 22.4 | 25.9 | **D6-01 (P0)**: 16.0% / 13.7% for the wrong subgroup |
| J2 | clinic | 8.7 | 11.9 | 12.7 | **D6-05**: aHR 2.24 removed, 0.56 offered |
| J3 | clinic | 9.0 | 12.5 | 12.5 | correct, 4/4 cited, well qualified |
| J4 | teaching | 8.2 | 11.1 | 12.3 | honest boundary |
| J5 | teaching | 7.1 | 10.8 | 10.8 | correct: five ILAE LGS criteria, cited |
| J6 | research | 10.5 | 13.4 | 13.4 | correct; 60% flagged second-hand but still the lead |
| J7 | trial | 6.1 | 9.4 | 10.7 | 22% now flagged (fix); "50%" flagged in error |
| J8 | epi | 6.3 | 8.6 | 14.1 | honest boundary |
| J9 | epi | 5.6 | 8.8 | 10.0 | **D6-02**: RANSOM finding from a bibliography |
| J10 | epi | 5.3 | 8.5 | 10.2 | correct: 17.1% (13-28%), 196 enrolled with the split |
| Z1 | teaching | 15.8 | 21.0 | 21.9 | correct: absent-study banner plus second-hand flags |
| Z2 | epi | 6.6 | 9.3 | 9.3 | correct: absent-study banner |

Non-ask timings: search 1.7 ms (PMID) to 1.63 s (two-word phrase); briefing 12.7 s; assessment
12.0 s; investigation create 0.2 s, synthesis 10.6 s; docs/ask 11.2-21.0 s; page loads 0.56-1.40 s
desktop, library facet 2.7 s, resource detail 2.8 s, entity 2.3 s, graph 3.1 s.

---

## Is the bar met?

**No.** The bar is a score of 9 or higher with no open P0 and no open P1. This loop scores **7**
with **one open P0 (D6-01)** and **five open P1s (D6-02 to D6-06)**.

**What stands between this build and the bar** is one defect class, seen five times: the figure
check passes a figure on proximity and an outcome noun, without binding it to the population
clause or the exact outcome of the sentence it was located in, and it reads bibliographies as if
they were prose. Fix that binding and stop the check reading reference blocks, and D6-01, D6-02
and D6-03 close outright; D6-04 and D6-07 close with the "our cohort / this trial" rule; D6-05 and
D6-06 close by running one gate over one normalised text and rebinding instead of removing.

**This gap is application work, not platform or corpus work.** Everything the fixes need is already
available: the paragraph the answer needs in D6-01 is the neighbour of the one that was checked,
and `rag_strategies: neighbouring_paragraphs` with `citations: true` will deliver it; the
`{figure, outcome, population, study}` structure the check wants is already produced on the
briefing path; the absent-study banner already exists and only needs to fire on names the answer
introduces as well as names the question carries. The corpus limits I met this loop (no adherence
mortality study, no annual incidence rate, no JME EEG proportion, the EXPERIENCE TEAE table
flattened by extraction) were all handled honestly by the build except where the application
filled the gap itself, which is D6-02. The remaining latency floor - the platform's retrieval stage
inside a 10.3 s median first word - is platform work, but it is a P3 at this point, not what holds
the score at 7.
