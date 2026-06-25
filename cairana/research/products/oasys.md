---
date: 2026-06-25
model: sonnet
description: "Product research report on Oasys by Oasys Health, Inc. — AI-native operating system for behavioral health"
---

# Oasys by Oasys Health, Inc.

## 1. Product Overview

Oasys is described as "the first AI-native operating system for behavioral health." It combines practice management, AI-assisted clinical documentation, billing, and physiological data integration into a single platform.

**Who uses it:** Individual therapists, group practices, hospital-based behavioral health centers, Managed Service Organizations (MSOs), and university campus mental health programs. [VERIFIED — alleywatch.com, accessed 2026-06-25]

**What professional workflow it supports:** End-to-end clinical and administrative workflow for outpatient behavioral health — from scheduling and documentation through billing, outcome tracking, and between-session patient monitoring.

**Concrete jobs it performs:**

- Converts therapy sessions into structured clinical notes via AI scribe
- Manages scheduling, billing, and insurance reimbursements
- Aggregates patient physiological data from wearables and health apps
- Provides practice-level performance dashboards for owners/administrators
- Surfaces early risk signals from combined clinical and wearable data

Sources: [oasys.health](https://oasys.health/) (accessed 2026-06-25); [PR Newswire announcement](https://www.prnewswire.com/news-releases/oasys-raises-4-6m-to-transform-mental-health-care-into-a-data-driven-discipline-catalyzing-better-health-outcomes-302654778.html) (accessed 2026-06-25)

---

## 2. Core Capabilities

### Documentation & Scribing

| Feature | Detail |
|---|---|
| AI scribe | Converts sessions into clinical notes; supports SOAP, DAP, and custom note formats |
| Multi-language transcription | Stated capability; no further technical detail publicly documented |
| Time saving claim | "2 hours saved per day on documentation" per official website |

Source: [oasys.health](https://oasys.health/) (accessed 2026-06-25)

### Practice Management

| Feature | Detail |
|---|---|
| Smart scheduling | Appointment booking for telehealth and in-person visits |
| Revenue Cycle Management (RCM) | Fully-managed, percentage-based billing option |
| Patient portal | Intake forms, assessments, document signing, invoices, superbills |
| Document management | Storage and signing of clinical documents |
| Role-based access controls | Supervisor assignment, provider-level permissions |

Source: [oasys.health](https://oasys.health/) (accessed 2026-06-25); [App Store listing](https://apps.apple.com/us/app/oasys-health/id6737940488) (accessed 2026-06-25)

### Clinical Monitoring

| Feature | Detail |
|---|---|
| Quality measures | PHQ-9, GAD-7 integrated |
| Daily mood tracking | Patient-reported via mobile app |
| Sleep pattern monitoring | Via connected wearables |
| Physical activity tracking | Via wearables and health apps |
| Medication adherence monitoring | Stated; no implementation detail publicly documented |
| Wearable connectivity | Apple Watch, Oura Ring, Strava, Flo |
| Apple Health sync | Patient app syncs with Apple Health |

Source: [oasys.health](https://oasys.health/) (accessed 2026-06-25); [App Store listing](https://apps.apple.com/us/app/oasys-health/id6737940488) (accessed 2026-06-25)

### Communication

| Feature | Detail |
|---|---|
| Video conferencing | Built-in telehealth sessions |
| Secure messaging | Clinician-patient secure messaging (added in app v2.8.0, June 2026) |
| Push notifications | Added in app v2.8.0 |

Source: [App Store listing](https://apps.apple.com/us/app/oasys-health/id6737940488) (accessed 2026-06-25)

### Revenue Expansion

- Remote Patient Monitoring (RPM) billing code support: clinicians can bill RPM CPT codes using wearable data collected through the platform. [VERIFIED — alleywatch.com, PR Newswire, accessed 2026-06-25]

---

## 3. Workflow Map

### User Roles

| Role | Function in Platform |
|---|---|
| Patient | Books sessions, logs mood, syncs health data, signs documents, pays invoices |
| Clinician / Therapist | Reviews notes, monitors patient data, conducts sessions (telehealth or in-person), accesses treatment plans |
| Supervisor | Reviews provider performance; assigned by practice owner |
| Practice Owner / Administrator | Manages all providers, dashboards, billing operations, and site-level analytics |

Source: [oasys.health](https://oasys.health/) (accessed 2026-06-25); [App Store listing](https://apps.apple.com/us/app/oasys-health/id6737940488) (accessed 2026-06-25)

### Typical Workflow (Verified Steps)

1. **Onboarding:** Clinic onboards in 48 hours with "white-glove data migration." [VERIFIED — PR Newswire, accessed 2026-06-25]
2. **Scheduling:** Patient or clinician schedules telehealth or in-person session via platform.
3. **Pre-session:** Patient completes intake forms, assessments (PHQ-9/GAD-7), and document signing via patient portal/app.
4. **Session:** Clinician conducts session; AI scribe captures and converts audio/content into structured clinical note (SOAP, DAP, or custom).
5. **Post-session documentation:** Note generated and available for clinician review and sign-off.
6. **Between sessions:** Patient logs daily mood, journals, syncs wearable data. Clinician receives continuous monitoring data.
7. **Billing:** RCM layer submits claims and manages insurance reimbursements; RPM billing codes can be filed using wearable data.
8. **Oversight:** Practice owner reviews provider performance, outcome metrics, and site-level operations via dashboard.

### Outputs

- Signed clinical notes in standard formats
- Insurance claims and superbills
- Patient outcome trend data (PHQ-9, GAD-7 scores over time)
- Practice performance dashboards

### Handoffs

- Patient data (wearable/mood) flows to clinician dashboard between sessions
- Clinical notes flow to billing layer
- Supervisor oversight layer receives provider-level data from practice owner assignment

---

## 4. Technical / Workflow Notes

| Topic | Detail |
|---|---|
| Compliance | HIPAA compliant; audit trails maintained |
| Data migration | White-glove migration, claimed under 24 hours |
| Onboarding speed | Full clinic onboarding in 48 hours |
| Mobile app | iOS app available (App Store ID: 6737940488); patient-facing and clinician-facing functionality |
| Authentication | Sign in with Google or email |
| Custom integrations | Available at Enterprise tier (no technical detail publicly documented) |

Sources: [oasys.health](https://oasys.health/) (accessed 2026-06-25); [App Store listing](https://apps.apple.com/us/app/oasys-health/id6737940488) (accessed 2026-06-25)

**Evidence missing:** No public API documentation, webhook documentation, or detailed security/compliance whitepaper found. No published EHR certification (ONC) status found.

---

## 5. Integrations and Platform Signals

### Confirmed Wearable / Health App Integrations

| Integration | Data Types |
|---|---|
| Apple Watch | Activity, heart rate, sleep |
| Oura Ring | Sleep, activity, heart rate |
| Strava | Activity / exercise |
| Flo | Menstrual cycle tracking |
| Apple Health | General health metrics (via patient iOS app) |

Source: [PR Newswire](https://www.prnewswire.com/news-releases/oasys-raises-4-6m-to-transform-mental-health-care-into-a-data-driven-discipline-catalyzing-better-health-outcomes-302654778.html) (accessed 2026-06-25); [oasys.health](https://oasys.health/) (accessed 2026-06-25)

### Clinical Measures Integrations

- PHQ-9 (Patient Health Questionnaire-9 for depression)
- GAD-7 (Generalized Anxiety Disorder-7)

Source: [oasys.health](https://oasys.health/) (accessed 2026-06-25)

### Platform Signals

- iOS mobile app exists and is actively updated (v2.8.1 released approximately June 18, 2026)
- Enterprise tier includes "custom integrations" — no further public technical detail
- No public Android app found
- No publicly documented EHR interoperability (HL7 FHIR, C-CDA) found

---

## 6. Recent Product Changes: Last 6–12 Months

| Date | Change | Source |
|---|---|---|
| June 18, 2026 (approx.) | App v2.8.1: Minor improvements | App Store version history |
| June 12, 2026 | App v2.8.0: Push notifications and secure messaging added; new dashboard, booking flow, and billing features redesigned | App Store version history |
| May 20, 2026 | App v2.7.0: Bug fixes | App Store version history |
| January 6, 2026 | App v2.3: Comprehensive functionality updates; integrated therapist-facing functionality to access treatment plans and run in-person sessions from app | App Store version history |
| January 7–8, 2026 | $4.6M seed round announced; platform described publicly for the first time in press coverage | PR Newswire, HIT Consultant |
| 2026 (planned) | Outcomes measurement framework launch announced — provides clinicians with standards to track patient progress | PR Newswire |

Source: [App Store listing](https://apps.apple.com/us/app/oasys-health/id6737940488) (accessed 2026-06-25); [PR Newswire](https://www.prnewswire.com/news-releases/oasys-raises-4-6m-to-transform-mental-health-care-into-a-data-driven-discipline-catalyzing-better-health-outcomes-302654778.html) (accessed 2026-06-25)

**Note:** The outcomes measurement framework is announced as a 2026 roadmap item, not yet shipped as of the research date. [inference — no launch confirmation found]

---

## 7. Stale or Missing Evidence

| Gap | Status |
|---|---|
| Public API or webhook documentation | Not found — evidence missing |
| Android / web app for patients | Not found — evidence missing |
| ONC EHR certification status | Not found — evidence missing |
| FHIR / HL7 interoperability | Not found — evidence missing |
| Detailed security whitepaper or SOC 2 report | Not found — evidence missing |
| Help center or user documentation site | Not found — only website marketing pages accessible |
| Changelog beyond App Store version history | Not found — evidence missing |
| Outcomes measurement framework launch confirmation | Announced for 2026 but not confirmed shipped — stale/unresolved |
| Medication adherence implementation detail | Claimed on website; no mechanism described — evidence missing |
| Multi-language transcription detail | Stated capability; no languages listed — evidence missing |

---

## 8. Source Appendix

| # | Title | URL | Accessed |
|---|---|---|---|
| 1 | Oasys — The Operating System for Modern Mental Healthcare (official website) | https://oasys.health/ | 2026-06-25 |
| 2 | Oasys Raises $4.6M to Transform Mental Health Care (PR Newswire) | https://www.prnewswire.com/news-releases/oasys-raises-4-6m-to-transform-mental-health-care-into-a-data-driven-discipline-catalyzing-better-health-outcomes-302654778.html | 2026-06-25 |
| 3 | Oasys Raises $4.6M to Build AI-Native OS for Behavioral Health (HIT Consultant) | https://hitconsultant.net/2026/01/08/oasys-raises-4-6m-to-build-the-first-ai-native-os-for-behavioral-health/ | 2026-06-25 |
| 4 | Oasys Raises $4.6M to Build AI-Native Operating System (AlleyWatch) | https://alleywatch.com/2026/01/oasys-health-ai-behavioral-mental-health-ehr-operating-system-automation-platform-hashem-abdou/ | 2026-06-25 |
| 5 | Oasys Raises $4.6M to Expand AI-Powered Platform (MedCity News) | https://medcitynews.com/2026/01/oasys-mental-health-ai/ | 2026-06-25 |
| 6 | Oasys Health App — App Store listing | https://apps.apple.com/us/app/oasys-health/id6737940488 | 2026-06-25 |
