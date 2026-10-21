# Audelin

A native, fully local macOS companion for the owner's calls (Zoom, Telemost,
Meet) in Russian with English professional terms. It records both sides as
two tracks, shows a smooth, selectable live transcript in a floating panel,
and, from v2, explains a selected term in Russian through bb.

Status: design and architecture stage (2026-10-21). No app code yet; the
spike that tested Parakeet v3 live recognition lives with the research.

| Path | What it holds |
|---|---|
| [docs/log.md](docs/log.md) | What changed for the product, newest first |
| [../research/wisper/](../research/wisper/) | Research, MVP plan, ADR-001, naming and design (moving into `docs/`) |

CLI `audelin`, data folder `~/.audelin`, calls in `~/Recordings/Audelin`.
