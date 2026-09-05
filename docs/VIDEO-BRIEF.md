# Video brief: the EpRePo Research Portal

**For:** the video producer
**From:** Jay Sanderson, product owner
**Date:** 5 September 2026
**Deliverables:** one hero film (2 to 3 minutes, 16:9) and one social cut (45 to 60 seconds, 9:16), both captioned, plus a thumbnail frame for each.

## 1. What the product is, in one paragraph

The EpRePo Research Portal is a web application that turns a collection of research papers into
answers a specialist can trust. A clinician, a scientist or a trial designer asks a question in
plain language; the portal finds the passages in the collection that answer it, writes an
answer only from those passages, cites every sentence, and then checks the answer against the
cited text before showing it. Every number in an answer is one click from the sentence in the
paper it came from. Around that core sit the tools a researcher actually uses in a week: search
and a library, a reader with document chat, an evidence file for a case conference, briefings,
quizzes for registrars, a knowledge map, saved watches and exports.

The demonstration collection is epilepsy research: about a thousand open-access papers,
supplements and videos from Australian epilepsy groups. The film should treat that as the
example, not the product. The same portal runs on any collection.

## 2. Who the film is for

Two audiences, one film:

- **The technical buyer** (a chief information officer, a head of research computing) who has
  seen generative answers hallucinate and wants to know why this one is different.
- **The specialist user** (a neurologist, a clinician-scientist) who will only use it if it saves
  time and never embarrasses them in front of a patient or a grant panel.

The film must be credible to both. No hype, no "AI magic", no vendor logos in the interface.
The tone is a serious product from a serious team, shown working.

## 3. The three messages, in priority order

1. **Every number is traceable, and the portal checks before you see it.** Ask a question, get
   an answer with citations, click a citation and land on the highlighted sentence in the paper.
   The answer carries a "figures checked" badge, and when a sentence cannot be verified it is
   removed and the portal says so. This is the hero message and the hero shot.
2. **It says what it does not know.** Ask about something the collection does not hold and the
   portal declines cleanly and names the closest papers it does have. Honesty is a feature.
3. **A portal you explore, not a search box.** Library, reader, document chat, investigations,
   briefings, assessment, knowledge map, watches, export. Show breadth quickly after the hero.

Optional fourth beat for the technical buyer: **under the hood**, the "How this works" page.
Retrieval, generation, citations and enrichment come from a knowledge platform (Progress
Agentic RAG); the portal adds routing, the verification layer and the reading tools. One
sentence, one screen, no logos.

## 4. Storyboard for the hero film (about 2 minutes 40 seconds)

| # | Beat | On screen | Voice-over (indicative) | Length |
|---|---|---|---|---|
| 1 | Cold open | A question typed into Ask on the phone, then cut to the desktop. "Which anti-seizure medications are contraindicated in SCN1A Dravet syndrome?" | "Ask a question of the research the way you would ask a colleague." | 10 s |
| 2 | The answer arrives | Route chip appears ("Clinical decision"), sources rail fills, the answer streams sentence by sentence with citation markers. | "The portal picks the retrieval configuration that fits the question, pulls the passages that answer it, and writes only from those passages." | 20 s |
| 3 | The hero click | Click a citation marker. The PDF opens at the page with the sentence highlighted. Hold on the highlight. | "Every sentence is cited. Click one and you land on the sentence in the paper." | 15 s |
| 4 | The check | Back on the answer: the "N figures checked" badge, the confidence label, then an answer where a sentence has been removed with the note "1 sentence removed: the figure was not found in the cited text". | "Before you see an answer, the portal checks every figure, cohort and named study against the cited text. What it cannot verify, it removes, and it tells you." | 20 s |
| 5 | Honest decline | Ask "What is the incidence of epilepsy in Aboriginal and Torres Strait Islander Australians?" The portal declines and lists closest matches. | "And when the collection does not hold the answer, it says so, and shows you the nearest papers it does have." | 15 s |
| 6 | The paper | Library (newest published, study-design facet), open a paper, document chat: "How many patients were in the psychiatric subgroup?" The figure appears with its page. | "Browse the collection, open a paper, and ask it questions directly." | 20 s |
| 7 | A week's work | Fast montage: an investigation with evidence saved and a synthesis, an MDT briefing with references, a registrar quiz with per-question sources, the knowledge map, a watch, export to Word. | "Build an evidence file for a case conference. Draft a briefing. Set a quiz for your registrars. Watch a topic. Export what you need." | 30 s |
| 8 | Under the hood | The "How this works" page: the six-step flow, then the under-the-hood line. | "It runs on a knowledge platform that indexes, retrieves, cites and enriches. The portal adds the routing, the checks and the tools." | 15 s |
| 9 | Close | Dark mode on the phone, then the lockup. | "The EpRePo Research Portal. Answers you can take into the room." | 10 s |

