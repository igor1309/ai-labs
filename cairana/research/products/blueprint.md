---
date: 2026-06-25
model: sonnet
description: "Product research report on Blueprint (blueprint.ai), the AI-assisted EHR and measurement-based care platform for mental health professionals"
---

# Blueprint Product Research Report

## 1. Product Overview

Blueprint (blueprint.ai) is a cloud-based platform combining a free Electronic Health Record (EHR) with an integrated AI Assistant purpose-built for mental health professionals. The product addresses the full clinical workflow cycle — before, during, and after therapy sessions — with a focus on reducing administrative burden through AI-generated documentation and supporting measurement-based care (MBC) through automated outcome tracking.

**Who uses it:** Over 70,000 mental health clinicians (as of mid-2025), including solo therapists, group practices, and large behavioral health organizations. [Verified — blueprint.ai homepage, accessed 2026-06-25]

**Core jobs performed:**
- Session transcription and automatic progress note drafting
- Treatment plan generation and updates
- Assignment and tracking of standardized clinical assessments (PHQ-9, GAD-7, and others)
- Scheduling, telehealth, billing, insurance claims
- Pre-session client summaries and preparation materials

The EHR component is permanently free; the AI Assistant is charged per-session on a usage-based model. [Verified — blueprint.ai homepage, accessed 2026-06-25]

---

## 2. Core Capabilities

### AI Assistant

| Capability | Description |
|---|---|
| Session transcription | Live or uploaded audio transcribed; progress note generated automatically |
| Note formats supported | SOAP, DAP, BIRP, GIRP, EMDR, intake, discharge, admin, psychotherapy notes |
| Treatment plan drafting | AI drafts and updates plans; clinician reviews and approves |
| Pre-session summaries | Summary of prior session + focus-area reminders surfaced before each appointment |
| Post-session automation | One-click note finalization; billing claim submission; assignment suggestions |
| Magic Edit | AI editing layer that follows plain-language instructions; recognizes client first names; learns individual therapist writing style from edits [Verified — October 2025 wrap-up, accessed 2026-06-25] |
| Scheduling assistant | Handles rescheduling, cancellations, and appointment confirmations |
| Billing and insurance | Coverage queries, CPT coding guidance, prior authorization support, ERA tracking |
| Clinical chat | Between-session conversational interface for administrative and clinical queries |

### Measurement-Based Care (MBC)

- **Blueprint Diagnostic Screener (BPDS):** 25-question instrument screening 15 diagnostic domains; automatically assigns follow-up outcome measures for domains that screen positive. Released July 13, 2020. [Verified — blueprint.ai blog, accessed 2026-06-25]
- **Assessment library:** Broad range of standardized instruments; as of October 2025, 12 new assessments added spanning couples therapy, grief, dissociation, disordered eating, pain management, substance use, psychological flexibility, body image, and coping skills. [Verified — October 2025 monthly wrap-up, accessed 2026-06-25]
- **Progress dashboards:** Clinicians track outcome measure scores over time, identify high-risk cases, and surface trends at the practice or population level.

### Clinical Resource Library

- As of October 2025: 124 new interventions and worksheets added across three couples therapy modalities — Imago Relationship Therapy (23 interventions, 11 worksheets), Gottman Method (28 interventions, 15 worksheets), and Emotionally Focused Therapy (39 interventions, 8 worksheets). [Verified — October 2025 monthly wrap-up, accessed 2026-06-25]
- AI-powered post-session suggestions for appropriate assessments and worksheets to assign clients between sessions.

### EHR

- Scheduling and calendar with self-scheduling for clients; syncs with personal calendars
- HIPAA/PHIPA-compliant telehealth (video with waiting room)
- Client records: demographics, diagnoses, documents
- Forms: intake forms, questionnaires, consent documents with digital signing
- Billing: autopay, balance tracking, credit card processing, superbill generation
- Insurance: eligibility verification, electronic claim submission, ERA tracking
- Notes: sign and lock capability

### Mobile App

- iOS app (Blueprint for Therapists) available on the App Store, launched late 2024. [Verified — App Store listing cited in search results, accessed 2026-06-25]
- Supports in-person and telehealth session capture, dictation, and note generation; notes sync immediately across devices.

---

## 3. Workflow Map

### User Roles

| Role | Access |
|---|---|
| Individual therapist | Full EHR + AI Assistant; personal caseload |
| Group practice clinician | Same as above; shared organization context |
| Administrator / supervisor | Population-level trend dashboards; role-based permissions; SSO + directory sync |
| Client | Completes assessments and forms via client-facing portal |

### Typical Session Workflow

