---
date: 2026-05-02
model: gpt-5
description: "Review findings for the Clipdeck implementation"
---

# Clipdeck Implementation Review

## Finding 1: Preserve UTF-8 When Decoding GitHub File Content

Location: `clipdeck/src/api/github.ts:61`

Priority: P1

Verdict: fail

`atob` returns a binary string, so GitHub's UTF-8 base64 payload corrupts non-ASCII Markdown before front matter stripping and copying. This violates the spec's byte-preservation rule.

Fix: decode base64 to bytes, then `new TextDecoder('utf-8').decode(bytes)`.

Test: add an API test with a body like `café\nпривет\n` and assert the returned `body` matches exactly.

## Finding 2: Count Sibling Directories When Detecting Resource-Backed Skills

Location: `clipdeck/src/api/items.ts:35-42`

Priority: P2

Verdict: fail

The handler filters skill folder contents down to `type === 'file'`, so a skill containing `SKILL.md` plus a sibling directory is passed to discovery as a one-file folder and becomes `standalone`. The spec says any additional sibling files or folders make it `resource-backed`.

Fix: preserve child entry metadata or at least sibling paths/types while only reading `SKILL.md` content.

Test: add an integration test where `dev-skills/public/example` contains `SKILL.md` and a `references` dir.

## Finding 3: Use Byte/Order Comparison for Item IDs

Location: `clipdeck/src/api/assemble.ts:24-25`

Priority: P2

Verdict: fail

`localeCompare` is locale-sensitive and does not implement the spec's lexicographic byte order. For example punctuation/case paths sort differently under `localeCompare` than plain byte/code-unit order.

Fix: use an explicit comparator such as `left.id < right.id ? -1 : left.id > right.id ? 1 : 0` for ASCII path IDs, or compare encoded UTF-8 bytes if non-ASCII IDs are allowed.

Test: add a test with `prompts/-a.md`, `prompts/.a.md`, `prompts/B.md`, and `prompts/_a.md`.
