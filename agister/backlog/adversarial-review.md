---
date: 2026-09-28
model: claude-opus-5-5
description: "Fixes from the adversarial review of the Agister CLI Go implementation."
version: 0.1.0
---

# Backlog — adversarial review fixes

Forward tasks only. Each lands as its own commit with a regression test;
a fixed item is removed from this list.

## 5. SIGHUP is not handled

`main` handles SIGINT and SIGTERM only; closing the terminal orphans the
runtime and leaves the checkout, as in deferred item 1.

- Add SIGHUP to the handled signals.

## 6. Cancellation before the turn is recorded as refused

Ctrl-C during resolution or input resolution makes the version probe or git
fail, and the error becomes `refused` (or `internal`), not `cancelled`.

- Classify a failure under a cancelled context as cancelled.

## 7. A panic in change collection crashes the process

`finish` clears `collect` only after it returns; if it panics, the recover
handler calls it again and the second panic kills the process with the record
unfinished.

- Clear `collect` before calling it.

## 8. Run IDs are not validated

`fsruns` joins the ID into a path, so `--continue ../../x` or `runs show ../..`
reads any `record.json`.

- Validate run IDs like definition names.

## 9. Agent-controlled text reaches the terminal raw

`cli.describe` prints tool inputs and errors unescaped, so escape sequences
from the agent reach the terminal.

- Strip control characters from progress output.

## 10. Loose mapping checks

A primitive with `grants: []` fits every plan, so it is always granted.
`verified_versions` is a plain string prefix: `"2.1"` matches `2.10.x`.

- Require non-empty grants; require a verified-version prefix to end in `.`
  or match whole components.