```
Before session
  └─ Clinician reviews AI-generated client summary + focus reminders
  └─ Client receives and completes assigned assessments (PHQ-9, GAD-7, BPDS, etc.)

During session
  └─ Audio captured (recording or live transcription via app or web)
  └─ Clinician accesses key details, assessment results, worksheets in-app

After session
  └─ AI generates progress note draft (SOAP / DAP / BIRP / etc.)
  └─ Clinician reviews; uses Magic Edit for adjustments
  └─ One-click finalization; billing claim submitted
  └─ AI suggests follow-up assessments / worksheets for client

Between sessions
  └─ Client completes homework and assessments
  └─ Clinician chats with Assistant for admin tasks (rescheduling, insurance queries)
  └─ Outcome scores update dashboards
```

### Entry Points

- Web platform (browser)
- iOS mobile app
- Chrome extension (for users overlaying Blueprint on existing EHRs)
- API / embedded widget (for organizations)

### Outputs

- Signed and locked progress notes
- Treatment plans
- Superbills, insurance claims
- Outcome measure scores and trend charts
- Referral letters, record request responses, termination letters

### Handoffs

- Notes transfer to external EHRs manually (copy-paste) or via direct EHR integration where available [Verified — mentalyc.com review, accessed 2026-06-25]
- Client assessments flow in from client portal; results visible in clinician dashboard

---

## 4. Technical/Workflow Notes

### Compliance and Security

- HIPAA and PHIPA compliant [Verified — blueprint.ai, accessed 2026-06-25]
- SOC 2 Type II certified [Verified — blueprint.ai/platform/assistant, accessed 2026-06-25]
- BAA (Business Associate Agreement) provided
- Audio recordings deleted after transcription [Verified — mentalyc.com review, accessed 2026-06-25]
- Notes can be signed and locked

### Platforms

- Web (browser-based)
- iOS mobile app

### Data Import

- Supports data migration from: SimplePractice, TherapyNotes, TherapyPortal, Theranest, Sessions Health [Verified — blueprint.ai EHR page + main site, accessed 2026-06-25]
- Automatic organization of imported client records

### Admin Controls (Organizations)

- Role-based permissions
- SSO and directory sync
- Custom documentation templates at organizational level
- Population-level outcome dashboards benchmarked against national data (7M+ assessments dataset) [Verified — blueprint.ai/organizations, accessed 2026-06-25]
- Tailored onboarding and group training

### Known Workflow Limitation

Third-party review (mentalyc.com, 2026) noted that for users who maintain a separate EHR, notes require manual transfer rather than native write-back, and progress tracking is dependent on client-completed questionnaires rather than session content. [Verified — mentalyc.com review, accessed 2026-06-25]

---

## 5. Integrations and Platform Signals

| Integration | Type | Status / Notes |
|---|---|---|
| SimplePractice | Bi-directional EHR integration | Active; "Suggested Clients" list in SimplePractice; one-click session start. Data import also supported. [Verified — blueprint.ai feedback page, accessed 2026-06-25] |
| AdvancedMD | EHR integration | Active since July 2022; patient enrollment, chart access within AdvancedMD, outcomes data [Verified — blueprint.ai blog, accessed 2026-06-25] |
| TherapyNotes | Data import only | Import supported; no native API integration documented |
| Theranest / Sessions Health | Data import | Import supported |
| Universal EHR | API / embedded widget | API and Chrome extension for EHRs lacking direct integration |
| Calendar sync | Personal calendar | Syncs scheduling with personal calendars |
| Insurance | ERA / claims | Electronic Remittance Advice tracking; eligibility verification |
| Telehealth | Built-in | HIPAA-compliant video built into scheduling |

No public API documentation page was found during this research session. API access appears available for organizational/enterprise deployments but details are not publicly documented. [Evidence missing — no public API docs URL found]

---

## 6. Recent Product Changes: Last 6–12 Months

### October 2025 (Monthly Wrap-Up, verified)

- **Personalized note style learning:** AI now learns from therapist edits to adapt to individual tone and structure; reduces repetitive editing. [Verified — blueprint.ai/blog/monthly-wrap-up-october-2025, accessed 2026-06-25]
- **Magic Edit improvements:** More consistent instruction-following; recognizes client first names; faster refinements. [Verified — same source]
- **Smarter next session dates:** SOAP and Intake notes now parse time-based phrases ("see you next week") and auto-populate correct dates. [Verified — same source]
- **124 new interventions and worksheets** for Imago Relationship Therapy, Gottman Method, and Emotionally Focused Therapy. [Verified — same source]
- **12 new assessments** covering couples therapy, grief, dissociation, disordered eating, pain management, substance use, psychological flexibility, body image, and coping skills. [Verified — same source]

### Late 2024 / Early 2025

- **Blueprint 2.0 launched:** Announced October 7, 2024. Introduced AI Assistant capabilities spanning entire client care cycle (before/during/after session), pre-session summaries, post-session worksheet suggestions, clinical assessment library. [Verified — blueprint.ai/blog/blueprint-2-0, accessed 2026-06-25]
- **iOS mobile app launched:** Blueprint for Therapists app released on the App Store (late 2024, exact date not specified in sources). [Verified — App Store listing referenced in search results, accessed 2026-06-25]
- **Blueprint Core launched:** Full EHR at no cost (scheduling, telehealth, billing, insurance claims, client forms, documentation) with no session limit. [Verified — search result snippet referencing 2025 launch, accessed 2026-06-25; exact announcement date not found]

