# LAB-40: the Codex example review runs under the shipped settings

## Context

`agister/examples/codex/policies/sandboxed-review.yaml` does not allow `host.read`, which Codex's read-only sandbox grants, so the example Codex review is refused ("cannot enforce the effective permissions"). The example README says so (PR #845).

## Scope

- Decide whether the example policy allows what the sandbox grants plus documents the service opt-in (as the shipped `read-only` policy does), or the example is removed.

## Acceptance

- Either the example runs on a (fake) Codex runtime with the documented opt-in, proved by a test, or it is gone with its README references.

## How

Tests are committed and deterministic; no mutation or revert checks. Use
the quiet test commands from `agister/AGENTS.md`; report each with its exit
code and final line, and list every file you changed.
