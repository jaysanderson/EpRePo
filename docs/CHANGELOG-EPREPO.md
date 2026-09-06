# EpRePo changelog

One entry per pull request merged into `feat/eprepo-portal`, newest first. Each says what
changed for the reader and which findings it closed. Finding ids: `P<persona>-<n>` from the
ten-persona evaluation (`docs/EPREPO-ROADMAP.md`, `docs/persona-reports/p1.md` to `p10.md`),
`R<n>` roadmap items, `D<loop>-<n>` from the D'Souza test-fix loops
(`docs/persona-reports/dsouza-loop1.md` to `loop5.md`). Dates are the merge dates (UTC).
The architecture of the answer trust layer these entries built is in `docs/TRUST-LAYER.md`.

## PR (this loop) - 6 September 2026 - D'Souza loop 8 (n1): the portal describes its own failures

For the reader: a platform failure is now told in the portal's own words. Follow a stale document
link and the answer card says "That document link is not valid." where it used to print the
vendor's name, its endpoint host, the knowledge-box id and the platform's raw validation body
straight onto the screen; a busy platform says it is busy, anything else keeps only an HTTP status,
and the detail goes to the server log. The same wording now covers Ask, document chat, the help
assistant and the estate ask, whether the failure is thrown or reported as a stream event, and a
test asserts over a real ask's payload that no host, UUID or vendor name can reach it. Beside it,
an answer's opening claim no longer outlives its evidence: when a removal leaves nothing in the
answer that speaks to the lead claim, the lead goes with it and the honest coverage decline stands
in its place, instead of a bare assertion left standing under a paper that does not carry it.
Closes D8-07 and D8-09. Administration screens keep their diagnostic messages by design; they are
passcode-gated and are not a reader surface.

## PR (this loop) - 6 September 2026 - the Dravet clause regression, and second-hand on a paper with no Results

For the reader: ask "Which anti-seizure medications are contraindicated in SCN1A Dravet syndrome?"
and the answer names lamotrigine and the sodium channel blockers, cited to the international
consensus statement. It used to open on a **phenytoin** heading, argue that phenytoin may be
beneficial in Dravet syndrome, and then decline the question for cannabidiol and fenfluramine,
which the reader never mentioned: clause pinning was inventing one clause per drug from the drugs
retrieval happened to return, on a question that names no drug at all. A question that names no
treatment is no longer decomposed by treatment, and an open "which medications" question about a
syndrome the collection has guidance for is answered against that guidance. A category comparison
still needs a ranking cue, so "which anti-seizure medication has the best real-world retention" is
still answered drug by drug, and so is a named comparison. Ask the fenfluramine dose in Dravet
syndrome with and without stiripentol and the four figures (0.7 mg/kg/day, 26 mg/day, 0.4, 17) no
longer carry a second-hand note: a review article has no Results section, so calling its own
dosing paragraph second-hand was reading a section heading that was never there, and a proportion
printed beside the group a paper counted - "(physicians: n = 19, 100%)" - is that paper's own
count wherever the extraction placed it. Regression-checked live: brivaracetam versus perampanel
at 12 months, the placebo responder rate, anti-LGI1 relapse, the consortium mRS, and carbamazepine
in juvenile myoclonic epilepsy.

## PR (this loop) - 6 September 2026 - D'Souza loop 8 (m2): removal is real, and the paper is read before the refusal

For the reader: an answer no longer prints a figure its own footnote says it removed. Ask to
compare brivaracetam and perampanel at 12 months and the note names 33.8%, which is gone from the
page, instead of naming 22.1% and 14.9% while printing both - and the 22.1% it printed was the
other trial arm's number, which the check now catches, because a figure belongs to the arm its own
phrase names. Ask what placebo responder rate to assume for powering a trial and the wrong "22%
(n = 1,674, full analysis set)" is removed rather than served under a High confidence badge: a
denominator must come from the figure's own sentence, and an analysis set the paper does not name
beside the figure is not the paper's wording. Ask the anti-NMDAR rituximab study what proportion
relapsed and at what median time and both halves of its Results sentence come back - 28% of 67 at
a median of 764 days - where the gate used to keep the 764 and delete the 28%. Ask the
standardised mortality ratio in psychiatric comorbidity, or the relapse rate after withdrawal in
juvenile myoclonic epilepsy, and the paper's own sentence is quoted and cited where both questions
used to be refused with that paper at the top of the refusal's own list. Beside them: a marker is
no longer lent by a phrase every epilepsy paper uses, a finding the answer credits to authors who
did not write the cited paper is named as second-hand, a sentence the check could tie to no
passage is named under the answer, a heading the gate emptied goes with its sentences, and the
sub-question decomposition may hold up retrieval for seven seconds rather than sixteen (first word
16.5-18.1 s to 13.7-14.1 s on the sleep-deprivation question). Closes D8-02, D8-05, D8-11 and the
D3-02 regression, D8-01, part of D8-04, and D8-18; How this works is rewritten to what the build
checks. Left: D8-03, D8-06, D8-12, D8-13, D8-14 (clause decomposition and composition, batch m1),
D8-07 to D8-10, D8-15 to D8-17, D8-19, D8-20.

