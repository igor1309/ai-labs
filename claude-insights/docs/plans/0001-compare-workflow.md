---
date: 2026-03-14
model: claude-opus-4-6
description: "Implementation plan for /compare Telegram bot command — LLM-powered week-over-week insights analysis"
---

# Plan: /compare Workflow

Worktree required: yes
Expected worktree: worktrees/claude-insights-compare
Expected branch: codex/claude-insights-compare
Preflight check: [ ] done

## Overview

Add `/compare` command to the Telegram bot that fetches all available weekly snapshots from Supabase, sends them to Claude via Nomos for narrative analysis, and responds with an LLM-generated trend summary.

Architecture: **workflow** (deterministic data fetch → LLM interpretation), not agent.

## Steps

### Step 1: Add Nomos secrets to Supabase Edge Functions

Set `NOMOS_BASE_URL` and `NOMOS_API_KEY` as Edge Function secrets.

- `NOMOS_BASE_URL=https://nomos.enoa.ai/v1`
- `NOMOS_API_KEY` — create a Nomos project for claude-insights, use its bearer token

Gate: `supabase secrets list` shows both secrets.

- [ ] done

### Step 2: Add LLM call helper to _shared

Create `supabase/functions/_shared/llm.ts`:
- `analyzeTrends(rows: object[]): Promise<string>`
- Calls `NOMOS_BASE_URL/chat/completions` with a system prompt and all rows as context
- System prompt: "Analyze Claude Code usage trends across weeks. Focus on what changed, what improved, what regressed. Be concise."
- Returns the assistant message content
- Uses `fetch()` directly (no SDK), matching Nomos convention

Gate: function compiles and exports correctly.

- [ ] done

### Step 3: Add /compare handler to telegram-bot

In `telegram-bot/index.ts`:
- Handle `/compare` command
- Fetch all rows from `claude_insights` ordered by week desc
- If < 2 rows, respond "Not enough data for comparison"
- Call `analyzeTrends(rows)` from the shared module
- Send the LLM response to Telegram

Gate: `/compare` responds with LLM-generated analysis when 2+ weeks exist.

- [ ] done

### Step 4: Deploy and verify

- Deploy `telegram-bot` with `--no-verify-jwt`
- Send `/compare` in Telegram, verify response
- Update README with `/compare` command docs

Gate: bot responds to `/compare` with trend analysis.

- [ ] done
