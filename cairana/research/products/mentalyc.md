---
date: 2026-06-25
model: sonnet
description: "Product research report on Mentalyc by Mentalyc Inc. — AI clinical documentation platform for mental health professionals"
---

# Mentalyc Product Research

## 1. Product Overview

Mentalyc is an AI clinical documentation platform built exclusively for mental health professionals: therapists, counselors, psychiatrists, social workers, psychologists, and behavioral health staff. It converts therapy session content — captured by recording, audio upload, dictation, or typed summary — into structured clinical outputs: progress notes, treatment plans, progress tracking dashboards, and therapeutic alliance analytics.

The product is designed to work alongside (not replace) existing EHR or practice management systems. It does not claim to be an EHR itself.

**Users in practice:** solo clinicians in private practice; group practices and agencies; supervisors overseeing interns; behavioral health staff at CMHCs.

**Verified source:** Mentalyc homepage (https://www.mentalyc.com/), accessed 2026-06-25.

---

## 2. Core Capabilities

### AI Note Generation

| Capability | Detail |
|---|---|
| Input modes | Live recording (in-person or telehealth), uploaded audio file, dictation, typed session summary |
| Supported note formats | SOAP, DAP, BIRP, GIRP, PIRP, PIE, SIRP, MSE, intake notes, group notes, couples notes, child notes, supervision notes, 100+ custom templates |
| Supported modalities | CBT, DBT, EMDR, ABA, play therapy, substance use, couples therapy, family therapy, psychiatric evaluation |
| Auto-computed CPT codes | Yes — listed as a feature for group practice plans |

**Verified source:** Mentalyc homepage and group practice page (https://www.mentalyc.com/group-practice), accessed 2026-06-25.

### AI Treatment Planning

Mentalyc auto-drafts treatment plans with SMART goals extracted from session discussions. Goals are linked across sessions and connected to progress notes for continuity. Medical necessity, risk assessments, and safety planning are structured into notes automatically per the group practice page.

**Verified source:** Mentalyc homepage (https://www.mentalyc.com/), accessed 2026-06-25; group practice page (https://www.mentalyc.com/group-practice), accessed 2026-06-25.

### AI Progress Tracker

A session-level outcome tracking module that:

- Extracts symptom trends, goal attainment signals, and alliance shifts from session content without requiring standardized questionnaires (no PHQ-9, GAD-7, or similar forms)
- Produces longitudinal progress charts and symptom trend visualizations
- Integrates treatment plan goals as optional tracking anchors
- Is intended as continuous session-by-session tracking rather than point-in-time measurement

**Verified source:** Mentalyc AI Progress Tracker page (https://www.mentalyc.com/ai-progress-tracker), accessed 2026-06-25.

### Alliance Genie™

Launched September 3, 2025. A therapeutic alliance feedback module that:

- Analyzes session audio transcripts across 5 clinical dimensions and 27+ sub-areas (Therapeutic Framework, Session Management, Therapeutic Relationship, Therapeutic Process, Collaborative Process — grounded in Bordin's working alliance model)
- Produces dimension scores, flagged session moments with timestamps, identified strengths, missed opportunities, and next-session recommendations
- Tracks alliance trends over time per client
- Does not require client surveys or questionnaires
- Supervisors can review shared Alliance Genie sessions if both parties use Mentalyc

**Verified source:** Mentalyc Alliance Genie product page (https://www.mentalyc.com/alliance-genie), accessed 2026-06-25; getting-started help article (https://www.mentalyc.com/help-articles/getting-started-with-mentalyc-alliance-genie), accessed 2026-06-25; press release via WSAV (https://www.wsav.com/business/press-releases/ein-presswire/845626718/mentalyc-unveils-alliance-genie-first-ai-tool-to-measure-and-strengthen-therapeutic-alliance/), accessed 2026-06-25 — [note: direct fetch returned HTTP 403; date confirmed via search result snippet and corroborating press release URLs].

### Adaptive Clinical Voice

The platform is described as learning and adapting to individual clinicians' documentation styles over time.

**Verified source:** trytwofold.com Mentalyc review (https://www.trytwofold.com/compare/mentalyc-review), accessed 2026-06-25. [Single source — not corroborated from official Mentalyc docs directly, though consistent with homepage marketing language.]

---

## 3. Workflow Map

### User Roles

| Role | Access |
|---|---|
| Individual clinician | Note creation, progress tracker, Alliance Genie (Pro/Super plans) |
| Supervisor | Review team notes, view unsaved notes, co-sign documentation, run Alliance Genie on shared sessions |
| Admin (Group Practice) | Seat management, template customization, unified caseload dashboard |
| Intern | Note creation under supervisor review |

**Verified source:** Mentalyc group practice page (https://www.mentalyc.com/group-practice), accessed 2026-06-25; Alliance Genie getting-started article (https://www.mentalyc.com/help-articles/getting-started-with-mentalyc-alliance-genie), accessed 2026-06-25.

### Standard Session Workflow

1. **Capture** — Clinician opens Mentalyc during or after session; records live, uploads audio, dictates, or types a session summary.
2. **Process** — Mentalyc transcribes audio into an anonymized transcript (names and identifying details removed). Audio is retained up to 3 days for error correction, then automatically deleted. Transcript is analyzed for clinical themes, treatment interventions, and diagnostic indicators.
3. **Generate** — Structured progress note produced in the clinician's chosen format; treatment plan updates and CPT codes auto-populated.
4. **Review and edit** — Clinician reviews AI output, edits as needed, saves.
5. **Export/transfer** — Clinician uses Chrome extension to insert note sections into their EHR chart with one click, or copies output manually.

**Verified source:** Mentalyc FAQ page (https://www.mentalyc.com/faqs), accessed 2026-06-25; EHR integration page (https://www.mentalyc.com/ehr-integration), accessed 2026-06-25.

### Group Practice Additions

- Supervisor dashboard shows all active clinicians, their caseloads, and documentation status across the team.
- Supervisors can view unsaved notes.
- Practice-wide template customization and sharing.
- Multi-site support.

**Verified source:** Mentalyc group practice page (https://www.mentalyc.com/group-practice), accessed 2026-06-25.

### Alliance Genie Workflow (within session)

1. Note is saved in Mentalyc.
2. Clinician opens Session Analytics in the left sidebar.
3. Alliance Genie analyzes the session (available only for recorded or uploaded sessions, not dictation or typed summaries).
4. Feedback report with scores, quotes, timestamps, and recommendations is generated.
5. Clinician rates individual insights (thumbs up/down).
6. All analytics auto-save to the client record.

**Verified source:** Alliance Genie getting-started article (https://www.mentalyc.com/help-articles/getting-started-with-mentalyc-alliance-genie), accessed 2026-06-25.

---

## 4. Technical/Workflow Notes

### Data Handling

- Session audio: retained up to 3 days for retry/error correction, then automatically deleted.
- Transcripts: anonymized by default (names and identifying details removed); optional partial anonymization retains limited details such as first names.
- Session data is explicitly not used to train AI models.
- No human scribes are involved.

### Platform Support

- Desktop browsers (primary).
- Mobile browsers (works; no native iOS/Android app confirmed from sources).
- iPad (browser-based).
- Chrome extension for EHR autofill (required for one-click EHR insertion).

**Verified source:** Mentalyc FAQ page (https://www.mentalyc.com/faqs), accessed 2026-06-25.

### Security and Compliance

| Standard | Status |
|---|---|
| HIPAA | Compliant; signed BAA available |
| SOC 2 Type II | Certified |
| Canadian (PIPEDA, PHIPA, PIPA, PHIA) | Compliant |
| Australian Privacy Principles | Compliant |
| Data residency | US-based |
| Encryption | End-to-end (in transit and at rest) |

**Verified source:** Mentalyc FAQ page (https://www.mentalyc.com/faqs), accessed 2026-06-25; group practice page (https://www.mentalyc.com/group-practice), accessed 2026-06-25.

### Known Limitations (from third-party review)

- Voice recognition may struggle with specialized psychotherapy vocabulary, accents, or complex therapeutic conversations.
- Occasional transcription inaccuracies with highly nuanced psychological terms.
- EHR integration is browser-extension-based rather than deep native API; practices using unsupported or non-web-based EHRs may require manual transfer.

**Verified source:** trytwofold.com Mentalyc review (https://www.trytwofold.com/compare/mentalyc-review), accessed 2026-06-25. [Third-party source; treat as user/reviewer perspective, not official Mentalyc documentation.]

---

## 5. Integrations and Platform Signals

### EHR Integration Method

Mentalyc uses a **Chrome extension autofill approach** rather than native API integration. No EHR API credentials or setup are required.

How it works:
1. Install Mentalyc Chrome extension.
2. Generate notes in Mentalyc.
3. Open client chart in the target EHR in Chrome.
4. Click "Insert into EHR" — the extension places note sections into the correct EHR fields.

### Named EHR Partners

| EHR / Practice Management System | Integration Type |
|---|---|
| SimplePractice | Chrome extension autofill |
| TherapyNotes | Chrome extension autofill |
| Jane App | Chrome extension autofill |
| TheraNest | Chrome extension autofill |
| ICANotes | Chrome extension autofill |
| Valant | Chrome extension autofill |
| TheraBill | Chrome extension autofill |
| Osmind | Chrome extension autofill |
| Tebra | Chrome extension autofill |
| Kareo | Chrome extension autofill |
| Any web-based EHR | Chrome extension autofill (general support claimed) |

**Verified source:** Mentalyc EHR integration page (https://www.mentalyc.com/ehr-integration), accessed 2026-06-25; FAQ page (https://www.mentalyc.com/faqs), accessed 2026-06-25.

### Public API

No public API is documented on the Mentalyc website. No API docs, webhooks, or developer documentation were found in this research pass.

**Status:** Evidence missing — no public API or developer documentation found.

### Telehealth Platform Compatibility

Mentalyc does not appear to integrate directly with telehealth platforms (e.g., Zoom, Doxy.me). Session audio captured via telehealth is uploaded into Mentalyc post-session or recorded separately.

**Status:** [Inference from product documentation describing upload-based workflow; not explicitly confirmed or denied on official pages.]

---

## 6. Recent Product Changes: Last 6–12 Months

### Alliance Genie™ — September 3, 2025

The most significant announced product launch in the research window. A new module added to existing plans (Pro, Super, Team) that provides AI-generated therapeutic alliance feedback from session recordings without client surveys. Described as the "first AI tool to measure and strengthen therapeutic alliance" in the press release.

**Verified source:** Press release via WSAV (date confirmed September 3, 2025 from search snippet, direct fetch blocked HTTP 403); Alliance Genie product page (https://www.mentalyc.com/alliance-genie), accessed 2026-06-25; Alliance Genie getting-started help article (https://www.mentalyc.com/help-articles/getting-started-with-mentalyc-alliance-genie), accessed 2026-06-25.

### Blog Content Surge — June 2026

A large cluster of blog posts published June 4–17, 2026 on clinical topics: symptom tracking, treatment planning, progress tracking, SMART goals, and outcome measurement. These are primarily educational/SEO articles, not product release notes. No product changelog page was located.

**Verified source:** Mentalyc blog index (https://www.mentalyc.com/blog/), accessed 2026-06-25.

### No Changelog Page Found

Mentalyc does not appear to maintain a public-facing product changelog or release notes page.

**Status:** Evidence missing.

---

## 7. Stale or Missing Evidence

| Item | Status | Notes |
|---|---|---|
| Public API / webhooks | Missing | No API docs or developer portal found on mentalyc.com |
| Public changelog / release notes | Missing | No dedicated changelog page found; blog is educational content only |
| Native mobile app (iOS/Android) | Missing | FAQ references mobile browser support; no native app confirmed |
| Exact Alliance Genie press release body | Stale/blocked | wsav.com returned HTTP 403; date and description confirmed from search snippet and corroborating press release URLs on other local news stations |
| Specific feature launch dates beyond Alliance Genie | Missing | AI Progress Tracker and AI Treatment Plan launch dates not found in public sources |
| Telehealth platform integrations (Zoom, Doxy.me, etc.) | Missing | No official integration listed; workflow implies manual audio export |
| Adaptive voice learning — technical mechanism | Missing | Claimed in third-party review; not technically described in official docs |
| Data retention duration for saved notes (not audio) | Missing | FAQ specifies audio retention (3 days); note/transcript retention policy not stated |

---

## 8. Source Appendix

| # | Source | URL | Date Accessed |
|---|---|---|---|
| 1 | Mentalyc Homepage | https://www.mentalyc.com/ | 2026-06-25 |
| 2 | Mentalyc Group Practice Page | https://www.mentalyc.com/group-practice | 2026-06-25 |
| 3 | Mentalyc AI Progress Tracker Page | https://www.mentalyc.com/ai-progress-tracker | 2026-06-25 |
| 4 | Mentalyc Alliance Genie Product Page | https://www.mentalyc.com/alliance-genie | 2026-06-25 |
| 5 | Mentalyc Alliance Genie Getting-Started Help Article | https://www.mentalyc.com/help-articles/getting-started-with-mentalyc-alliance-genie | 2026-06-25 |
| 6 | Mentalyc EHR Integration Page | https://www.mentalyc.com/ehr-integration | 2026-06-25 |
| 7 | Mentalyc FAQ Page | https://www.mentalyc.com/faqs | 2026-06-25 |
| 8 | Mentalyc Blog Index | https://www.mentalyc.com/blog/ | 2026-06-25 |
| 9 | Alliance Genie Press Release (WSAV) | https://www.wsav.com/business/press-releases/ein-presswire/845626718/mentalyc-unveils-alliance-genie-first-ai-tool-to-measure-and-strengthen-therapeutic-alliance/ | 2026-06-25 (HTTP 403; date/summary from search snippet) |
| 10 | Mentalyc Review — trytwofold.com | https://www.trytwofold.com/compare/mentalyc-review | 2026-06-25 |
| 11 | Mentalyc Review — DeepCura Resources | https://www.deepcura.com/resources/mentalyc-review | 2026-06-25 (search snippet only; not fetched) |
| 12 | Mentalyc Capterra Profile | https://www.capterra.com/p/265098/Mentalyc/ | 2026-06-25 (search snippet only; not fetched) |