## PR (this loop) - 6 September 2026 - D'Souza loop 8 (m1): clause pinning - a question is answered one paper at a time

For the reader: ask "if I am powering an add-on trial, what placebo responder rate should I assume,
and from how many patients is that estimate drawn?" and the portal answers 23.6% of 1,674, from the
pooled placebo analysis - the same figure it gives when you name that analysis. It used to answer
22% of 1,674 under a High confidence badge, pairing a mixture-model subgroup's rate with the whole
cohort's denominator while the paper's own contradicting sentence sat in the evidence list three
centimetres below. Ask it to compare brivaracetam and perampanel and each drug's retention rate now
sits under its own heading, cited to its own paper, instead of a perampanel extension's 74.6%
printed under a heading that said Brivaracetam.

What changed: a question that asks for a quantity, compares two treatments, or weighs a drug in a
condition is now broken into clauses BEFORE retrieval; each clause is resolved to one paper - by the
names it uses, then by the medications and conditions that scope it (a drug scopes a clause and
never pins an answer), then by retrieval, with a clause that has no subject of its own staying with
the clause before it; each clause is answered as a one-paper ask, exactly as document chat is
constrained; and the answers are composed so that every sentence carries exactly one citation
marker. No sentence can draw on two papers, because no generation ever saw two. A clause that
resolves to nothing, or whose paper answers nothing, is declined by name and the rest of the answer
stands; when no clause is answered at all the ordinary retrieval runs instead, so clause pinning
never turns an answerable question into a refusal. The framing a question carries for the portal
("for a registrar teaching session:") is stripped before the corpus sees it, and the paper for a
clause is chosen by the phrase it shares with the question rather than by a semantic score that
puts a paediatric lacosamide trial one point above the pooled placebo analysis. Deleted with it:
the per-entity retrieval pin of D2-03, which existed so that "one drug's figure is never read off
the other drug's paper" and demonstrably did not achieve it. Closes D8-01, D8-14, D8-13, D8-06 and
the D8-03 substitution; improves D8-04, D8-05 and PA1a.

## PR (this loop) - 6 September 2026 - D'Souza loop 7 (l1): retrieval is pinned to what the question names

For the reader: ask "in anti-LGI1 antibody encephalitis, what proportion of patients relapsed, and
at what median time to first relapse?" and the portal answers 16 patients (30%) at a median of 414
days (IQR 256 to 967), from the anti-LGI1 paper. It used to answer 28% at 764 days from the
anti-NMDAR paper, cited to the LGI1 paper, under a High confidence badge. Ask what proportion of
the Australian autoimmune encephalitis consortium cohort had a favourable modified Rankin score at
12 months and it answers 154 patients (67%) from the consortium's own prognostication study, not
the 80% an LGI1 sub-study of 55 reports. Ask a registrar-teaching question that names the BREATHS
trial and it answers what BREATHS tests, instead of "no source in the corpus comes close" about a
trial the search box returns as hit one.

What changed is the architecture, not another rule. Before a word is retrieved, the antibodies,
antigens, consortia, registries, trial acronyms, quoted titles, described cohorts and lexicon
medications a question names are resolved against the collection; where they identify a small
enough set of papers and a find inside those papers carries the question or one of its clauses,
the answer is generated over those papers alone, on the platform's own `resource_filters` - the
same mechanism that makes document chat trustworthy. The wrong cohort's paper is no longer
filtered out of the answer afterwards: it is never in front of the answer. A clause the pinned
papers cannot answer widens the pin with the paper that does. A name that titles many papers is a
topic and pins nothing, and a drug on its own never pins, so a question that names no study
retrieves exactly as it did before.

The layer is smaller after this change, not larger. Removed: the question-level cohort guard and
its removal reason, the catalogue matching it needed (`cohortPapers`, `cohortPhrases`), the
restricted rescue and second-hand pools, the `alwaysNamed` escape hatch, the name test on a cited
text while a pin is in force, and the dead `numbersMissing`. Added, because the platform honours
`resource_filters` weakly on `/ask`: a citation to a paper outside the pin is dropped before
anything is checked, the rescue read's pool is the pinned papers alone, and the one retry reads
the pinned paper whole (`rag_strategies: full_resource`) rather than through the paragraph budget
the first pass already used.

