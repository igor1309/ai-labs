---
date: 2026-06-14
model: claude-opus-4-8
description: "Implementation plan for upgrading the claude-insights weekly digest to Telegram Rich Messages (sendRichMessage, Markdown field)"
---

# Plan: Rich Message Formatting for the Weekly Digest

Worktree required: no
Expected branch: feat/claude-insights-rich-messages
Progress tracker: claude-insights/docs/plans/0002-rich-message-formatting-progress.md

## Overview

Telegram added a new **Rich Messages** API (method `sendRichMessage`, content passed
as Markdown or HTML in an `InputRichMessage`) supporting headings, tables, nested/task
lists, collapsible `<details>` blocks, footnotes, formulas, and media blocks.

The `claude-insights` weekly digest (`supabase/functions/_shared/format.ts`) currently
flattens structured data into `·`-joined strings with `<b>` pseudo-headers and sends it
via `sendMessage` + `parse_mode: HTML`. This plan upgrades it to emit **Markdown** rich
content and send it via `sendRichMessage`.

Content field choice: **`markdown`** (user preference).

## Verified API facts (source: https://core.telegram.org/bots/api)

- `POST https://api.telegram.org/bot<token>/sendRichMessage`
  - `chat_id` — required (Integer or String)
  - `rich_message` — required, type `InputRichMessage`
  - optional: `business_connection_id`, `message_thread_id`, `disable_notification`,
    `protect_content`, `allow_paid_broadcast`
- `InputRichMessage`: **exactly one** of `html` / `markdown`. Also `is_rtl`,
  `skip_entity_detection` (both optional Boolean).
- Request body for this work: `{ "chat_id": <id>, "rich_message": { "markdown": "<content>" } }`
- Rich Markdown supports: `#`–`######` headings, ordered/unordered/task lists,
  `| a | b |` tables (≤20 columns, cells inline-only), `<details>` collapsibles
  (arbitrary HTML is allowed inside Markdown), footnotes, formulas.
- Limits: 32768 UTF-8 chars · 500 blocks · 16 nesting levels · 50 media · 20 table columns.

## Test harness note

`_shared/` has **no tests today** and claude-insights is **not** covered by the root
`npm test`. These functions are Deno. This plan introduces `format.test.ts` runnable with
`deno test`, and uses `deno check` for typechecking. Test command (run from repo root):

```
deno test claude-insights/supabase/functions/_shared/format.test.ts
deno check claude-insights/supabase/functions/_shared/format.ts \
  claude-insights/supabase/functions/telegram-bot/index.ts \
  claude-insights/supabase/functions/notify-insights/index.ts
```

## Steps

Each step is TDD (RED→GREEN), ends with a targeted `deno test` run and a commit. Steps are
dependency-ordered.

### Step 1: Test scaffold + sample row helper

Create `format.test.ts` with a `makeRow()` helper returning a realistic `claude_insights`
row (keys per the `formatInsights` contract: `week`, `total_sessions`,
`total_duration_minutes`, `total_user_messages`, `lines_added`, `lines_removed`,
`total_commits`, `friction`, `satisfaction`, `goals`, `narrative_summary`). One trivial
passing assertion to prove the runner works.

Gate: `deno test format.test.ts` exits 0. Commit.

- [ ] done

### Step 2: Header as a Markdown heading

RED: assert `formatInsights(makeRow())` output contains a line matching `^# `.
GREEN: change the header line (`format.ts:17`) from `📊 <b>…</b>` to `# 📊 …`.

Gate: test passes. Commit.

- [ ] done

### Step 3: Stats as a Markdown table

RED: assert output contains a `| Metric | Value |` table with rows for sessions, duration,
messages, commits, and lines (`+added / -removed`).
GREEN: replace the `·`-joined stat lines (`format.ts:18–19`) with a Markdown table.

Gate: test passes. Commit.

- [ ] done

### Step 4: Friction / satisfaction / goals as tables

RED: for a row with each map populated, assert each section renders as a table (or nested
list) with one row per entry, sorted by count desc, preserving current top-N caps
(friction 3, goals 5, satisfaction all).
GREEN: replace the comma-joined string builders (`format.ts:22–46`) accordingly.

Gate: test passes. Commit.

- [ ] done

### Step 5: Narrative sections as headings + collapsible details

RED: for a row with `narrative_summary`, assert each section renders as `## <label>`
followed by a `<details>…</details>` wrapping the body; default `<details open>` for the
first section only.
GREEN: replace the `<blockquote>` builder (`format.ts:48–66`) with heading + `<details>`.

Gate: test passes. Commit.

- [ ] done

### Step 6: Enforce the 32768-char limit

RED: pass a `narrative_summary` longer than 32768 chars; assert output ≤ 32768 chars and
no throw.
GREEN: truncate the narrative (with an ellipsis marker) before assembly.

Gate: test passes. Commit.

- [ ] done

### Step 7: Rewire the sender to sendRichMessage (Markdown)

RED: with an injected `fetch` fake, assert the request URL ends `/sendRichMessage`, the
body has no `text`/`parse_mode` keys, and carries `rich_message.markdown` with the content.
GREEN: rename `sendTelegram` → `sendRichInsights` (or keep name, change body); POST
`{ chat_id, rich_message: { markdown } }` to `/sendRichMessage`. Keep the non-2xx throw.

Gate: test passes. Commit.

- [ ] done

### Step 8: Update callers + typecheck

Update `telegram-bot/index.ts` and `notify-insights/index.ts` to the new sender signature.

Gate: `deno check` (all three files) exits 0. `deno test` exits 0. Commit.

- [ ] done

### Step 9: PR

Push branch, open PR with `gh pr create`, enable auto-merge per repo policy
(`gh pr merge <n> --merge --auto --delete-branch`). Update `claude-insights/docs/log.md`.
On merge, move this plan to `docs/plans/implemented/`.

- [ ] done

## Definition of Done

1. **Rich send method used.** Check: `grep -c sendRichMessage claude-insights/supabase/functions/_shared/format.ts` ≥ 1 AND `grep -c parse_mode …/format.ts` → `0`. Expect: both hold.
2. **Markdown content field used.** Check: sender test inspects the request body. Expect: body contains `rich_message.markdown`, not `text` and not `html`.
3. **Header is a heading.** Check: `deno test` assertion on `formatInsights(makeRow())`. Expect: a line matches `^# `.
4. **Stats render as a table.** Check: same test. Expect: output contains `| Metric | Value |` and a row per stat.
5. **Friction/satisfaction/goals render as tables/lists.** Check: same test with maps populated. Expect: one row per entry, top-N caps preserved.
6. **Narrative is collapsible.** Check: same test with `narrative_summary`. Expect: each section wrapped in `<details>…</details>` under a `##` heading.
7. **Length limit guarded.** Check: test with >32768-char narrative. Expect: output ≤ 32768 chars, no throw.
8. **Callers compile.** Check: `deno check` on `format.ts`, `telegram-bot/index.ts`, `notify-insights/index.ts`. Expect: exit 0.
9. **Unit gate green.** Check: `deno test …/format.test.ts`. Expect: exit 0.

### Non-goals

- Notio Swift bot (`notio/backend/.../MessageSender.swift`) — separate plain-text surface, unchanged.
- Inline media, formulas, maps, collage, slideshow — not present in the digest data.
- Adding a `deno`-based CI test gate to `claude-insights-deploy.yml` — separate infra task.
- HTML content field — superseded by the Markdown preference.

### Unverifiable now

- Telegram's actual client-side rendering of the rich message — requires sending to a live
  chat with a real bot token, unavailable here. Tests verify the request we emit, not the render.
