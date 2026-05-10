---
date: 2026-05-10
model: gpt-5
description: "Intent for CI-like assertions over scheduled and event-triggered automations"
---

# Automation Assertions Intent

Scheduled and event-triggered automations should be checked like CI: each automatic run emits a deterministic report, and an independent runner asserts report freshness and allowed outcomes. Logs and Telegram messages are evidence, not assertions; failures should surface through a CI-like reporting path.
