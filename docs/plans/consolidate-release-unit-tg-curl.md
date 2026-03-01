---
date: 2026-03-01
model: claude-opus-4-6
description: "Plan to replace inline Telegram curl in release-unit.yml with shared transport"
---

# Consolidate Inline Telegram curl in release-unit.yml

GitHub issue: [#62](https://github.com/igor1309/ai-labs/issues/62)

Depends on: extract-tg-transport-to-ci-shared (must be merged first)

Governed by: `docs/adr/ci/ADR-001-telegram-transport-api.md`

## Problem

`release-unit.yml:228` has an inline curl call to Telegram's `sendMessage` API that is missing retries and has a weaker timeout (`--max-time 10`) compared to the shared transport script.

## Decision Gate

The deploy notification step runs on a VPS via SSH (`appleboy/ssh-action`), so repo scripts are not available on the remote host. Options:

1. **Inline the correct curl flags** (matching ADR-001 invariants) — simplest, mild duplication of flags but not logic. Single call site makes this acceptable.
2. **Copy the script to VPS** as part of deployment — cleaner but adds a deploy step.
3. **Run the notification from the GitHub runner** instead of the VPS — requires restructuring the step.

Status: blocked until extract-tg-transport-to-ci-shared is merged and decision gate is resolved.
