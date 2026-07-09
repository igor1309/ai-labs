---
date: 2026-07-09
model: gpt-5
description: "Product intent: reader-managed download and offline use of FolioTell neural voices."
---

# Product Intent: Downloadable On-Device Neural Voices

## Product outcome

Readers can explicitly download a neural voice from FolioTell's settings and
use it to listen to their documents on device. After a model is installed,
document reading and speech synthesis work without a network connection and
the document text never leaves the device.

## Actors

- **Reader**: chooses whether to download and use a neural voice for listening.
- **Privacy-conscious reader**: needs to distinguish an explicit model download
  from document processing and speech synthesis.

## User stories

### PI-NV-001 — Explicit voice download

As a reader,
I want to choose and download a neural voice from settings,
so that adding a large model is under my control.

Status: accepted

Acceptance signal: no neural voice model downloads until the reader explicitly
starts its download from the settings page.

### PI-NV-002 — Offline listening after installation

As a reader,
I want an installed neural voice to read my documents without a network
connection,
so that I can listen privately and reliably wherever I am.

Status: accepted

Acceptance signal: in airplane mode, an installed neural voice can read a
local document with no document-content network request.

### PI-NV-003 — Transparent model ownership

As a reader,
I want to see which neural voices are installed and remove ones I no longer
want,
so that I can control the storage they use.

Status: accepted

Acceptance signal: settings identifies each installed neural voice and offers
a deletion action before its local assets are removed.

## Acceptance signals

- The settings page is the only entry point for initiating a neural-model
  download.
- A reader can use an installed neural voice with no connectivity.
- A document's text is never sent to a download service or TTS service.
- Storage use and installed-model state are visible before a reader deletes a
  model.

## Boundaries and non-goals

- This intent does not add cloud TTS, document upload, accounts, analytics, or
  background data transfer.
- Apple system voices remain system-managed; their download path remains iOS
  Settings rather than FolioTell's model manager.
- This intent does not select a neural runtime, model, audio architecture, or
  model-hosting mechanism.
- This intent does not decide whether Auto may select a neural voice or whether
  voice selection is global or per document.

## Open product questions

- Should Auto choose an installed neural voice, or should a reader select it
  explicitly?
- When a selected neural model is unavailable, which installed Apple or neural
  voice is the visible fallback?
- Should neural voice selection be global or stored per document?

## Downstream traceability

| Story | Research | Pre-ADR / ADR | Spec | Implementation plan | Code / tests |
| --- | --- | --- | --- | --- | --- |
| PI-NV-001 | `research/on-device-neural-tts-feasibility.md` | pending device spike | pending | pending | pending |
| PI-NV-002 | `research/on-device-neural-tts-feasibility.md` | pending device spike | pending | pending | pending |
| PI-NV-003 | `research/on-device-neural-tts-feasibility.md` | pending device spike | pending | pending | pending |

## Change review

| Change | Impact review |
| --- | --- |
| 2026-07-09: neural voices are reader-downloaded rather than bundled. | Review model-download UX, storage behavior, privacy/marketing copy, and downstream ADR/spec/plan before implementation. |
