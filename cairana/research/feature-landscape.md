---
date: 2026-06-25
model: claude-opus-4-8
description: "Neutral cross-product feature landscape synthesized from the six cairana product-research reports"
---

# Cross-Product Feature Landscape

Neutral aggregation of the six first-tier product-research reports in
`cairana/research/products/` (`upheal`, `mentalyc`, `blueprint`, `eleos`,
`jotpsych`, `oasys`). Feature facts are drawn only from those reports; nothing
here is newly researched. Sections 4 and 5 are **interpretation** and labeled as
such. "Absent" means *not described in that product's report*, not proof the
product lacks it.

## 1. Feature taxonomy

Derived from what the reports actually describe.

- **A. Session capture** — ambient/in-person audio; telehealth capture; file
  upload; dictation; typed summary.
- **B. Note generation** — AI draft notes; template breadth; custom templates;
  writing-style learning; natural-language edit; multilingual output.
- **C. Treatment planning & continuity** — treatment plans; golden-thread
  linkage to notes; pre-session summaries.
- **D. Measurement & outcomes** — standardized assessments (PHQ-9/GAD-7…);
  session-content-derived progress; outcome dashboards; therapeutic-alliance
  measurement.
- **E. Compliance & coding** — note compliance scanning; payer-aware notes;
  CPT/ICD coding.
- **F. Billing & RCM** — claims submission; eligibility checks; superbills;
  patient payments; RPM billing.
- **G. Client/patient engagement** — client portal; secure messaging;
  scheduling/self-booking; intake forms; between-session monitoring; wearables.
- **H. Telehealth** — built-in video.
- **I. Prescribing & labs** — e-prescribing; lab ordering.
- **J. Practice operations** — full EHR scope; supervisor/QA workflows; admin
  RBAC; practice analytics; agentic admin assistant.
- **K. Integrations & interop** — note push via browser extension; native EHR
  integration; data import/migration; public developer API; wearable APIs.
- **L. Platforms** — web; native iOS; native Android; desktop app; browser
  extension; offline mode.
- **M. Security posture** — HIPAA/BAA; SOC 2; HITRUST/ISO; multi-jurisdiction.

## 2. Coverage matrix

Legend: ✓ present · ◐ partial / limited · — not in report · ? ambiguous.
Cells respect each report's verified-vs-inferred marking.

