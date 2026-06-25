---
date: 2026-06-25
model: sonnet
description: "Product research report on JotPsych by SmartScribe Corp. — AI-powered behavioral health documentation and RCM platform"
---

# JotPsych — Product Research Report

## 1. Product Overview

JotPsych, built by SmartScribe Corp., is an AI-powered behavioral health documentation and revenue cycle management (RCM) platform. The product began as an AI scribe for clinical note-generation and has expanded into a multi-module platform marketed as "Your whole behavioral health practice. One system."

**Target users:** Psychiatrists, PMHNPs, licensed therapists, counselors, social workers, addiction medicine specialists, interventional psychiatrists, and group practice administrators. The platform serves solo practitioners through large multi-location practices. The company claims usage by over 10,000 behavioral health practices. [Verified — jotpsych.com homepage, accessed 2026-06-25]

**Professional workflow supported:** The platform addresses the full behavioral health encounter lifecycle: session recording → transcription → note generation → coding → billing → audit. Recent additions (2025–2026) extend this into e-prescribing and telehealth.

**Concrete jobs performed:**

- Transcribes clinical sessions (in-person or telehealth) and generates structured clinical notes in under 60 seconds
- Suggests CPT and ICD-10 codes in real time
- Runs compliance checks against payer rules before note signing
- Manages billing, claims submission, and patient payments
- Supports e-prescribing including controlled substances
- Provides integrated telehealth video rooms (as of May 2026)

