# Audelin

A native, fully local macOS companion for the owner's calls (Zoom, Telemost,
Meet) in Russian with English professional terms. It records both sides as
two tracks, shows a smooth, selectable live transcript in a floating panel,
and, from v2, explains a selected term in Russian through bb.

Status: v1 build started (2026-10-22). The code lives in [macos/](macos/),
ADR-001's local Swift package; so far it holds the stabilizer. The spike that
tested Parakeet v3 live recognition lives with the research.

| Path | What it holds |
|---|---|
| [macos/](macos/) | The Swift package (`swift test` there): TranscriptCore so far |
| [docs/log.md](docs/log.md) | What changed for the product, newest first |
| [docs/adr-001-v1-architecture.md](docs/adr-001-v1-architecture.md) | v1 architecture: one modular app, record first, ports and adapters |
| [docs/spec-process.md](docs/spec-process.md) | How behaviour is specified: one SPEC.md and QA.md per component, at most 100 lines, tracked in Multica |
| [docs/audelin-naming-brief.md](docs/audelin-naming-brief.md) | The name: Audelin, CLI `audelin`, data in `~/.audelin` |
| [docs/design/README.md](docs/design/README.md) | Glass Ledger design: tokens, components, Screens 1–8 in `visual-language.pen` |
| [docs/mvp.md](docs/mvp.md) | The MVP spec: versions, technical rules and owner decisions |
| [docs/research/](docs/research/) | Research, the Parakeet spike and naming rounds |

CLI `audelin`, data folder `~/.audelin`, calls in `~/Recordings/Audelin`.
