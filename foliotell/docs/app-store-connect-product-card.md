---
date: 2026-07-06
model: gpt-5
description: "FolioTell App Store Connect product card and metadata backup"
---

# FolioTell App Store Connect Product Card

## Identity

- App name: FolioTell
- App Apple ID: `6788106003`
- Bundle ID: `foliotell.FolioTell`
- Apple team/provider: `VRVJ9YNRQU`
- Platform: iOS
- Current version: `0.0.1`
- Current build: `58`
- Locale: `en-US`
- Public landing URL: `https://foliotell.pages.dev`
- Public privacy URL: `https://foliotell.pages.dev/privacy`
- Cloudflare Pages project: `foliotell`
- Cloudflare Pages production domain: `foliotell.pages.dev`
- Custom domain: none

## App Information

- Name: FolioTell
- Subtitle: Markdown & text aloud
- Privacy policy URL: `https://foliotell.pages.dev/privacy`
- Privacy choices URL: unset
- Privacy policy text:

```text
FolioTell does not collect personal data. The app opens local Markdown and plain text files using Apple document access, reads them aloud on device using Apple speech synthesis, and has no account, backend, analytics, subscription, or network dependency.
```

## Version Metadata

- Promotional text:

```text
Hear your documents, straight from the file browser.
```

- Description:

```text
FolioTell opens local Markdown or plain-text files from the system document browser and reads them aloud using Apple speech synthesis, with selectable playback speed. A native, offline, read-only SwiftUI app: no account, backend, analytics, subscription, or network dependency.
```

- Keywords:

```text
text to speech,tts,markdown,plain text,documents,reader,speech,offline,voice,files
```

- Marketing URL: `https://foliotell.pages.dev`
- Support URL: `https://foliotell.pages.dev`
- What's new: unset

## Public Landing

- Canonical URL: `https://foliotell.pages.dev`
- Privacy policy URL: `https://foliotell.pages.dev/privacy`
- Source artifact: `foliotell/landing/index.html`
- Published files: `index.html`, `privacy.html`, `appicon.png`

## Categories

- Primary category: unset
- Secondary category: unset

`PRODUCTIVITY` is the closest repo-backed category candidate because the app is a document-listening productivity utility, but App Store Connect currently reports no category and the public API rejects category relationship updates.

## API Limitations Observed

- `primaryCategory`: App Store Connect returned `403 FORBIDDEN_ERROR`; the `primaryCategory` relationship allows read operations but not update operations through the public API.
- `whatsNew`: App Store Connect returned `409 STATE_ERROR`; the initial version state does not allow editing this field at this time.
- `foliotell.enoa.ai`: custom-domain setup was removed; use `https://foliotell.pages.dev` as the public App Store URL.

## Source Files

- `foliotell/README.md`: product description, release identity, team/provider, bundle ID, and distribution credential model.
- `foliotell/index.html`: public-facing tagline and product positioning.
- `foliotell/docs/foliotell-technical-spec.md`: v0.0.1 behavior and constraints.
- `foliotell/App/Info.plist`: app display name and export compliance declaration.
- `foliotell/release.toml`: canonical release version metadata.
- Public landing source artifact: `foliotell/landing/`.

## Sync Rule

When App Store Connect metadata changes, update this card in the same change set. Treat unset values as intentional state unless a source file or ASC readback proves otherwise.
