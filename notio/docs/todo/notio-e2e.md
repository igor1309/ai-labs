---
date: 2026-04-24
model: gpt-5
description: "Todo for adding Notio backend smoke and frontend e2e coverage"
---

# Notio E2E Todo

## Goal

Add e2e coverage for Notio in layers, starting with the lowest-operational-risk production-shaped smoke checks and expanding toward full browser and Telegram flows only when their external dependencies are explicit.

## Backend Smoke

- [ ] Add `notio/scripts/e2e-smoke.sh`.
- [ ] Verify `GET https://inbox.enoa.ai/version` returns the expected deployed version.
- [ ] Verify `GET https://inbox.enoa.ai/health` returns the expected healthy response.
- [ ] Verify `POST https://inbox.enoa.ai/$NOTIO_WEBHOOK_PATH` accepts a Telegram-shaped JSON payload and returns `200 ok`.
- [ ] Wire the smoke script into `deploy-notio` after the existing deployed-version check.
- [ ] Keep the first slice free of real Telegram automation.

## Persistence Verification

- [ ] Decide whether CI may write to a dedicated Supabase test project.
- [ ] If allowed, seed a unique e2e capture message and assert it lands in `captured_items`.
- [ ] Add cleanup rules for e2e rows so repeated runs remain deterministic.
- [ ] Keep production Supabase writes out of CI unless explicitly approved.

## Frontend E2E

- [ ] Add Playwright to `notio/frontend` as the frontend-only e2e runner.
- [ ] Add `notio/frontend/playwright.config.ts`.
- [ ] Add tests under `notio/frontend/tests/e2e/`.
- [ ] Start with an unauthenticated app-shell scenario that verifies the magic-link sign-in form.
- [ ] Add an authenticated browse scenario that verifies captured items render in browse order.
- [ ] Add refresh and load-more scenarios after the basic browse path is stable.
- [ ] Prefer a mocked Supabase HTTP boundary or a dedicated test Supabase project; do not point e2e at production data by default.

## Full Telegram Flow

- [ ] Treat full Telegram automation as the last layer.
- [ ] Define required secrets before implementation: bot token, chat id, webhook path, and any read-back credentials.
- [ ] Send a real Telegram message only from a dedicated test chat.
- [ ] Verify receipt and outcome feedback timing.
- [ ] Verify persistence through the same read-back path chosen for persistence e2e.

## CI Notes

- [ ] Keep backend Swift tests in `test-notio`.
- [ ] Add frontend unit/type/build checks separately from backend Swift tests.
- [ ] Add frontend e2e only after dependency installation, browser installation, and environment requirements are documented.
- [ ] Use `python3` explicitly in any helper script that needs Python.
