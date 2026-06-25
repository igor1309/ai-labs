---
date: 2026-06-25
model: sonnet
description: "Product research report on Upheal, an AI-native EHR for mental health therapists covering clinical notes, scheduling, billing, and practice management"
---

# Upheal — Product Research Report

## 1. Product Overview

Upheal is an AI-native Electronic Health Record (EHR) built for mental health therapists and clinicians. Its primary function is to automate clinical documentation, scheduling, billing, and administrative practice management so practitioners can reduce non-clinical overhead.

**Who uses it:** Individual therapy providers (solo practitioners), group practices, and virtual care organizations. Upheal reports 70,000 providers across 23 countries as of June 2026. [verified — press release, June 18 2026]

**Workflow it supports:** The full private-practice workflow — session capture, note generation, treatment planning, scheduling, client intake and portal, secure messaging, payments, and superbill generation. Insurance claims submission is announced for Summer 2026 and not yet live. [verified — upheal.io homepage, accessed 2026-06-25]

**Professional context:** The product targets licensed therapists, counselors, psychologists, and psychiatrists. It accommodates both practitioners who want an all-in-one EHR and those who use Upheal only for AI notes and export to a separate EHR.

---

## 2. Core Capabilities

### Clinical Documentation

| Capability | Detail | Source |
|---|---|---|
| AI note generation | Produces draft notes in under 60 seconds after session capture | upheal.io/ai-clinical-notes |
| Note templates | 10+ formats: SOAP, DAP, BIRP, GIRP, EMDR, PIRP, SIRP, PIE, Intake, MSE, Psychiatric Intake, Psychiatric Med Management, Medical SOAP; custom templates from 170 clinically approved sections | support article 7992539 |
| Note Personalization | AI learns practitioner writing style from edits; adapts progressively over time | feedback.upheal.io/changelog |
| Smart Edit | Restructures note content on demand | upheal.io/ai-clinical-notes |
| Compliance Checker | Audits notes against Aetna and Optum payer standards; flags missing elements; available on paid plan | upheal.io/features/compliance-checker |
| Treatment Plans (Golden Thread) | AI-generated plans tied to progress notes for continuity across sessions | upheal.io homepage |
| Treatment Summaries | Pre-session brief pulling diagnoses, modalities, goals, last-session highlights, and assigned homework | feedback.upheal.io/changelog |
| Multilingual support | English, Spanish, Portuguese, German, French, Italian, Mandarin, Hindi | upheal.io/ai-clinical-notes |
| Therapeutic modalities | 70 supported approaches including CBT, psychodynamic, EMDR, Brainspotting, couples/family systems frameworks | search result corroboration |

### Session Capture

| Method | Detail |
|---|---|
| Audio capture (in-person) | Desktop app (macOS) records in-person sessions |
| Virtual session capture | Browser extension captures any web-based or desktop video call |
| Zoom integration | Dedicated Upheal app for Zoom |
| File upload | Upload pre-recorded audio/video file |
| Text/dictation | Text input pathway |

### Practice Management

- Scheduling: Appointment booking, automated reminders (15/30-minute intervals), custom event titles, "Other" event type for consultations/intakes, preferred week-start day and week number display
- Client portal: Self-serve booking, secure messaging with file attachments (up to 20MB), invoice payment, statement and superbill access; available on web, iOS, and Android
- Client intake: Digital forms; providers can complete forms on behalf of clients during sessions via full-screen interface
- Practice branding: Logo, practice name, and brand colors on documents and client-facing materials (Premium plan); branding carries into iOS/Android client portal apps
- Secure messaging: HIPAA-compliant; supports file attachments (images displayed inline; PDFs/documents previewed)
- Analytics: Session talking ratio and sentiment tracking [verified — ai-clinical-notes page]

### Billing

- Client payment processing: 2.9% + $0.30 per transaction
- Invoice and superbill generation
- Enhanced billing tracker: external payment logging (cash, check, digital transfer), partial payments, multi-invoice allocation, credit application, client statements
- Insurance billing (claims submission, ERA processing, eligibility checks): announced for Summer 2026, not yet live [verified — upheal.io homepage]

### Upheal Assistant (Agentic AI)

Launched June 2026 as an agentic layer across the full platform. Executes tasks directly — updates schedules, drafts and sends forms, surfaces client history before appointments, answers clinical questions, navigates billing. Includes a memory feature (May 2026) that learns practice style, modality preferences, and workflow patterns. An interactive demo at `upheal.io/assistant-demo` runs on a simulated practice with realistic client records. [verified — press release June 18 2026; changelog entries May 29 and June 17 2026]

### Export and Migration

- Notes: Copy to clipboard or export from session cards; Smart Fill (browser extension) copies notes to any EHR in one click
- Client data: Bulk import via CSV/XLSX (up to 500 clients) with automated field matching and provider assignment; supports migration from any EHR [verified — changelog May 26 2026]

---

## 3. Workflow Map

### User Roles