| Feature | Upheal | Mentalyc | Blueprint | Eleos | JotPsych | Oasys |
|---|---|---|---|---|---|---|
| **A. Session capture** |
| Ambient / in-person audio | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Telehealth capture | ✓ | ◐ | ✓ | ✓ | ✓ | ✓ |
| File upload | ✓ | ✓ | ✓ | — | — | — |
| Dictation | ✓ | ✓ | ◐ | — | — | — |
| Typed summary | ✓ | ✓ | — | ✓ | — | — |
| **B. Note generation** |
| AI draft notes | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Broad template library | ✓ | ✓ | ✓ | ✓ | ✓ | ◐ |
| Custom templates | ✓ | ✓ | ◐ | — | ✓ | ✓ |
| Writing-style learning | ✓ | ✓ | ✓ | — | ✓ | — |
| Natural-language edit | ✓ | — | ✓ | — | ✓ | — |
| Multilingual output | ✓ | — | — | ✓ | ✓ | ◐ |
| **C. Treatment planning & continuity** |
| Treatment plans | ✓ | ✓ | ✓ | — | — | ✓ |
| Golden-thread linkage | ✓ | ✓ | ◐ | ✓ | — | — |
| Pre-session summaries | ✓ | — | ✓ | — | — | — |
| **D. Measurement & outcomes** |
| Standardized assessments | — | — | ✓ | — | ✓ | ✓ |
| Session-derived progress | ◐ | ✓ | — | ✓ | — | — |
| Outcome dashboards | — | ✓ | ✓ | ✓ | ◐ | ✓ |
| Alliance measurement | — | ✓ | — | — | — | — |
| **E. Compliance & coding** |
| Note compliance scanning | ✓ | — | — | ✓ | ✓ | — |
| Payer-aware notes | ✓ | — | ◐ | — | ✓ | — |
| CPT/ICD coding | ✓ | ◐ | ✓ | ◐ | ✓ | — |
| **F. Billing & RCM** |
| Claims submission | ◐ | — | ✓ | ✓ | ✓ | ✓ |
| Eligibility checks | ◐ | — | ✓ | ✓ | ✓ | ◐ |
| Superbills / invoices | ✓ | — | ✓ | — | ✓ | ✓ |
| Patient payments | ✓ | — | ✓ | — | ✓ | ✓ |
| RPM billing | — | — | — | — | — | ✓ |
| **G. Client/patient engagement** |
| Client portal | ✓ | — | ✓ | — | ◐ | ✓ |
| Secure messaging | ✓ | — | — | — | — | ✓ |
| Scheduling / self-booking | ✓ | — | ✓ | — | ✓ | ✓ |
| Intake forms | ✓ | — | ✓ | — | ✓ | ✓ |
| Between-session monitoring | — | — | ◐ | — | ◐ | ✓ |
| Wearables / physiological | — | — | — | — | — | ✓ |
| **H. Telehealth (built-in video)** | ◐ | — | ✓ | — | ✓ | ✓ |
| **I. Prescribing & labs** |
| E-prescribing | — | — | — | — | ✓ | — |
| Lab ordering | — | — | — | — | ✓ | — |
| **J. Practice operations** |
| Full EHR scope | ✓ | — | ✓ | — | ◐ | ✓ |
| Supervisor / QA workflows | — | ✓ | ◐ | ✓ | ◐ | ◐ |
| Admin RBAC | ◐ | ✓ | ✓ | ✓ | ◐ | ✓ |
| Practice analytics | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Agentic admin assistant | ✓ | — | ◐ | — | — | — |
| **K. Integrations & interop** |
| Note push via extension | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Native EHR integration | ◐ | — | ◐ | — | — | — |
| Data import / migration | ✓ | — | ✓ | — | — | ✓ |
| Public developer API | ✓ | — | ◐ | — | — | — |
| Wearable APIs | — | — | — | — | — | ✓ |
| **L. Platforms** |
| Web app | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Native iOS | ✓ | — | ✓ | ◐ | — | ✓ |
| Native Android | ✓ | — | — | — | — | — |
| Desktop app | ✓ | — | — | — | — | — |
| Browser extension | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Offline mode | — | — | — | ✓ | — | — |
| **M. Security posture** |
| HIPAA + BAA | ✓ | ✓ | ✓ | ✓ | ✓ | ◐ |
| SOC 2 Type II | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| HITRUST / ISO suite | — | — | — | ✓ | ◐ | — |
| Multi-jurisdiction | ✓ | ✓ | ◐ | ✓ | ✓ | — |

## 3. Unique features (present in exactly one product)

Listed only — no why-analysis here.

### Upheal (`upheal.md`)
- Agentic admin Assistant that executes tasks (scheduling, forms, billing
  navigation) with persistent practice memory. `flag: explore later`
- Public developer API with two tracks (Processing API, Application API).
  `flag: explore later`
- In-session analytics: talking ratio and sentiment.

### Mentalyc (`mentalyc.md`)
- Alliance Genie — therapeutic-alliance measurement scored from session audio
  across 5 dimensions, no client surveys. `flag: explore later`

### Blueprint (`blueprint.md`)
- Blueprint Diagnostic Screener (25-question, 15 domains) that auto-assigns
  follow-up outcome measures per positive domain. `flag: explore later`
- Large clinical intervention/worksheet library (e.g. 124 couples-therapy items).

### Eleos (`eleos.md`)
- Groups Audio — per-speaker individual + group summaries for group therapy.
  `flag: explore later`
- 100% continuous note compliance scanning (note cloning, golden thread, etc.).
- OBBBA AI Scanner — real-time Medicaid eligibility-change detection mid-session.
- Offline mobile documentation with auto-sync.
- 150+ language support; ISO 42001 / HITRUST-grade security stack.

### JotPsych (`jotpsych.md`)
- E-prescribing (JotRx, EPCS controlled substances via DoseSpot/Surescripts).
  `flag: explore later`
- Integrated lab ordering and results tracking.
- Custom document generator (referral letters, prior-auth, disability forms).

