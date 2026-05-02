---
date: 2026-04-24
model: claude-opus-4-6
description: "TODO: set up local deploy workflow to test frontend UI end-to-end"
---

# Local UI testing workflow

## Problem

The notio frontend currently requires a live Supabase connection to test the browse view. Login form styling can be verified via `vite dev`, but the authenticated flow (item grid, refresh, load more) cannot be tested locally without production credentials.

## Goal

Enable full UI testing locally without production Supabase.

## Options to explore

1. **Mock Supabase client** — inject a fake `BrowseItemsReader` with static data when running in dev mode
2. **Local Supabase** — use `supabase start` (Docker-based local instance) with seed data
3. **Storybook / component preview** — render individual views in isolation with fixture data

## Acceptance criteria

- A developer can run one command and see the full UI (login → browse → items) with sample data
- No production secrets required
- Works offline
