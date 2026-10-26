# Audelin

A native, fully local macOS companion for the owner's calls (Zoom, Telemost,
Meet) in Russian with English professional terms. It records both sides as
two tracks, shows a smooth, selectable live transcript in a floating panel,
and, from v2, explains a selected term in Russian through bb.

Status: the menu bar app records detected calls using stored preferences.
The live panel and settings UI are not connected yet.

Build: `cd audelin/macos && sh scripts/bundle.sh`.
Run: `open .build/Audelin.app` from `audelin/macos`.

| Path | What it holds |
|---|---|
| [docs/log.md](docs/log.md) | What changed for the product, newest first |
| [docs/spec-process.md](docs/spec-process.md) | How behaviour is specified: one SPEC.md and QA.md per component, at most 100 lines, tracked in Multica |
| [docs/audelin-naming-brief.md](docs/audelin-naming-brief.md) | The name: Audelin, CLI `audelin`, data in `~/.audelin` |
| [docs/design/README.md](docs/design/README.md) | Glass Ledger design: tokens, components, Screens 1–8 in `visual-language.pen` |
| [docs/mvp.md](docs/mvp.md) | The product vision as first written: not grounds for any spec or technical choice |
| [docs/research/](docs/research/) | Research, the Parakeet spike and naming rounds |

CLI `audelin`, data folder `~/.audelin`, calls in `~/Recordings/Audelin`.
