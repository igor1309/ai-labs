---
date: 2026-06-19
source: https://t.me/c/3820411240/45/14799
description: "Prior art — Claudescope, a local viewer/search/analytics tool for AI-agent sessions, directly adjacent to session-digest."
---

# Claudescope (prior art)

Repo: https://github.com/vladar107/claudescope

A locally-run tool for browsing AI-agent sessions, searching across them, and
viewing resource-consumption analytics. Author started it as a Claude Code
session viewer and broadened the scope over time. Currently supports **Claude
Code, Codex, Copilot, OpenCode, Pi, and Junie**.

## Why it matters for session-digest

It occupies the same problem space as `session-digest` and the sibling
`claude-insights` project, but with a different shape:

- **Claudescope** — interactive multi-agent session *browser* + search + usage
  analytics. Breadth across agents (Claude Code, Codex, Copilot, OpenCode, Pi,
  Junie); read-and-explore UX.
- **session-digest** — non-interactive CLI that compresses one Claude Code JSONL
  session into a single structured Markdown digest (postmortem) via model
  synthesis. Depth on one agent; produce-an-artifact UX.

So it is complementary rather than a competitor: Claudescope is the live lens
over raw sessions, session-digest is the distilled writeup.

## Worth a look

- Their multi-agent session parsing (Codex / Copilot / OpenCode / Pi / Junie
  formats) is exactly the cross-agent ingestion session-digest currently does
  not have — a reference for how those on-disk session formats differ.
- Their resource/usage analytics overlaps with `claude-insights`; compare
  metrics and surface choices.
