# Deferred work

Known gaps accepted for the CLI stage. Each has a trigger: do it then, not
before.

## 1. Effects of a killed CLI wait for the next call

- **Gap:** after `agister run` is killed with SIGKILL, its runtime process
  group and checkout stay until the next submitted call reaps them.
- **Trigger:** the service (ADR-001 rule 16).
- **Done when:** the service reaps on start and periodically.