| Role | Access |
|---|---|
| Individual provider | Full platform access |
| Group practice provider | Provider-level access within organization |
| Group practice admin | [inferred — support center lists "Upheal for Teams" and group plans; specific admin permissions not publicly detailed] |
| Client | Client portal (scheduling, messaging, payments, forms) |

### Typical Provider Workflow

1. **Intake** — Client completes digital intake forms via portal; provider reviews; client added to practice
2. **Scheduling** — Client self-books or provider schedules; automated reminders sent to client
3. **Session** — Provider captures session via audio (in-person), browser extension (virtual), Zoom app, or file upload
4. **Documentation** — AI generates draft progress note in selected template; provider reviews, edits (AI learns from edits), and signs
5. **Treatment Plan** — AI generates or updates treatment plan linked to note (Golden Thread); compliance check optionally run against payer standards
6. **Billing** — Invoice generated; client pays via portal or external payment logged; superbill available
7. **Messaging** — Secure messages and file attachments sent to client via portal

### Handoffs

- Provider → Client: Scheduling invites, intake forms, session summaries, invoices, messages — all via Client Portal
- Provider → External EHR: Smart Fill browser extension copies notes one-click; or manual copy/export
- Provider → Payer: Compliance Checker prepares notes; insurance billing direct submission (Summer 2026)

### Entry Points

- Web app (browser)
- macOS desktop app
- iOS app
- Android app
- Apple Watch (session access mentioned; details minimal) [single source — trytwofold.com review; not confirmed from official docs]
- Chrome browser extension

---

## 4. Technical / Workflow Notes

### API Surface

Upheal publishes a developer API at `developers.upheal.io` with two integration tracks:

**Processing API** (standalone insight generation):
- Session upload and creation from recordings or transcripts
- Session retrieval and deletion
- Compliance checking (file upload, job submission, status retrieval)
- Smart Edit (job submission and result retrieval)

**Application API** (for organizations with active Upheal App users):
- User management: create, update, delete providers and clients
- Session management: full CRUD, speaker mapping, transcript access
- Note template management

