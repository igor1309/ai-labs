---
date: 2026-03-01
model: claude-opus-4-6
description: "Plan to replace inline Telegram curl in release-unit.yml with shared transport"
---

# Consolidate Inline Telegram curl in release-unit.yml

GitHub issues: [#62](https://github.com/igor1309/ai-labs/issues/62), [#61](https://github.com/igor1309/ai-labs/issues/61)

Depends on: extract-tg-transport-to-ci-shared (merged via PR #64)

Governed by: `docs/adr/ci/ADR-001-telegram-transport-api.md`

## Problem

`release-unit.yml:228` has an inline curl call to Telegram's `sendMessage` API that is missing retries and has a weaker timeout (`--max-time 10`) compared to the shared transport script.

## Decision Gate

The deploy notification step runs on a VPS via SSH (`appleboy/ssh-action`), so repo scripts are not available on the remote host. Options:

1. **Inline the correct curl flags** (matching ADR-001 invariants) — simplest, mild duplication of flags but not logic. Single call site makes this acceptable.
2. **Copy the script to VPS** as part of deployment — cleaner but adds a deploy step.
3. **Run the notification from the GitHub runner** instead of the VPS — requires restructuring the step.

**Chosen: Option 2** — the shared transport script is already extracted to `vendor/ci-shared/scripts/notify_telegram.sh`. Added it to the existing `scp-action` source list so it's copied to VPS alongside other deploy files.

## Implementation

1. Added `vendor/ci-shared/scripts/notify_telegram.sh` to the `scp-action` source list in `deploy-nomos-staging`. With `strip_components: 1`, it lands at `/tmp/nomos-deploy/ci-shared/scripts/notify_telegram.sh` on VPS.
2. Replaced inline curl in `deploy-nomos-prod` "Notify deploy success" step with: `bash /tmp/nomos-deploy/ci-shared/scripts/notify_telegram.sh "$CI_BOT_TOKEN" "$CI_CHAT_ID" "$TEXT"`

Status: implemented.
