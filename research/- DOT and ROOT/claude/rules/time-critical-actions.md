---
date: 2026-06-16
model: claude-opus-4-8
description: "Acting on state that expires — OTP, token, session, CI window: read and act in one command, never split across agent turns."
---

# Time-Critical Actions

When you act on state that expires — an OTP/SMS code, a short-lived token, a
login session, a CI/deploy window — do the **read and the act in a single
command**. Do not split "read the value" and "use the value" across separate
agent turns: a turn (model + tool latency) can be tens of seconds and may exceed
the validity window, so the value is already dead when you use it. This is a real
failure mode — an OTP read by screenshot in one turn and typed in the next
expired every time until read+type ran in one shell command.

- **State the budget first.** Before iterating, compare the validity window
  against your per-step latency. If read-then-act cannot fit, restructure into
  one step rather than retrying the slow shape.
- **Prefer a programmatic read** you can pipe straight into the action (grep a
  log, query an API, read a file) over reading a screenshot/notification with
  your own vision — vision costs a turn.
- **If you must read by vision, refresh last.** Re-fetch/re-send the value as the
  final step before acting so what you enter is fresh, and minimize steps in
  between.
- **Don't trust a stale-looking source.** A code shown "1m ago" or a countdown
  near zero is already gone — re-issue rather than spend the attempt.
