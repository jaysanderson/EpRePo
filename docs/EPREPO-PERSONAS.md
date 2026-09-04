# EpRePo personas - the users the epilepsy portal is tested as

Derived on 4 Sept 2026 from what the `research-portal-eprepo` knowledge box actually holds
(981 resources: 655 open-access papers 2005-2026 from Australian epilepsy groups, their
supplementary data sheets and protocols, and 53 patient and model-organism videos). Dominant
themes by keyword and MeSH: genetic developmental and epileptic encephalopathies (SCN1A, SYNGAP1,
STXBP1, SLC12A5, GluA2, HNRNPU), post-traumatic epilepsy and common data elements, seizure
cycles and forecasting, MRI and EEG, SUDEP, autoimmune encephalitis, rodent models and
epileptogenesis, ketogenic diet, fenfluramine and lacosamide trials, valproate pregnancy
registers, cognition and quality of life, neuroinflammation and tau. Journals: Epilepsia,
Epilepsia Open, Brain, Ann Neurol, Neurology, Nat Commun, BMJ Open, medRxiv preprints.

The corpus is not the whole literature. A clean, honest "the corpus does not cover this" is scored
as coverage, not a defect; a confident answer built on nothing is the worst outcome.

Each persona is run by an autonomous review agent (Fable) against the live local portal. Every
persona covers Ask, Search and Library, plus the secondary surfaces listed, in light and dark
mode, wide and 390 px.

| # | Persona | Comes to the portal to | Secondary surfaces |
|---|---|---|---|
| 1 | **Paediatric epileptologist** (Dr Mei, tertiary children's hospital) | Choose and dose treatment for genetic DEEs (Dravet, SCN1A, SYNGAP1, STXBP1), check contraindications, watch the seizure-semiology videos | Resource detail + document chat, PDF reader, videos |
| 2 | **Clinical geneticist and genetic counsellor** (Dr Okafor) | Interpret a variant, phenotype-genotype correlation, recurrence risk, what a gene's spectrum looks like across the corpus | Entity pages, Knowledge graph, typeahead |
| 3 | **Epilepsy neurosurgeon** (Prof Lindqvist) | Surgical candidacy, intracranial EEG, outcomes after resection, neurostimulation, imaging for lesion detection | Investigations (build an evidence file), PDF highlight |
| 4 | **Neuroimaging scientist** (Dr Rahimi, MRI physicist turned clinical researcher) | Quantitative MRI/EEG-fMRI methods, biomarkers, tau PET and neurodegeneration links, methods sections and figures | Supplementary data intent, Extraction Lab (tools), tables |
| 5 | **Neurotrauma professor** (Prof Delgado, post-traumatic epilepsy) | Post-traumatic epilepsy incidence, biomarkers, common data elements, preclinical harmonisation, prophylaxis evidence | Latest-evidence intent, Compare configurations, Sessions |
| 6 | **Computational neuroscientist** (Dr Chen, seizure forecasting and ML) | Seizure cycles, forecasting performance, wearables, datasets and code availability, reproducibility | Supplementary data intent, data sheets, Generate |
| 7 | **Basic neuroscience professor** (Prof Novak, rodent epileptogenesis) | Animal models, neuroinflammation, ketogenic mechanisms, methods and dosing in preclinical work, species and strain detail | Topic browse (Animal models), Taxonomy, Help |
| 8 | **Neuroimmunologist** (Dr Haddad, autoimmune encephalitis) | Anti-NMDAR and other autoimmune epilepsies, rituximab and immunotherapy evidence, relapse rates, seizure outcomes | Assessment (build a quiz), Watches |
| 9 | **Clinical trialist and pharmacologist** (Prof Ivers, ASM safety) | RCT evidence (lacosamide, fenfluramine, cenobamate), valproate and pregnancy registers, dose-response, systematic reviews | Review intent, Agentic page, export |
| 10 | **Neuropsychologist and epidemiologist** (Dr Baptiste, cognition, QoL, SUDEP) | Cognitive and mood outcomes, quality of life, SUDEP risk and mortality, driving and employment questions the corpus may not cover | Library facets and sort, Graph, mobile 390 px sweep |

Feedback from each run is consolidated into `docs/EPREPO-ROADMAP.md`.
