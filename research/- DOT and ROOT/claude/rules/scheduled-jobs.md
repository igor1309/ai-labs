---
date: 2026-08-21
model: claude-opus-5
description: "Scheduled jobs — never write a bare cron expression; GitHub Actions cron is UTC, local time is MSK (UTC+3)"
paths:
  - ".github/workflows/**"
  - "**/.github/workflows/**"
---

# Scheduled Jobs

GitHub Actions `cron:` is always UTC. Local time here is MSK (UTC+3).

**Never write a bare cron expression.** Every one carries its local conversion on
the same line, in this form:

    - cron: "0 6 * * *"   # 09:00 MSK

For any other scheduler, establish which timezone it interprets the expression in
before writing one — do not assume UTC.
