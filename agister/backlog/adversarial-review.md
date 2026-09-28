---
date: 2026-09-28
model: claude-opus-5-5
description: "Fixes from the adversarial review of the Agister CLI Go implementation."
version: 0.1.0
---

# Backlog — adversarial review fixes

Forward tasks only. Each lands as its own commit with a regression test;
a fixed item is removed from this list.

## 9. Agent-controlled text reaches the terminal raw

`cli.describe` prints tool inputs and errors unescaped, so escape sequences
from the agent reach the terminal.

- Strip control characters from progress output.

## 10. Loose mapping checks

A primitive with `grants: []` fits every plan, so it is always granted.
`verified_versions` is a plain string prefix: `"2.1"` matches `2.10.x`.

- Require non-empty grants; require a verified-version prefix to end in `.`
  or match whole components.
