# AGENTS

## ADRs

- An ADR states design: parts, rules, invariants. No edge cases, no
  examples of failure, no types, no command lists.
- An edge case is a test, written with the code it tests.
- Do not dig for corner cases. Handle a case when it is met.

## The architecture

- ADR-001's rules and invariants hold; changing one is the owner's
  decision. Check every import, port and type against them.
- A claim that a part needs to break a rule to do its job is wrong.
  Find the port it should declare.