### Coming Soon (announced, not yet released as of research date)

- **Practice Insights and Growth:** Conversational interface to query revenue, utilization rates, no-shows, and payer mix. [Verified — blueprint.ai/platform/assistant, accessed 2026-06-25]
- **Insurance outreach via AI Assistant:** Reach out to insurance plans directly through Assistant chat. [Inference — referenced as "coming soon" in product page text]

### Earlier Context (for staleness reference)

- Blueprint Sessions (Guided MBC): Announced December 2022; beta rollout to select partners. Integrated pre-, during-, and post-session data for documentation snippets and session planning. [Verified — blueprint.ai blog, accessed 2026-06-25] — this page is now over 3 years old.
- AdvancedMD integration: Announced July 2022. [Stale — 4 years old; current status unconfirmed beyond still being listed]
- Blueprint Diagnostic Screener: Released July 2020. [Stale — 6 years old; feature appears still active based on main site references]

---

## 7. Stale or Missing Evidence

| Topic | Status |
|---|---|
| Monthly product wrap-ups beyond October 2025 | Only October 2025 wrap-up confirmed; no November 2025 – June 2026 wrap-ups found. Gap in recent changelog coverage. |
| Public API documentation | No public API docs URL found. API access referenced in enterprise context but not documented publicly. |
| TherapyNotes direct integration | Search results indicate TherapyNotes has no public API; Blueprint only lists data import. Current integration status unconfirmed. |
| AdvancedMD integration current status | Announced July 2022; no update since. Assumed still active but stale evidence. |
| Blueprint Sessions (Guided MBC) feature | Announced December 2022; no follow-up coverage on general availability or deprecation found. |
| Android / web-app parity | iOS app documented; no Android app found. Web platform assumed to cover Android users but not confirmed. |
| Exact Blueprint Core launch date | Referenced in search results as a 2025 launch; no announcement blog post URL confirmed. |
| Webhook support | Not mentioned in any source. Evidence missing. |
| Specific note export formats | Not documented in fetched sources. Evidence missing. |
| AI model / infrastructure | Not disclosed publicly. Evidence missing. |

---

## 8. Source Appendix

| # | Title | URL | Date Published / Updated | Date Accessed |
|---|---|---|---|---|
| 1 | Blueprint: AI-Assisted EHR for Therapists (homepage) | https://www.blueprint.ai/ | Not dated | 2026-06-25 |
| 2 | AI Assistant for therapists | https://www.blueprint.ai/platform/assistant | Not dated | 2026-06-25 |
| 3 | EHR for therapists | https://www.blueprint.ai/platform/ehr | Not dated | 2026-06-25 |
| 4 | The AI Assistant for Behavioral Health Organizations | https://www.blueprint.ai/organizations | Not dated | 2026-06-25 |
| 5 | Blueprint Monthly Wrap Up — October 2025 | https://www.blueprint.ai/blog/monthly-wrap-up-october-2025 | October 2025 | 2026-06-25 |
| 6 | Introducing Blueprint 2.0 | https://www.blueprint.ai/blog/blueprint-2-0 | October 7, 2024 | 2026-06-25 |
| 7 | New release: The Blueprint Diagnostic Screener | https://www.blueprint.ai/blog/introducing-blueprint-diagnostic-screener | July 13, 2020 | 2026-06-25 |
| 8 | Introducing Blueprint Sessions | https://www.blueprint.ai/blog/introducing-blueprint-sessions-a-new-way-to-implement-guided-measurement-based-care-gmbc | December 14, 2022 | 2026-06-25 |
| 9 | Blueprint x AdvancedMD Partnership | https://www.blueprint.ai/blog/blueprint-advancedmd-partnership | July 2022 | 2026-06-25 |
| 10 | AI for Therapists: Beyond Notes to Enhanced Care | https://www.blueprint.ai/blog/beyond-documentation-the-next-wave-of-ai-for-therapists | Not dated | 2026-06-25 |
| 11 | Blueprint Review for Therapists (2026) — Mentalyc | https://www.mentalyc.com/blog/blueprint-reviews | 2026 (no specific date) | 2026-06-25 |
| 12 | Blueprint for Therapists App — App Store | https://apps.apple.com/us/app/blueprint-for-therapists/id6737857521 | Not dated | 2026-06-25 (search result reference) |
| 13 | Integrate Blueprint with SimplePractice EHR (feedback page) | https://feedback.blueprint.ai/ai-notetaker/p/integrate-blueprint-with-simplepractice-ehr | Not dated | 2026-06-25 (search result reference) |
