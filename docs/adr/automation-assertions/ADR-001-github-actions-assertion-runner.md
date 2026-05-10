---
date: 2026-05-10
model: gpt-5
description: "ADR-001: use GitHub Actions as the first assertion runner for OpenClaw cron agents"
---

# ADR-001: GitHub Actions Assertion Runner for OpenClaw Cron Agents

## 1. Executive Summary
Use GitHub Actions as the CI-like assertion runner for the two OpenClaw cron agents.

## 2. Context
Cron wrappers cannot report that cron never fired. Logs, Telegram messages, and observability are evidence, not assertions.

## 3. Decision
GitHub Actions will independently assert that both OpenClaw cron agents produced fresh, deterministic, allowed outcomes.

## 4. Rules / Invariants
Both agents MUST leave machine-checkable evidence. GitHub Actions MUST assert freshness and allowed outcomes. Missing, stale, malformed, or failed evidence MUST fail the assertion run. Human notification policy MUST be explicit, reasoned, and covered by the assertion evidence.

## 5. Consequences
This gives CI-like failure reporting without new observability infrastructure. The accepted dependency is GitHub scheduled workflow reliability.

## 6. Alternatives Considered
Wrapper self-reporting cannot detect absence. A central ledger and dedicated watchdog are heavier than needed. Loki exists in this repo but is on hold and is not revived for this first layer.
