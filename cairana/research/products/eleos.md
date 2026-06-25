---
date: 2026-06-25
model: sonnet
description: "Product research report on Eleos by Eleos Health — AI-powered behavioral health documentation and compliance platform"
---

# Eleos by Eleos Health

## 1. Product Overview

Eleos is an AI-powered platform purpose-built for behavioral health clinical documentation and compliance. It is used by therapists, psychiatrists, case managers, peer counselors, and organizational leaders at community behavioral health organizations.

The product supports the clinical documentation workflow: capturing session audio or text summaries, generating structured progress notes, scanning notes for compliance, and surfacing care insights — all embedded within the provider's existing EHR environment via a browser extension sidebar.

As of 2025, Eleos was deployed across 250+ organizations in 39 states, serving approximately 40,000 clinicians and over 1 million patients, and processed 5.2 million notes during 2025.

Sources: [Eleos Documentation page](https://eleos.health/documentation/) (accessed 2026-06-25); [2025 Year-in-Review blog](https://eleos.health/blog-posts/eleos-2025-ai-innovation-compassionate-care/) (accessed 2026-06-25); [GlobeNewswire press release, May 1 2025](https://www.globenewswire.com/news-release/2025/05/01/3072434/0/en/Eleos-Advances-Comprehensive-Behavioral-Health-Product-Capabilities.html) (accessed 2026-06-25).

---

## 2. Core Capabilities

### Documentation (Eleos Documentation)

| Capability | Detail |
|---|---|
| Ambient audio capture | Live session audio captured without third-party tools or devices; audio deleted within 1–2 minutes post-session |
| Text summary input | Providers enter bullet points that the AI expands into a full narrative note |
| Note generation | Generates ~80% of progress note content; clinician reviews and edits before submitting to EHR |
| Session type coverage | Individual therapy, couples/family therapy, group therapy, case management, peer support, psychiatry, SUD treatment, intake, assessment |
| Language support | 150+ languages with automatic translation to English for note output |
| Offline mode | Mobile offline documentation with automatic EHR sync on reconnect (for rural/field-based providers) |
| Groups Audio | Multi-speaker capture for group therapy; generates individual and group summaries simultaneously |

### Compliance (Eleos Compliance)

- Scans 100% of notes in real time against six risk areas: note cloning, empty notes, interventions, progress mentions, action plan, and golden thread.
- Organizations report 20x increase in review volume versus manual sampling.
- Developed in collaboration with legal and regulatory experts from the National Council for Mental Wellbeing.

### Clinical Insights Agent

- In-workflow co-pilot surfacing evidence-based practice (EBP) guidance and actionable care insights.
- Supports ASAM-aligned documentation for substance use disorder treatment.
- Distinguishes between multiple speakers in group sessions.

### Revenue Cycle Management (RCM)

- AI-powered eligibility checking and claims intelligence.
- Hidden coverage discovery and denial prevention via upstream error detection.
- OBBBA AI Scanner: real-time Medicaid eligibility change detection during sessions (housing status, diagnosis updates, life events).

Sources: [Eleos homepage](https://eleos.health/) (accessed 2026-06-25); [Community Behavioral Health page](https://eleos.health/community-behavioral-health/) (accessed 2026-06-25); [2025 Year-in-Review blog](https://eleos.health/blog-posts/eleos-2025-ai-innovation-compassionate-care/) (accessed 2026-06-25); [FAQ page](https://eleos.health/ai-frequently-asked-questions/) (accessed 2026-06-25).

---

## 3. Workflow Map

### User Roles

| Role | Primary Interaction |
|---|---|
| Therapist / Clinician | Conducts session; reviews and submits AI-generated note |
| Psychiatrist / Prescriber | Same as clinician; note templates include medication changes and risk indicators |
| Case Manager | Mobile/offline documentation in field settings |
| Peer Counselor | Peer support session documentation |
| QA / Compliance Staff | Reviews compliance scan results; manages audit readiness |
| Organizational Leader / CIO | Accesses analytics dashboards and population health data |
| Revenue Cycle Staff | Reviews eligibility and claims intelligence outputs |

### Workflow Steps

1. Provider opens their EHR in a web browser; the Eleos sidebar panel activates within that browser session.
2. Provider begins session (in-person, telehealth, or field-based). They click a button in the sidebar to start ambient audio capture — no external device required.
3. Alternatively, the provider enters text bullet points summarizing the session.
4. After the session, Eleos processes the audio or text and generates structured note suggestions within minutes.
5. Provider reviews the AI-generated content in the sidebar, edits as needed to apply clinical judgment.
6. Provider selects and populates the finalized content into the EHR note fields.
7. Eleos Compliance scans the submitted note in real time against compliance risk criteria.
8. Leadership and QA teams access dashboards showing documentation quality, compliance flags, and care outcome metrics.

### Handoffs

- Audio → note suggestions: automated, no human handoff required.
- Note suggestions → EHR: provider-mediated; provider controls what enters the record.
- Compliance scanning → QA team: automated flags surfaced to QA/compliance staff dashboards.
- Eligibility data → revenue cycle staff: automated; RCM module surfaces coverage changes and denial risks.

Sources: [Eleos Documentation page](https://eleos.health/documentation/) (accessed 2026-06-25); [EHR integration blog post](https://eleos.health/blog-posts/ai-documentation-technology/) (accessed 2026-06-25); [Community Behavioral Health page](https://eleos.health/community-behavioral-health/) (accessed 2026-06-25); [VoiceAI case study](https://eleos.health/case-studies/how-a-large-behavioral-health-system-used-eleos-health-to-reduce-manual-ehr-clicks-by-90-with-in-workflow-voiceai-solution-2/) (accessed 2026-06-25).

---

## 4. Technical / Workflow Notes

### Integration Architecture

Eleos operates as a **browser extension sidebar** that overlays web-based EHR systems. This is described as EHR-agnostic; no API connections or custom code integrations are required from the client organization. The Eleos team handles ~95% of implementation. The integration is read/write: Eleos reads the EHR session context and populates note fields directly.

Confirmed compatible EHRs (named in product FAQ): Carelogic, Credible, InSync, SmartCare, My Avatar NX, MyEvolv, EchoVantage, PCE, Kipu, Welligent, eHana, Exym.

### AI Foundation

- NLP engine described as built on AWS infrastructure; multimodal large language models (MM-LLMs) fine-tuned on a behavioral health-specific dataset.
- Trained on "the industry's largest database of real-world behavioral health sessions" (claim is Eleos's own; independent verification not found).
- Word accuracy rate cited at approximately 93–94%.
- Polaris AI: a model variant built in collaboration with Google Cloud, described as optimized for post-acute care and complex/long sessions including group therapy.

### Data Handling

- Session audio is processed in real time and deleted within 1–2 minutes after the session ends; the original conversation is not stored.
- Retained data: AI-generated note suggestions, engagement metrics, clinician ID, session timestamp, client identifier, and client name.
- Data lifecycle: Captured → Encrypted → Analyzed → Populated into clinician dashboard (held for a predefined period) → De-identified or deleted upon request.
- PHI hosted on AWS HIPAA-eligible servers located in the continental United States.

### Security & Compliance

| Certification / Standard | Status |
|---|---|
| HIPAA | Compliant |
| SOC 2 Type II | Certified |
| HITRUST | Certified |
| ISO 27001 | Certified |
| ISO 27799 | Certified |
| ISO 42001 (AI-specific) | Certified (achieved 2025) |
| FERPA | Compliant |
| NIST CSF | Adopted |
| SAIL framework (AI risk) | Adopted |
| Drummond pDSI Risk Certification | Earned (2025) |

Additional controls: TLS 1.2+ encryption in transit; AES-256 at rest; SSO/MFA authentication; principle of least privilege; host-based intrusion detection (HIDS); annual third-party penetration testing; continuous automated monitoring.

Trust portal: trust.eleos.health (referenced in official docs; not fetched for this report).

Sources: [Security page](https://eleos.health/security/) (accessed 2026-06-25); [FAQ page](https://eleos.health/ai-frequently-asked-questions/) (accessed 2026-06-25); [EHR integration blog post](https://eleos.health/blog-posts/ai-documentation-technology/) (accessed 2026-06-25).

---

## 5. Integrations and Platform Signals

### EHR Compatibility

Integration is EHR-agnostic via browser extension. Named compatible systems (from FAQ): Carelogic, Credible, InSync, SmartCare, My Avatar NX, MyEvolv, EchoVantage, PCE, Kipu, Welligent, eHana, Exym.

### Telehealth

The VoiceAI case study documents integration with Zoom for telehealth group sessions, with audio captured directly through the browser extension.

### Cloud Infrastructure

- AWS (primary hosting; HIPAA-eligible US-based servers).
- Google Cloud (used for Polaris AI model development).

### API / Webhooks

No public API documentation or webhook documentation was found in publicly available pages. The February 2026 release notes (from eleostech.com, a different company) mention an "Audit Log API," but that URL belongs to Eleos Technologies — a separate company unrelated to Eleos Health. No Eleos Health public API docs were confirmed.

### Admin Controls

- Organizational policy enforcement through compliance scanning rules.
- SSO and MFA enforced at access layer.
- Role-based access described (principle of least privilege).
- Logical data separation between client organizations.

Sources: [FAQ page](https://eleos.health/ai-frequently-asked-questions/) (accessed 2026-06-25); [Security page](https://eleos.health/security/) (accessed 2026-06-25); [VoiceAI case study](https://eleos.health/case-studies/how-a-large-behavioral-health-system-used-eleos-health-to-reduce-manual-ehr-clicks-by-90-with-in-workflow-voiceai-solution-2/) (accessed 2026-06-25); [2025 Year-in-Review blog](https://eleos.health/blog-posts/eleos-2025-ai-innovation-compassionate-care/) (accessed 2026-06-25).

---

## 6. Recent Product Changes: Last 6–12 Months

All dates are from official or newswire sources; "H1 2025" and "2025" without a specific month are used where exact month is not stated.

| Date | Change | Source |
|---|---|---|
| May 1, 2025 | New Eleos Documentation experience launched: sidebar panel interface, universal one-on-one session support, 150+ language support, offline mobile documentation | GlobeNewswire press release |
| 2025 | Groups Audio launched: first AI solution to deliver individual speaker summaries in group therapy (in-person, hybrid, telehealth) | 2025 Year-in-Review blog |
| 2025 | Eleos Compliance launched: 100% continuous note scanning for CDI, CQI, and audit readiness; developed with National Council for Mental Wellbeing advisors | 2025 Year-in-Review blog |
| 2025 | Expansion into substance use disorder (SUD) treatment segment with ASAM-aligned documentation | 2025 Year-in-Review blog |
| 2025 | Expansion into home health, hospice, and palliative care markets | 2025 Year-in-Review blog |
| 2025 | Polaris AI model released: built with Google Cloud; optimized for post-acute care and complex group sessions | 2025 Year-in-Review blog |
| 2025 | OBBBA AI Scanner released: real-time Medicaid eligibility change detection during sessions | 2025 Year-in-Review blog |
| 2025 | ISO 42001 certification achieved (AI-specific risk management standard) | 2025 Year-in-Review blog |
| 2025 | Drummond pDSI Risk Certification earned | 2025 Year-in-Review blog |
| 2025 | SAIL framework adoption for AI risk management | 2025 Year-in-Review blog |
| Q1 2025 | $60M Series C funding announced (total funding: $120M+) | 2025 Year-in-Review blog |

Sources: [GlobeNewswire press release, May 1 2025](https://www.globenewswire.com/news-release/2025/05/01/3072434/0/en/Eleos-Advances-Comprehensive-Behavioral-Health-Product-Capabilities.html) (accessed 2026-06-25); [Eleos press release](https://eleos.health/press-releases/new-healthcare-ai-product-announcement/) (accessed 2026-06-25); [2025 Year-in-Review blog](https://eleos.health/blog-posts/eleos-2025-ai-innovation-compassionate-care/) (accessed 2026-06-25).

---

## 7. Stale or Missing Evidence

### Missing Evidence

- **Public API documentation**: No publicly accessible API reference, webhook documentation, or developer portal was found. The FAQ states integrations require no API connections; any programmatic API for third-party access is not publicly documented.
- **Granular admin controls**: Role permission details, hierarchy configuration, and admin console features are not described in public-facing pages.
- **Changelog / release notes page**: Eleos Health does not appear to publish a versioned changelog on its public website. The eleostech.com "release notes" URL that appeared in search results belongs to a different company (Eleos Technologies) and is not relevant.
- **Pricing and plan tiers**: Not researched per prompt scope, but no public pricing page exists.
- **Trust portal content**: trust.eleos.health is referenced in official documentation but was not fetched for this report. May contain additional security and compliance detail.
- **Audit Log API**: A February 2026 reference to an "Audit Log API" appeared in search results attributed to eleostech.com, which is a separate company. No confirmed Eleos Health Audit Log API was found.

### Potentially Stale Evidence

- The confirmed EHR compatibility list (Carelogic, Credible, InSync, etc.) is sourced from the FAQ page. No date is attached to that list; it may not reflect all current integrations.
- Performance outcome metrics (70% documentation time reduction, 2x client engagement, 3–4x symptom reduction) are marketing claims from Eleos's own website. The randomized controlled trial basis is referenced but the study itself was not located or reviewed.
- The "93–94% word accuracy" figure is from the FAQ page with no date; the underlying NLP engine may have been updated.

---

## 8. Source Appendix

| # | Title | URL | Date Accessed | Type |
|---|---|---|---|---|
| 1 | Eleos Documentation page | https://eleos.health/documentation/ | 2026-06-25 | Official product page |
| 2 | Eleos homepage | https://eleos.health/ | 2026-06-25 | Official product page |
| 3 | Eleos Community Behavioral Health page | https://eleos.health/community-behavioral-health/ | 2026-06-25 | Official product page |
| 4 | Eleos FAQ page | https://eleos.health/ai-frequently-asked-questions/ | 2026-06-25 | Official help/FAQ |
| 5 | Eleos Security page | https://eleos.health/security/ | 2026-06-25 | Official security page |
| 6 | Eleos EHR integration blog post | https://eleos.health/blog-posts/ai-documentation-technology/ | 2026-06-25 | Official blog |
| 7 | Eleos 2025 Year-in-Review blog | https://eleos.health/blog-posts/eleos-2025-ai-innovation-compassionate-care/ | 2026-06-25 | Official blog |
| 8 | Eleos press release (new product announcement) | https://eleos.health/press-releases/new-healthcare-ai-product-announcement/ | 2026-06-25 | Official press release |
| 9 | GlobeNewswire: Eleos Advances Comprehensive Behavioral Health Product Capabilities | https://www.globenewswire.com/news-release/2025/05/01/3072434/0/en/Eleos-Advances-Comprehensive-Behavioral-Health-Product-Capabilities.html | 2026-06-25 | Newswire (May 1, 2025) |
| 10 | Eleos VoiceAI case study | https://eleos.health/case-studies/how-a-large-behavioral-health-system-used-eleos-health-to-reduce-manual-ehr-clicks-by-90-with-in-workflow-voiceai-solution-2/ | 2026-06-25 | Official case study |
| 11 | Eleos NatCon26 recap blog | https://eleos.health/blog-posts/natcon26-behavioral-health-ai-recap/ | 2026-06-25 | Official blog |
| 12 | Fierce Healthcare: Eleos group therapy AI tool | https://www.fiercehealthcare.com/health-tech/eleos-health-extends-ai-documentation-tool-group-therapy-setting | 2026-06-25 | Trade press |
| 13 | OPEN MINDS: Eleos expands AI documentation | https://openminds.com/press/eleos-advances-comprehensive-behavioral-health-product-capabilities/ | 2026-06-25 | Trade press |