Authentication: OTP and provider authentication methods documented. Webhook specifics not confirmed from official API docs (one third-party integration service, Keragon, references webhook-style event triggers, but this is not directly confirmed in Upheal's own public API docs). [gap — see Section 7]

### Platforms

| Platform | Status |
|---|---|
| Web app | Available |
| macOS desktop | Available |
| iOS | Available |
| Android | Available |
| Chrome extension | Available (Smart Fill, session capture) |
| Apple Watch | Mentioned in one third-party review; not confirmed in official docs |

### Data and Security

| Control | Detail |
|---|---|
| HIPAA | Compliant (Security Rule and Privacy Rule); BAA auto-executes on paid accounts |
| SOC 2 | Certified; continuously audited by independent auditors |
| GDPR | Compliant (also UK GDPR and UK Data Protection Act) |
| PHIPA / PIPEDA | Third-party assessment passed (Canadian regulations) |
| Encryption | Record-level encryption of PII and PHI |
| Pseudonymization | PHI stored with pseudonym/random identifier, not in original identifiable form |
| Penetration testing | Regular external pen testing following OWASP standards; results in Trust Center |
| Staff access to PHI | Only for technical investigations; access logged and monitored |

---

## 5. Integrations and Platform Signals

### Native / Documented Integrations

| Integration | Type | Notes |
|---|---|---|
| Zoom | Session capture | Dedicated Upheal app for Zoom |
| Google Calendar | Calendar sync | Bidirectional sync |
| Acuity Scheduling | Scheduling | Listed in support docs |
| Calendly | Scheduling | Listed in support docs |
| Jane App | EHR / scheduling | Listed in support docs; import tools handle migration |
| Owl Practice | Practice management | Listed in support docs |
| Google (SSO) | Account authentication | Workspace compliance options |

### Browser Extension (Smart Fill)

Chrome extension enables one-click note copy into any web-accessible EHR. This is Upheal's primary EHR interoperability mechanism for practitioners who store notes elsewhere. [verified — support article 6816086]

### Third-Party Automation

Keragon (healthcare automation platform) lists Upheal as a supported integration and references connection to 300+ tools; also lists specific Healthie-to-Upheal integration. [verified — keragon.com/integrations/upheal, accessed 2026-06-25] Note: Keragon is a third party, not Upheal; native API confirmation required for each workflow.

### Client Import

CSV/XLSX bulk import (up to 500 clients per upload) with automated field matching for migration from any EHR. [verified — changelog May 26 2026]

### Announced but Not Yet Live

- Insurance billing (claims submission, ERA processing, eligibility checks): Summer 2026 [verified — upheal.io homepage]

---

## 6. Recent Product Changes: Last 6–12 Months

The public changelog (`feedback.upheal.io/changelog`) shows entries from May 2026 onward. Older 2025 entries are not exposed on the fetched page. The following are all changelog-verified entries in the accessible window, plus named 2025 features confirmed from other sources.

### Changelog-Verified (May–June 2026)

| Date | Update |
|---|---|
| June 17, 2026 | Interactive agentic AI demo launched at upheal.io/assistant-demo |
| June 15, 2026 | Calendar: custom event titles, "Other" event type, week start day preference, week numbers |
| June 11, 2026 | Client portal: clients can pay invoices directly (web + mobile); card save; statements |
| June 9, 2026 | Messaging: file attachments up to 20MB; inline image display; PDF/document previews |
| June 9, 2026 | Practice branding now in iOS and Android client portal apps |
| June 1, 2026 | Practice branding (logo, name, brand colors) on documents and portals (Premium) |
| May 29, 2026 | Upheal Assistant memory: AI learns and remembers practice style, modalities, preferences |
| May 27, 2026 | Enhanced billing tracker: external payments, partial payments, multi-invoice allocation, credit, statements |
| May 26, 2026 | Bulk client import: CSV/XLSX, up to 500 clients, field auto-matching, provider assignment |
| May 22, 2026 | 15/30-minute reminders; improved diagnosis search; clipboard note copy; CPT codes at session creation |
| May 21, 2026 | Provider can complete client forms on behalf of client during session (full-screen interface) |

### Named 2025 Features (Sourced from Search Results and Marketing Pages; No Dated Changelog Entry Available)

| Feature | Description | Source |
|---|---|---|
| Treatment Summaries | Pre-session brief (diagnoses, modalities, goals, last session, homework); paid plans only | search result / upheal.io |
| Note Personalization | AI adapts to clinical writing style over time via edit history | feedback.upheal.io (feature description) |
| Compliance Checker | Audits notes against Aetna and Optum payer standards | upheal.io/features/compliance-checker |
| 70 therapeutic modalities | Expanded from prior set; covers EMDR, Brainspotting, family systems, etc. | search result corroboration |
| Upheal Assistant (beta → production) | Agentic AI layer; press release June 2026 suggests it exited beta around this period | press release June 18 2026 |

---

## 7. Stale or Missing Evidence

| Gap | Detail |
|---|---|
| Changelog pre-May 2026 | The public changelog page (`feedback.upheal.io/changelog`) rendered no entries before May 21 2026 on fetch. 2025 product changes cannot be individually dated from public changelog. |
| Webhook specifics | Upheal's own API docs do not explicitly enumerate webhook event types or payloads. A third-party (Keragon) references webhook-style triggers, but this is not confirmed from Upheal's developer docs. |
| Group / team admin controls | The support center lists an "Upheal for Teams" section, but specific admin permissions, role hierarchy, and access-control detail are not publicly detailed. |
| Apple Watch app | Referenced in one third-party review but not documented in Upheal's official product or support pages. |
| Insurance billing (Summer 2026) | Announced feature; not yet live at time of research (June 25 2026). No specs or UI detail available. |
| 2025 changelog dates | Features like Treatment Summaries and Note Personalization are attributed to 2025 in search results and a Mentalyc review, but no exact release dates are available from Upheal's own dated changelog. |
| Specific API rate limits, error codes, data models | API docs reference an error codes page but content was not fully retrieved; rate limits and full data schemas not publicly confirmed. |
| Cevi.ai integration | Listed in search results as an Upheal integration but page not fetched; nature of integration unconfirmed. |

---

## 8. Source Appendix

| # | Title | URL | Accessed |
|---|---|---|---|
| 1 | Upheal homepage | https://www.upheal.io/ | 2026-06-25 |
| 2 | Upheal Changelog | https://feedback.upheal.io/changelog | 2026-06-25 |
| 3 | Upheal Support Center — Home | https://www.upheal.io/support/en | 2026-06-25 |
| 4 | Using Upheal with your EHR and other favorite tools | https://www.upheal.io/support/en/articles/6816086-using-upheal-with-your-ehr-and-other-favorite-tools | 2026-06-25 |
| 5 | Using Upheal with other apps (collection) | https://www.upheal.io/support/en/collections/4586561-using-upheal-with-other-apps | 2026-06-25 |
| 6 | What note templates does Upheal offer? | https://www.upheal.io/support/en/articles/7992539-what-note-templates-does-upheal-offer | 2026-06-25 |
| 7 | AI Clinical Notes — Upheal | https://www.upheal.io/ai-clinical-notes | 2026-06-25 |
| 8 | Compliance Checker feature page | https://www.upheal.io/features/compliance-checker | 2026-06-25 |
| 9 | Privacy and Compliance — Upheal | https://www.upheal.io/privacy-and-compliance | 2026-06-25 |
| 10 | Upheal Developer API Docs | https://developers.upheal.io/ | 2026-06-25 |
| 11 | Press Release: Upheal Agentic AI Interactive EHR Experience | https://natlawreview.com/press-releases/upheals-new-agentic-ai-interactive-ehr-experience-lets-therapists-try-future | 2026-06-25 |
| 12 | Upheal OS / Practice Management page | https://www.upheal.io/uphealos | 2026-06-25 |
| 13 | Keragon — Upheal Integrations | https://www.keragon.com/integrations/upheal | 2026-06-25 (search result; page not fetched directly) |
| 14 | Mentalyc review of Upheal (2026) | https://www.mentalyc.com/blog/upheal-reviews | 2026-06-25 (search result; page not fetched directly) |