Closes D7-01, D7-02, D7-09 and D6-07; closes D6-01 and most of D7-04 (the paraphrase consistency
of the antibody, cohort and named-trial families). D7-05 and the SUDEP half of D7-04 stay open:
those questions name nothing the catalogue can resolve, so they get no pin and the figure check is
what stands behind them. `docs/TRUST-LAYER.md` section 2 has the full rule list and what it
replaced; `docs/INTENT-ROUTING.md` has the resolution rules; `docs/ARAG-DEV.md` has the platform
facts (top-level `resource_filters` on `/ask`, `depth: 'deep'` for `full_resource`, and that
scores from a filtered find are not comparable with scores from an unfiltered one).
## PR #23 - 6 September 2026 - D'Souza loop 7 (l2): safety verbs bound to their medication, removals that take their dependants

For the reader: the portal will no longer tell you a medication is contraindicated because the
word appears somewhere near it. A safety verb is now read with the medication nearest it, and at
its own strength: a paper that says "Carbamazepine, which is not recommended for treatment of
JME" no longer carries "carbamazepine is contraindicated in JME", and the answer says so and
quotes what the paper does say. The same holds for "should be avoided", a boxed warning,
"aggravates" and "first-line". When a sentence is removed because the collection holds no paper
for the study it names, what rested on it goes too - the conclusion drawn from it and the opening
answer, when nothing left in the answer stands behind them - and an answer with nothing left to
cite is declined with the closest matches rather than shown. An answer that asserts a finding
with no citation at all is never shown, whether or not it states a figure, and a decline names
the study the collection does not hold. The "this collection does not hold X" banner no longer
fires on "SUDEP1" or "JME1 2", the citation-marker fragments the extraction leaves behind. A
figure the check removed is never quoted back verbatim two lines below its own removal notice. A
knowledge check quotes the paper's own words, verified as a run of eight consecutive words rather
than a bag of them, so a machine-written page summary can no longer be shown as a paper's
sentence; a question's second attribution is dropped when it names a different paper; and when
fewer questions survive the source check than were asked for, the page says so.

Closes D7-03 (P0), D7-07, D7-08, D7-10 (the removal-then-quote half), D7-11, D7-12.

## PR #22 - 6 September 2026 - D'Souza loop 6 (k1): the population clause, exact outcomes, bibliographies, a paper's own words

For the reader: a figure now belongs to the group the paper reports it for. Asked what the
real-world evidence says about switching a patient from levetiracetam to brivaracetam, the portal
answers 13.9% seizure freedom and 10.6% continuous seizure freedom for the switchers, not the
16.0% and 13.7% the same paper reports for the wider comorbidity subgroup one paragraph earlier.
An outcome must match exactly where the paper itself is exact, so a continuous seizure freedom
rate no longer fills a "12-month seizure freedom" column: each table cell is checked under the
heading above it, and the brivaracetam row reads 14.9% (n = 1111, FAS). Reference lists wrapped
over several lines are cut from every paper before the check reads it, so a bibliography entry can
no longer become a finding - "the RANSOM Study found that nonadherence is associated with
increased mortality" is removed and the removal is stated. A paper's own words are never
second-hand: the lacosamide trial's own placebo 50% responder rate of 46.3% (n = 121) comes back,
"our cohort had an 80% favorable mRS" is not flagged, and a sentence the answer does flag never
leads it. Three figures loop 5 returned and loop 6 withheld are back: the SUDEP adjusted hazard
ratio of 2.24 (95% CI 1.07-4.68, P = 0.031), the UMPIRE mean age of 45 years (range 23 to 71) that
document chat delivered while Ask removed it, and brivaracetam's 12-month retention of 71.1%
(n = 1644, full analysis set), which is no longer removed and then quoted back two lines below.