Sources: [JotPsych homepage](https://jotpsych.com/), [JotPsych Features page](https://jotpsych.com/features), [JotPsych Specialties — Psychiatry](https://www.jotpsych.com/psychiatry) — all accessed 2026-06-25.

---

## 2. Core Capabilities

### Documentation

| Feature | Description |
|---|---|
| AI Scribe | Converts session audio into structured notes in under 60 seconds; supports 16+ languages; works with in-person and telehealth sessions |
| AI Edit | Natural language editing that learns user writing style over time |
| Template Library | 60–80+ pre-built behavioral health templates (intake, follow-up, therapy, med management, EMDR, ABA, group therapy, psychotherapy add-on) |
| Template Builder | Custom template creation via sample PDF upload or drag-and-drop |
| Custom Document Generator | Creates referral letters, prior authorization narratives, and disability forms from session data |
| EHR Integration (Chrome extension) | Pushes completed notes directly into web-based EHR patient charts |

Sources: [JotPsych Features page](https://jotpsych.com/features), [Therapy Reimagined podcast review](https://therapyreimagined.com/modern-therapist-podcast/special-episode-modern-therapists-consumer-guide-on-jotpsych/) — accessed 2026-06-25.

### Billing and Compliance

| Feature | Description |
|---|---|
| CPT/ICD-10 Suggestions | Real-time automatic coding with documentation support flags |
| Payer-Aware Notes | Note structure adjusts to match specific insurance payer requirements |
| JotAudit | Real-time compliance checking against 150+ rules from AMA, APA, Cigna, Aetna, Optum, CMS before note signing; launched January 2026 |
| Claim Generation | Pre-populated claim creation and direct submission via clearinghouse integration |
| Insurance Eligibility Checks | Real-time coverage, co-pay, deductible, and authorization verification |
| Patient Billing | Automated invoicing, payment portal, credit card/ACH processing |

Source: [JotPsych Features page](https://jotpsych.com/features), [JotAudit launch blog post](https://jotpsych.com/blog/jotpsych-debuts-jotaudit-turning-behavioral-health-documentation-into-a-standardized-ai-driven-aud) — accessed 2026-06-25.

### Practice Management

| Feature | Description |
|---|---|
| Scheduling | Calendar management, automated reminders, client self-booking |
| Forms and Screeners | PHQ-9, GAD-7, PCL-5, AUDIT-C with longitudinal tracking |
| Patient Management | Centralized client profiles with demographics, visit history, billing status |
| JotCoach | AI-driven feedback on documentation quality and compliance trends |
| Labs | Integrated lab ordering and results tracking for medication monitoring |
| JotRx (e-prescribing) | EPCS-certified prescribing for controlled substances (Schedule II–V); launched February 2026 |
| JotMeet (telehealth) | Integrated HIPAA-compliant video rooms with AI note generation; launched May 2026 |

Source: [JotPsych Features page](https://jotpsych.com/features), [JotRx launch blog](https://jotpsych.com/blog/jotpsych-launches-integrated-e-prescribing-for-behavioral-health), [JotMeet PR Newswire release](https://www.prnewswire.com/news-releases/jotpsych-launches-jotmeet-an-integrated-telehealth-product-302779340.html) — accessed 2026-06-25.

---

## 3. Workflow Map

### User Roles

- **Clinician (primary):** Records sessions, reviews and edits AI-generated notes, signs notes, prescribes medications
- **Biller / Practice Administrator:** Reviews coding suggestions, manages claims, monitors audit compliance trends via JotAudit
- **Clinical Supervisor:** Reviews trainee session documentation (specialized formats available) [inference — described in third-party review; not confirmed on official product pages]
- **Patient:** Uses self-booking, receives patient portal invoices, joins telehealth via persistent waiting-room link

### Typical Workflow Steps

1. **Session recording:** Clinician records session via device microphone or JotMeet telehealth room
2. **Transcription:** Audio is transcribed automatically; PII/PHI is redacted
3. **Note generation:** AI generates structured note (under 60 seconds) using selected template
4. **Review and edit:** Clinician reviews note; AI Edit supports natural language corrections
5. **Coding:** System suggests CPT and ICD-10 codes inline
6. **Audit check (JotAudit):** System flags documentation gaps against 150+ payer rules before signing
7. **Note signing:** Clinician signs the note; audio file is deleted
8. **EHR transfer:** Note pushed to EHR via Chrome extension or copy-paste
9. **Claim submission:** Pre-populated claim submitted through clearinghouse integration
10. **Prescribing (if applicable):** Clinician accesses JotRx via patient page; medication data syncs back into note

Source: [JotPsych homepage](https://jotpsych.com/), [JotPsych Features page](https://jotpsych.com/features), [JotRx launch blog](https://jotpsych.com/blog/jotpsych-launches-integrated-e-prescribing-for-behavioral-health), [Therapy Reimagined podcast](https://therapyreimagined.com/modern-therapist-podcast/special-episode-modern-therapists-consumer-guide-on-jotpsych/) — accessed 2026-06-25.

### Outputs

- Signed clinical notes (stored in JotPsych or exported to EHR)
- Insurance claims (submitted via clearinghouse)
- Prescriptions (transmitted via Surescripts)
- Patient invoices
- Audit compliance reports (per note and longitudinal trends)

---

## 4. Technical/Workflow Notes

### Security and Compliance

- Data encrypted in transit (TLS) and at rest
- Infrastructure hosted on ISO 27001-certified, SOC 2 Type II compliant cloud
- Audio files permanently deleted after transcript is generated
- HIPAA-compliant; processes regulated under CCPA, GDPR, and SOC 2
- PHI auto-redacted from transcripts
- 21 CFR 1311 compliance review for JotRx (controlled substance prescribing) conducted by Drummond Group

Source: [Why JotPsych page](https://www.jotpsych.com/why-jotpsych), [JotRx launch blog](https://jotpsych.com/blog/jotpsych-launches-integrated-e-prescribing-for-behavioral-health) — accessed 2026-06-25.

### EHR Integration

- Chrome extension that detects web-based EHR and pushes notes to patient charts
- Specific EHRs named in a third-party review: TherapyNotes, SimplePractice, Valant, Epic
- Enterprise plan described as offering custom integration for systems not on standard list [source: aitoolbox360.com third-party review — lower confidence than official docs]
- Official site claims "works with any EHR" and "no migration, up in 5 minutes"

Source: [Why JotPsych page](https://www.jotpsych.com/why-jotpsych), [AI Toolbox 360 review](https://aitoolbox360.com/ai-tools/jotpsych/) — accessed 2026-06-25. The named EHR list (TherapyNotes, SimplePractice, Valant, Epic) comes from a third-party review, not from official JotPsych documentation — treat as indicative only.

### E-Prescribing Technical Details

- Integrates DoseSpot 8.0 EPCS module
- Full Surescripts-certified network
- EPCS for Schedule II–V controlled substances
- Two-factor authentication and audit logging required
- Drug-drug interaction alerts, formulary checks, pharmacy search included

Source: [JotRx launch blog](https://jotpsych.com/blog/jotpsych-launches-integrated-e-prescribing-for-behavioral-health) — accessed 2026-06-25.

### Telehealth Technical Details

- JotMeet built with Daily.co infrastructure; BAA in place with Daily.co
- Persistent per-clinician waiting room link (no per-appointment room creation)
- Picture-in-picture view to access patient chart during video call
- Telehealth place-of-service codes and modifiers applied automatically to billing claims

Source: [JotMeet PR Newswire](https://www.prnewswire.com/news-releases/jotpsych-launches-jotmeet-an-integrated-telehealth-product-302779340.html) — accessed 2026-06-25.

### Admin Controls

- JotAudit allows clinic leadership to upload internal standards and payer contracts, converting them into enforceable audit rules for the organization
- Longitudinal documentation quality trend visibility for administrators

Source: [JotAudit launch blog](https://jotpsych.com/blog/jotpsych-debuts-jotaudit-turning-behavioral-health-documentation-into-a-standardized-ai-driven-aud) — accessed 2026-06-25.

### Public API / Webhooks

No public API documentation or webhook documentation was found in official JotPsych materials. This evidence is **missing** — see Section 7.

---

## 5. Integrations and Platform Signals

| Integration | Type | Status |
|---|---|---|
| EHR (generic) | Chrome extension push | Verified — official docs |
| TherapyNotes | Named EHR | Third-party review only — unverified against official docs |
| SimplePractice | Named EHR | Third-party review + practitioner podcast — partially corroborated |
| Valant | Named EHR | Third-party review only |
| Epic | Named EHR | Third-party review only |
| DoseSpot 8.0 | E-prescribing module | Verified — official blog post |
| Surescripts | Prescription network | Verified — official blog post |
| Daily.co | Telehealth video infrastructure | Verified — official PR |
| Clearinghouse (unnamed) | Claims submission | Verified — features page; vendor name not disclosed |
| Drummond Group | EPCS compliance auditor | Verified — official blog post |

No public API, webhook endpoint, or developer documentation was found. Platform is delivered as a web application accessible via browser and a Chrome extension.

---

## 6. Recent Product Changes: Last 6–12 Months

| Date | Change | Source |
|---|---|---|
| July 2025 | $5M seed round from Base10 Partners announced; company stated goal of building "first fully agentic EHR for behavioral health" | [JotPsych blog](https://jotpsych.com/blog/press-release-jotpsych-secures-5m-seed-round-from-base10-partners) |
| Late 2025 | Payer-aware documentation layer rolled out; encodes 150+ rules from AMA, APA, Cigna, Aetna, Optum, CMS into note-writing | [JotAudit launch blog](https://jotpsych.com/blog/jotpsych-debuts-jotaudit-turning-behavioral-health-documentation-into-a-standardized-ai-driven-aud) |
| January 21, 2026 | JotAudit launched — real-time compliance audit embedded in note workflow | [JotAudit blog post](https://jotpsych.com/blog/jotpsych-debuts-jotaudit-turning-behavioral-health-documentation-into-a-standardized-ai-driven-aud) |
| February 23, 2026 | JotRx launched — integrated EPCS-certified e-prescribing via DoseSpot | [JotRx blog post](https://jotpsych.com/blog/jotpsych-launches-integrated-e-prescribing-for-behavioral-health) |
| May 25, 2026 | JotMeet launched — integrated telehealth with AI documentation and billing | [PR Newswire](https://www.prnewswire.com/news-releases/jotpsych-launches-jotmeet-an-integrated-telehealth-product-302779340.html) |

No granular changelog or release notes page was found on the official site. The above is reconstructed from press releases and blog posts.

---

## 7. Stale or Missing Evidence

### Missing Evidence

- **Public API / developer documentation:** No public API reference, webhook documentation, or integration developer guide was found. Whether a programmatic API exists for third-party integration is not established from public sources.
- **Named clearinghouse partner:** The claims submission clearinghouse is described but not named in official materials.
- **BAA details / template:** The existence of a BAA is implied by HIPAA compliance claims but no BAA template or formal documentation page was found.
- **Credentialing module details:** Credentialing is listed as a feature on the homepage but no dedicated documentation or feature description page was found.
- **Specific EHR named integrations (official):** The named EHR list (TherapyNotes, SimplePractice, Valant, Epic) was found only in a third-party review, not in official JotPsych product documentation.
- **Admin role permissions / access controls:** No documentation found describing role-based access controls, multi-user practice permissions, or supervisor approval workflows.
- **Granular changelog:** No versioned changelog, release notes page, or changelog feed was found on the official site.

### Stale or Low-Confidence Evidence

- The third-party review at aitoolbox360.com (no publication date visible) describes features and EHR names that may not reflect the current product state. Claims from this source are flagged accordingly.
- The Therapy Reimagined podcast references SimplePractice and TherapyNotes as copy-paste targets, which is consistent with but does not confirm native integration.

---

## 8. Source Appendix

| # | Source | URL | Date Accessed | Type |
|---|---|---|---|---|
| 1 | JotPsych Homepage | https://jotpsych.com/ | 2026-06-25 | Official product page |
| 2 | JotPsych Features page | https://jotpsych.com/features | 2026-06-25 | Official product page |
| 3 | JotPsych Specialties — Psychiatry | https://www.jotpsych.com/psychiatry | 2026-06-25 | Official product page |
| 4 | Why JotPsych page | https://www.jotpsych.com/why-jotpsych | 2026-06-25 | Official product page |
| 5 | JotPsych Blog index | https://www.jotpsych.com/blog | 2026-06-25 | Official blog |
| 6 | JotAudit launch blog post (Jan 21, 2026) | https://jotpsych.com/blog/jotpsych-debuts-jotaudit-turning-behavioral-health-documentation-into-a-standardized-ai-driven-aud | 2026-06-25 | Official press release / blog |
| 7 | JotRx launch blog post (Feb 23, 2026) | https://jotpsych.com/blog/jotpsych-launches-integrated-e-prescribing-for-behavioral-health | 2026-06-25 | Official press release / blog |
| 8 | JotMeet PR Newswire (May 25, 2026) | https://www.prnewswire.com/news-releases/jotpsych-launches-jotmeet-an-integrated-telehealth-product-302779340.html | 2026-06-25 | Official press release |
| 9 | $5M seed round blog post (Jul 29, 2025) | https://jotpsych.com/blog/press-release-jotpsych-secures-5m-seed-round-from-base10-partners | 2026-06-25 | Official press release / blog |
| 10 | Therapy Reimagined podcast — JotPsych consumer guide | https://therapyreimagined.com/modern-therapist-podcast/special-episode-modern-therapists-consumer-guide-on-jotpsych/ | 2026-06-25 | Practitioner review (podcast) |
| 11 | AI Toolbox 360 — JotPsych review | https://aitoolbox360.com/ai-tools/jotpsych/ | 2026-06-25 | Third-party review (undated) |
| 12 | JotAudit — PR Newswire (Jan 21, 2026) | http://www.prnewswire.com/news-releases/jotpsych-debuts-jotaudit-turning-behavioral-health-documentation-into-a-standardized-ai-driven-audit-system-302666957.html | 2026-06-25 | Wire service |