### Oasys (`oasys.md`)
- Wearable / physiological integration (Apple Watch, Oura, Strava, Flo, Apple
  Health) feeding clinician dashboards. `flag: explore later`
- RPM billing from wearable-collected data.
- Patient-reported daily mood / sleep / activity between-session monitoring.

## 4. Table-stakes vs differentiators *(interpretation)*

**Table-stakes** — present in ~all six, no longer distinguishing:

- AI note generation from session audio.
- Multiple structured note formats (SOAP/DAP/BIRP/…).
- Clinician-in-the-loop review/edit before the note lands.
- Audio retention/deletion policy after transcription.
- HIPAA compliance with a BAA; SOC 2 (five of six).
- Some path to get the note into an external EHR (extension or copy).

**Differentiators** — held by one or two, where the products actually diverge:

- *Outcomes philosophy*: assessment-driven MBC (Blueprint) vs
  session-content-derived progress with no questionnaires (Mentalyc) — opposite
  approaches to the same job.
- *Compliance depth*: Eleos (100% continuous scanning) and JotPsych (JotAudit,
  150+ payer rules) treat compliance as a first-class module; others have light
  or no scanning.
- *Clinical-relationship intelligence*: only Mentalyc (alliance) and Eleos
  (Clinical Insights / EBP) go beyond documentation into session quality.
- *Modality reach*: e-prescribing + labs (JotPsych) and wearables/RPM (Oasys)
  push past the therapy-note core into psychiatric and data-driven care.
- *Platform ambition*: Upheal (agentic assistant + public API) is the most
  "platform/OS" shaped; Oasys aims at the same OS framing but is far earlier.

## 5. Whitespace & gaps *(interpretation)*

Capabilities thin or absent across the whole set, and shared evidence gaps:

- **Programmatic interoperability is nearly empty.** A public developer API is
  documented only for Upheal; **webhooks appear in no report**; **FHIR/HL7
  interop appears in none** (Oasys explicitly has none). EHR connection is mostly
  one-way copy/extension, not native bi-directional write-back.
- **Android and desktop are rare.** Only Upheal reports native Android and a
  desktop app; most are web + iOS only.
- **Patient-facing engagement is uneven.** Pure-documentation tools (Mentalyc,
  Eleos) have no client portal/scheduling; only Oasys does sustained
  between-session monitoring.
- **Public changelogs are scarce.** Most products have no versioned release
  notes (Blueprint's monthly wrap-ups stop after Oct 2025; Upheal's changelog
  only renders from May 2026), limiting independent recency tracking.
- **Admin/RBAC depth is under-documented** in every report — repeatedly flagged
  as missing evidence rather than confirmed absent.

## 6. Evidence-quality notes

- **Self-reported adoption** across all six (provider/org counts) — not
  independently verified in the reports.
- **Convergent missing evidence**: public API, webhook support, granular
  admin/RBAC, and changelogs are flagged missing in nearly every report.
- **Thinnest evidence base: Oasys** — seed-stage, sourced largely from marketing
  pages, press releases, and App Store history; security posture beyond a HIPAA
  claim is unconfirmed (no SOC 2 found).
- **Strongest documented security: Eleos** (HITRUST, ISO 27001/27799/42001,
  Drummond pDSI).
- **Cross-vendor sourcing to watch**: the Blueprint report draws several facts
  (audio deletion, some integrations) from a Mentalyc-published competitor
  review; several JotPsych EHR-integration names come only from a third-party
  review, not official docs. `flag: explore later` — confirm from primary sources.
- No direct factual contradictions found between reports; differences are scope,
  not conflict.

## 7. Source map

| Row / item | Traces to |
|---|---|
| All coverage-matrix rows | the six per-product reports in `cairana/research/products/` |
| Agentic Assistant, public API, sentiment analytics | `upheal.md` |
| Alliance Genie, session-derived progress | `mentalyc.md` |
| Diagnostic Screener, intervention library, free EHR | `blueprint.md` |
| Groups Audio, 100% compliance scan, OBBBA scanner, offline | `eleos.md` |
| JotRx e-prescribing, lab ordering, document generator | `jotpsych.md` |
| Wearables/physiological, RPM billing, mood tracking | `oasys.md` |