The social cut is beats 1, 3, 4 and 9.

## 5. Questions that demonstrate well

These have been verified against the collection and behave reliably. Use them verbatim.

- "Which anti-seizure medications are contraindicated in SCN1A Dravet syndrome?" (clinical route, names lamotrigine, cites the international consensus)
- "What fenfluramine dose is recommended in Dravet syndrome, with and without stiripentol?" (exact doses with the cardiac monitoring schedule)
- "What is the primary outcome, sample size and control arm in the BREATHS trial protocol for functional seizures?" (220 participants, Befriending control, cited to the protocol)
- "What 12-month retention was reported for perampanel in the PERMIT pooled analysis?" (64.2% with the denominator)
- "Does lamotrigine increase the risk of SUDEP compared with other antiseizure medications?" (adjusted hazard ratio with confidence interval, cited to the case-control study)
- Search: "D'Souza" (author lookup listing his papers instantly), "PMC8517288" or a DOI (identifier lookup)
- Decline: "What is the incidence of epilepsy in Aboriginal and Torres Strait Islander Australians?"
- Document chat on the EXPERIENCE brivaracetam paper: "How many patients were in the psychiatric comorbidity subgroup and what was their 12-month retention?"

Avoid on camera: multi-drug comparison tables built across turns, and questions that name a
cohort the collection only mentions second-hand. They are being hardened and can still
misfire.

## 6. Look and feel

- Record the real product, no mock-ups. Desktop at 1440 px wide and phone at 390 px, both in
  light and in dark mode (the toggle is in the header). Show the phone for beats 1 and 9.
- The interface uses one typeface and one accent colour (violet) from the tenant palette; do not
  recolour or add overlays that fight it. Captions and titles in the film may use the same
  violet as the accent.
- Brand assets: the mark and the horizontal lockup are in `apps/web/public/brand/`
  (`eprepo-mark.svg`, `eprepo-logo.svg`). Use the lockup on the close.
- Motion: slow, deliberate cursor; let the streaming answer and the highlight land. No jump
  cuts inside the hero click.
- Music: understated, no build-to-drop. Voice-over: calm, Australian English, first person
  plural avoided ("the portal", not "we").

## 7. What not to show

- The admin and management areas, the Tools and Extraction Lab pages, the routing log.
- Any real patient information (there is none in the collection; do not invent any).
- Vendor names or logos inside the interface. The platform is named once, in beat 8, in the
  voice-over and on the "How this works" page only.
- Loading spinners longer than a second: first words typically arrive in 6 to 9 seconds; hold on
  the sources rail filling and cut to the streamed answer.

## 8. Practicalities

- Live site: https://eprepo-portal.fly.dev/t/eprepo (no login for the reader surfaces).
  Ask a question no more than once every few seconds; the site limits asks to twenty a minute.
- Every answer, session and watch you create is yours alone in that browser; nothing needs
  resetting between takes. Use a fresh browser profile for a clean sessions rail.
- The "How this works" page: https://eprepo-portal.fly.dev/t/eprepo/how-it-works
- Point of contact for a walkthrough, screen recordings at both sizes, or a stable build for the
  shoot day: Jay.

## 9. Approvals

Rough cut to Jay for one round of notes; final with captions and thumbnails. Please flag any
answer on screen that you could not reproduce twice, so it can be checked before it is used.