Findings closed: **D6-01** (P0, the population clause), **D6-02** (bibliographies and the
answer's own named studies), **D6-03** (exact outcomes and the column heading), **D6-04**
(section is not provenance), **D6-05** (the aHR interval and the effect-size helper), **D6-06**
(one gate, one outcome), **D6-12** (markers on papers that carry the figure), and the **D4-18**
regression. Partly: **D6-07** (the second-hand misfire and the flagged lead are fixed; which
consortium paper answers a consortium question is retrieval, not the gate), **D6-11** (the prompt
now asks for the results sentence's count; the gate does not force it).

## PR #19 - 5 September 2026 - D'Souza loop 5 (j2): sessions, the table turn, terse refusals, the checking state, latency

For the reader: a follow-up in a conversation always carries the earlier answers' papers, and one
that stays within them ("what was the strongest predictor in that study", "back to the JME
cohort") is answered from those papers alone with their own paragraphs and tables in front of
the generator, so a Table 1 row is not declined. "Put the three in a table" comes back as a
Markdown table with every row: the code fence is gone, a cell the check could not verify reads
"not verified" and the row stays, and the turn reads only the session's papers with a budget
sized to the rows. A terse clinic question that pinned no paper reads the retrieved paper that
carries its own terms before it is declined. "Grant background:" no longer scopes retrieval to
an author called Grant. While an answer streams its text is shown as unchecked, in muted ink
with an "Unchecked - still streaming" badge, and "First sentence verified" appears only under
visible text, so nothing is presented as the answer and then withdrawn. Code fences, empty
headings, header-only tables and "(inference)" tokens no longer reach the reader. "lamotrigine
SUDEP" is a search, not a lookup of lamotrigine. The in-app documentation and How this works say
document chat is checked the same way. A terse question reads a lighter retrieval context
towards the budget of one probe, one platform ask and one retry per question.
Closed: D5-05, D5-06, D5-07, D5-08, D5-09, D5-16, D5-17, D5-18, D4-06, D4-07, D4-08 (the
application's share; the platform's retrieval stage remains the floor), D3-05 and D1-09 (the
same share).

## PR #17 - 5 September 2026 - D'Souza loop 4 (i1): the gate proves the cohort and the figure before it acts, or refuses

For the reader: a question that names a cohort ("the video-EEG monitoring mortality cohort")
answers from that cohort's own paper, and a figure from a different population is removed with
the reason stated rather than shown or footnoted. A sentence is replaced by a paper's own
sentence only when it carries the same figure at the same time point; a decline is never
replaced. Denominators come from the figure's own bracket, and a wrong pairing in the body is
corrected and the correction stated. The matcher reads thousand separators, PDF glyphs
("1¢66 § 0¢52 h"), decimal proportions and "all p < x" per outcome, so correct figures are no
longer removed by accident. A question about who was in a named study is asked on that paper
first. List items carry their paragraph's citation. Document chat shows the same "N figures
checked" badge. The How this works page describes the gate as it now is. A structured-statement
generation path (`answer_json_schema`) was trialled on twelve questions and not adopted.
Closed: D4-01, D4-02 (both P0), D4-03, D4-04, D4-05, D4-09, D4-10, D4-11, D4-12, D4-13, D4-14,
D4-15, D4-18, D4-19, D4-20, D4-21, D4-22, D3-01, D3-08, D3-13, D3-15, D3-21, D1-14; D3-07 and
D3-09 in part.

## PR #16 - 5 September 2026 - D'Souza loop 4 (i2): first verified sentence, terse routing, session context to turn 4, reformat tables, author lookup, Help two-part questions, closest matches

For the reader: the first complete sentence of an answer is checked against the retrieved papers
as it lands and shown as "First sentence verified against <paper>" while the rest streams. A
terse clinic question ("lamotrigine SUDEP risk - adjusted HR?") routes by rule with no
sub-question decomposition (27.6 s to 9.9 s to the first word). A follow-up that leans on the
earlier turns ("that cohort", "compare") re-reads their papers and passages, and "put the three
drugs in a table" builds the table from the session without a new search or a refusal. Tables
are no longer reported as "stopped mid-sentence" when a row closes. An author lookup returns the
catalogue's author matches only, identical for every spelling of the name, headed "42 articles ·
20 supplements". The Help assistant answers two-part questions part by part. A decline's closest
matches are ranked by the question's outcome noun.
Closed: D4-06, D4-07, D4-08, D4-16, D4-17, D4-23, D3-06, D3-19; D3-05 and D1-09 improved with
the platform's retrieval stage stated as the floor.

## PR #15 - 5 September 2026 - How this works: an architecture page for readers, in the app and in Help

For the reader: a "How this works" page at `/t/:slug/how-it-works`, linked from the header help
menu, the phone menu and the Help landing, with live collection figures, a six-step flow
diagram, the tenant's retrieval configurations and plain-language sections on where the content
comes from, what happens when a document is added, how a question is answered, how the answer
is checked, what the portal can do, what it deliberately does not do, and one technical note
naming the platform. A documentation twin (`how-this-works`) is ingested so the Help assistant
can answer "how does this work" questions; a unit test keeps the two in step.
Closed: no numbered finding; the owner's request for a reader-facing architecture page.

## PR #14 - 5 September 2026 - D'Souza loop 3 (h1): the figure gate accurate in both directions

For the reader: before a figure sentence is withheld, its figures are looked up in the full text
of every retrieved paper, the papers earlier turns cited and the generated summaries, and the
paper that carries them lends the sentence its citation, so correct figures from an uncited
paper are shown rather than removed (C1, R1, TD1, E2 in the loop 3 report). A question naming a
cohort restricts figure sentences to that cohort's papers, and the passage's population frame is
carried into the sentence. A sentence still failing about a named paper is replaced by that
paper's own results sentence, quoted and cited. Second-hand notes fire only for figures a paper
carries in its Introduction or Discussion; tables and legends are first-hand; denominators skip
CI bounds and relative changes; the effect-size line names what the effect is for. Briefings
run the same figure, outcome and population audit with a badge. The platform's quality scores
are labelled as its self-assessment; a decline sentence carries no marker; a dangling
connective is stripped; prior turns' papers are in the follow-up pool.
Closed: D3-01 (P0), D3-02, D3-03, D3-06, D3-07, D3-08, D3-09, D3-10, D3-12, D3-13, D3-15,
D3-16, D3-20, D3-21; D2-02 and D2-04 residuals.

## PR #13 - 5 September 2026 - D'Souza loop 3 (h2): latency, author names, phone reader, entity page, kinds and closest matches

For the reader: answers stream sentence by sentence as each is released, a refusal costs at most
one extra platform ask chosen for the reason the first failed (refusals 37 s to 9 s, 28 s to
11 s), and the waiting state names the papers retrieval has already found. "Wendyl D'Souza",
"W. J. D'Souza", "DSouza" and "D'Souza WJ" are one author lookup; an unknown name lists results
without generating an answer; declarations, funding and conflict-of-interest paragraphs are never
quoted or offered as evidence. "X's papers" and "papers by X" route to an author-scoped review
that names every on-topic paper. The reader page fits a 390 px phone (a bare DOI URL was the
overflow), remaining sub-24 px targets are padded, the entity page renders its name immediately,
genetics papers get case-series and cohort kinds, and closest matches are ranked by overlap with
the question.
Closed: D3-04, D3-05 (portal side), D3-11, D3-14, D3-17, D3-18, D3-19 (in part), D1-09.

## PR #12 - 4 September 2026 - D'Souza loop 2 (g1): the figure audit as a gate on the text, accurate matcher, audit-led confidence

For the reader: a figure the cited passages do not carry beside its claim (about that outcome,
at that follow-up, for that cohort, drug or study) no longer stays in the prose under a
footnote: the sentence is removed and the answer says so ("One sentence was removed from this
answer: its figures (31%) could not be verified"). An answer the gate empties is withheld with
the figures named. The matcher stops crying wolf on "Thirteen", "11 p.m.", "1.66 h", "937 (52)"
and BREATHS's own 220 and 110 (zero false flags on the 24 regression figures of loop 2). A
cohort, drug or study the question names must be in the cited text before a figure is attributed
to it. Effect sizes are stated with their interval; a modelling or preclinical source leads with
a design line. Confidence is audit-led (the platform score may lower it, never raise it, and
never reaches High alone); the reader sees "Checking N figures against the cited papers" until
the gated text lands; the quality judge starts before `done` with an 8 s cap.
Closed: D2-01, D2-02, D2-03 (gate half), D2-04 (all P0), D2-07, D2-09, D2-11, D2-12, D2-13,
D2-15, D2-17, D1-15, D1-16 residual.

## PR #11 - 4 September 2026 - D'Souza loop 2 (g2): pinned-paper depth, per-entity grounding, closest matches, briefing and synthesis grounding

For the reader: a paper the question names is read in depth (its own retrieval pass, a pass per
question clause, and a document-scoped retry with its Abstract, Results, Methods and Conclusion
as context when the first pass refuses), so "What are the ILAE criteria for LGS and what
proportion met them" lists the five criteria and 48% (n = 60), and the EXPERIENCE subgroup
question answers from the subgroup paper. A comparison naming two drugs retrieves once per drug,
so perampanel's retention comes from PERMIT and brivaracetam's from EXPERIENCE. Briefings ground
each section in Results, Methods, Abstract and Conclusion paragraphs plus the generated key
takeaways; synthesis carries every n and lists unused references. A decline's closest matches
come from the semantic ranking with conference proceedings and attachments dropped. The Search
inline answer never shows a half-streamed marker. Author scope counts articles only.
Closed: D2-05, D2-08, D2-03 (retrieval half), D2-06, D1-10, D2-16, D2-10, D2-14, D2-23, D1-05.

## PR #10 - 4 September 2026 - D'Souza loop 2 (g3): Help voice and export docs, sessions rail, lookup cards, kind rules, tap targets

For the reader: the Help assistant never says "Not enough data" or "the provided context", and
the documentation names every export path (Ask and Investigations to Word; Generate to Word or a
print-ready PDF). The sessions rail lists an answer the moment it completes rather than after the
quality tail. An author lookup card no longer quotes the byline or a declarations paragraph as a
passage. Four study-design kinds are added or corrected (Guideline or checklist, Qualitative
study, historical-controlled and pilot trials as non-randomised, pooled analysis narrowed). Five
sub-24 px controls are padded on the phone.
Closed: D2-18, D2-19, D2-20, D2-21, D2-22, D1-23 residual, D1-26 residual, D1-27 (briefing half,
verified).

## PR #9 - 4 September 2026 - D'Souza loop 1: study-design kinds, library aliases, assessment, briefing references, build stamp, researcher typing, export notices

For the reader: the Kind badge and facet come from a rule-first study-design classifier over the
paper's own title, abstract, keywords and MeSH headings (RCT count 110 to 12; EXPERIENCE and
PERMIT are pooled analyses, SUDEP is case-control, BREATHS is a protocol, UMPIRE a
non-randomised trial). Briefings carry numbered references built from the resource record, with
markers on sections and takeaways. The Library accepts `topics=`, `kinds=` and `formats=`.
Assessment stems no longer say "according to the context", each question links its source, and a
knowledge-area tile scopes retrieval to its topic. Help shows the portal build stamp; `/api/health`
reports it. Authors on the knowledge map are typed as researchers. Ask's route chip sits on one
line, citation markers are 24 px targets, and every export shows a "Saved ..." notice. A new Help
page documents Generate.
Closed: D1-06, D1-10, D1-19, D1-20, D1-21, D1-22, D1-23, D1-25, D1-26, D1-27.

## PR #8 - 4 September 2026 - D'Souza loop 1 (e2): answer audit, evidence cards, attribution, denominators, truncation

For the reader: a generation that stops mid-sentence is cut back to its last complete sentence
with an "Ask again" notice. A question naming an author scopes retrieval to that author's
papers, and "X and colleagues" over a paper X did not write is corrected. Evidence cards quote
the paragraph that carries the cited figure, and the reader opens the PDF on that page with the
passage highlighted. The figure matcher learns a paper's own abbreviations ("perampanel (PER)")
and treats "12 months" as one token. Confidence is decided by the audit when it checked anything,
with the platform's REMi meters shown in the panel as its own scores. Every proportion carries
its n and analysis set, and the audit lists the ones that do not with the passage's n. The
clinical variant names each source's study design. A study the question names that the
collection does not hold gets a boundary sentence. Review and general retrieval budgets rise to
20 and 30 paragraphs; the model's trailing reference lines are stripped; "(inference)" renders
as a mark, never prose.
Closed: D1-04, D1-05, D1-08, D1-12, D1-13, D1-14, D1-15, D1-16, D1-17, D1-24.

## PR #7 - 4 September 2026 - D'Souza loop 1 (e1): data intent reads the papers, results rule, study-name guard, search and ask routing latency

For the reader: a question that asks for a number no longer goes to a supplements-only
configuration that excluded the paper it was about (BREATHS became another trial's design,
UMPIRE a retrospective series, PERMIT "not in the collection"): the `data` intent reads the papers
and their attachments, the classifier may choose it only for questions naming a table,
supplement, data sheet, protocol document, peer review or raw data, and a results question
routes to the papers by rule in 0 ms. A study named in the question is pinned into the grounding
set and leads the sources. Search runs the rule stage itself and never waits on the classifier;
an author or identifier lookup lists without an inline answer; the results budget is 60
paragraphs so one paper cannot fill the page. Ask routes itself (`route: 'auto'`) with the
classifier in parallel with retrieval, and shows the retrieval shortlist before generation. An
answer whose every citation the binding stripped becomes the honest decline.
Closed: D1-01, D1-02 (both P0), D1-03, D1-07, D1-09 (portal side), D1-11, D1-18, and the
loop 1 study-name guard (section 5).

## PR #6 - 4 September 2026 - Ask trust layer: sentence-level citation binding, claim audit, honest refusals

For the reader: every answer goes through one pipeline. Citations are held until the text is
complete and re-bound sentence by sentence against the cited texts, so a marker sits only on a
sentence whose cited paper carries its content words, figures and named entities; markers never
sit on headings, are renumbered by first appearance, and "n cited" is the bound set. Every figure
is checked in the passage its sentence is bound to, beside the claim's own names; years are
checked against resource metadata; a drug called contraindicated must be called that by a cited
passage, and a drug the sources flag is never dropped from a which-drug answer. Reference-list
chunks are cut from cited texts and never shown as evidence. Ranges and decimals are normalised
so "21-45%" states 21% and 45%. Drug-safety prequeries fire only for medications on a
treatment-decision question. A per-answer "N figures checked" badge and inline marks on
unsupported figures appear. A refusal always shows the closest matches labelled "not used" and
names the strongest three; a strong match with a generator refusal is asked once more without the
safety prequeries. "The context" becomes "the cited sources", the platform's template sentences
are removed, and "[inference]" renders as a quiet hedge. `done` goes out before the quality
judge, so the composer is released 10 to 12 s sooner. Document chat gets the document's tables
and key-resources block as context, a document-scoped decline, and a prompt that keeps each
statistic's name. Builds on the earlier `fix/portal-batch-1` branch (the grounding gate before
generation, the supplements-to-general fallback, the addendum carried in `done.text`, one-based
PDF pages, per-client rate-limit keying, synthesis carrying verdicts and notes).
Closed: R1, R2, R3, R4 (app half), R5, R8, R10 (ask handler), R19 (sentinels), R25 (handler):
P1-01, P1-02, P1-03, P1-04, P1-07, P1-08, P1-09, P1-10, P1-16, P1-18, P1-21, P2-02, P2-03,
P2-04, P2-05, P2-18, P3-01, P3-03, P3-07, P3-10, P3-12, P3-13, P3-18, P3-20, P3-21, P4-03,
P4-05, P4-16, P5-01, P5-02, P5-05, P5-07, P5-08, P5-10, P5-13, P6-02, P6-06, P6-09, P6-10,
P6-11, P6-19, P6-21, P6-25, P7-02, P7-03, P7-04, P7-05, P7-06, P7-07, P7-09, P7-18, P7-19,
P7-31, P8-02, P8-04, P8-07, P8-08, P8-09, P8-10, P8-17, P8-20, P8-23, P9-01, P9-02, P9-06,
P9-07, P9-08, P9-14, P9-15, P9-16, P9-17, P9-20, P10-01, P10-03, P10-08, P10-09, P10-10, P10-11,
P10-12, P10-22.

## PR #5 - 4 September 2026 - Library, facets, search snippets, reader, responsive, dark mode and copy (roadmap batch c)

For the reader: the Library opens on the newest published papers with year and journal on every
card, real page thumbnails, "Article" rather than "Report" on text-only ingests, no bulk-import
"Added" date, a Kind facet, OR within a facet and AND across facets, and re-cased all-caps titles.
Search, Library and Taxonomy read one facet aggregation so their counts agree, with a real
"no topic" count. Search snippets prefer a body paragraph over a reference line, masthead or
shredded table; a DOI query returns only the document that carries it; an exact lookup with no
match shows a specific empty state. The reader says "Highlight not found on this page" rather
than landing silently, shows a summary-matched link with a banner, and renders the generated
summary under its own heading. Ask gains a right-hand sources rail on wide screens and a
"Searched for" disclosure on phones; Search facets collapse below the large breakpoint; header
help and account collapse into the phone menu. A viewer dark mode (header sun/moon, persisted per
browser, defaulting to the system preference) maps the light suite onto the dark greys with
AA-checked inks. Investigations, Generate and Assessment placeholders come from the tenant's own
questions and topics; "Watches" is the one word; em dashes in generated summaries render as spaced
hyphens.
Closed: R16, R12 (app parts), R4 (search half), R15 (reader parts), R17, R18, R19 (copy):
P1-16, P1-17, P1-19, P2-11, P2-15, P2-16, P2-19, P3-15, P3-16, P3-18, P3-19, P3-22, P3-23,
P4-13, P4-14, P4-20, P5-14, P5-15, P5-16, P5-19, P6-14, P6-15, P6-21, P6-23, P7-21, P7-22,
P7-23, P7-24, P7-26, P7-28, P7-29, P7-30, P8-11 (heading), P8-17, P8-18, P8-20, P8-21, P9-09,
P9-10, P9-13, P9-18, P10-05, P10-06, P10-15, P10-16, P10-18, P10-20, P10-21, P10-22, P1-07
(part).

## PR #4 - 4 September 2026 - Secondary surfaces: Help ingestion and watches, Assessment, Generate, Investigations, Export, Extraction Lab, Agentic (R20 to R27)

For the reader: the Help section is searchable and its assistant answers (the documentation was
ingested into the box for the first time; a boot-time probe and `/api/health` report when it is
not), with a new "Watch a search" page and a trust page that describes the confidence control Ask
shows. Assessment takes a free-text topic, asks for numeric or comparative stems at intermediate
and advanced depth, and shows each question's source after submit. Briefings carry per-section
sources and withhold an unsourced section. Investigations warn before synthesising over unjudged
or contradicted evidence and say what was excluded. The Word export renders headings, lists,
tables and superscript markers with a numbered reference list, and is disabled while streaming.
Document chat declines in document scope with "Ask the whole corpus". The Extraction Lab
recommends by profile class first, fills yields per method, and points the before/after ask at
the lab box. The Agentic page keeps its redirect to Ask (decision recorded).
Closed: R20 to R27: P3-06, P4-10, P6-07, P6-11, P7-08, P7-31, P8-05, P8-11, P8-12, P9-12, P9-19.

## PR #3 - 4 September 2026 - Routing rules, identifier lookups, rate-limit states, graph determinism and precomputed openers (R7, R9, R14, R10)

For the reader: an exact lookup fires only on a gene symbol or a lexicon term, never on two
arbitrary words; a DOI, PMCID or PMID resolves to exactly one resource or an honest "no resource
carries this identifier"; a surname or "Surname YYYY topic" resolves against the authors field
("Vajda" returns 11 papers where it returned 0); the 26-word review rule is gone; the clinical
rule needs a medication or syndrome; classifier decisions are cached so the same question routes
the same way. A rate-limited ask shows "The portal is busy" with a countdown and a retry, never
the raw error, and the Search summary stands down to results only near the limit; an error-only
session is never saved. The knowledge map returns the same 120 nodes on every call, entity pages
scope relations to the entity, noisy entities (numbers, single letters, person names, journals,
"N-year-old") are dropped, typeahead case-folds and prefix-matches, and readers see neutral empty
states. Resource-page question openers are precomputed by the scheduler and served from the
store.
Closed: R7, R9 (remainder), R14 (app parts), R10 (outside the ask handler): P1-12, P1-14, P2-07,
P2-08, P2-09, P2-10, P2-11, P2-12, P2-13, P2-14, P3-08, P3-18, P3-24, P4-07, P4-19, P5-09,
P5-17, P5-18, P6-13, P6-16, P6-17, P7-12, P7-17, P7-20, P7-25, P7-27, P8-13, P8-15, P8-16,
P8-19, P9-09, P9-10, P9-21, P10-04, P10-14, P10-17, P10-23.

## PR #20 - Locate first: the figure check reads the sentence the figure lives in (loop 5)
Every figure in an answer is located in the cited paper and judged against the sentence or table
row that carries it (a cell with its row label and column headings); the claim passes when that
sentence shares its quantity words, every outcome the quantity names or the question's routing
entity, and must agree on responder threshold and denominator pairing. Glyph, spelling, bracket
and table-row normalisation gaps closed (dot operator, enrolment/enrollment, "(FAS; n = 1111)",
"Follow-up duration, y"). The cohort guard never fires against a paper the question names or
describes and looks a failed sentence up in the cited cohort papers. The denominator correction in
the body is gone: a contradicted pairing fails the figure, and the helper only adds an n from the
located bracket or cell. Two populations under one question are named per sentence; the paper's
own figure for the question's outcome is offered after a removal; a protocol's planned recruitment
is named as such; second-hand judgement reads the located passage (Markdown headings, graphical
abstracts); assessment keys and briefing takeaways never rest on a second-hand figure; an uncited
figure answer on a named paper binds to the pinned paper. Closed: D5-01, D5-02, D5-03, D5-04
(DCC, XB, TFA, TDE), D5-10, D5-11, D5-12, D5-13, D5-14, D5-15; regressions D3-02, D3-07 (mechanism),
D4-09. Left: PD (the abstract's own wording), EB's "overall" label, D4-22 (a follow-up turn, PR #19).

## The four promises, the denominator addendum, the quiz source and the author review (loop 6, k2)
How this works now describes what the build does: a table cell the check cannot read (an analysis
set, "not reported") is marked "not verified" like a failed figure, in one addendum line; the
second-hand, rescue and named-study sentences say what happens in each branch rather than promising
one. The denominator addendum is silent inside a table, for a fitted statistic (F1, AUC, R squared),
and for a share the paper qualifies with a range or an IQR; where the paper gives the count one
clause further on it prints "232 of 583" instead of a complaint. A quiz question is bound to the
paper whose text carries its quote, not to the title the model wrote, and one whose quote no
retrieved paper carries is dropped and counted; the brief asks for two spare questions and the
route trims back to the count the reader chose. An author review lists one item per cited paper
with its year, journal and design, and answers "what sample size did they enrol" per paper from
each paper's own sentence, with a protocol's number named as planned recruitment. Dates the API
writes use the portal's timezone; every route sets its own page title; the search field's input is
a full-height control on a phone. Closes D6-08, D5-13, D6-09, D6-10, D6-13, D6-14, D6-15, D6-16a.
