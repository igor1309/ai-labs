# Deferred work

Known gaps accepted for the CLI stage. Each has a trigger: do it then, not
before.

## 1. Effects of a killed CLI wait for the next call

- **Gap:** after `agister run` is killed with SIGKILL, its runtime process
  group and checkout stay until the next submitted call reaps them.
- **Trigger:** the service (ADR-001 rule 16).
- **Done when:** the service reaps on start and periodically.

## 2. A runtime's failure reason is lost

- **Gap:** when a runtime process exits non-zero, the record says only
  `exit code N`; the runtime's own reason, printed on stderr, is not kept.
  Observed 2026-09-30: four Codex reviewers failed on a 1.4 MB diff with
  "Input exceeds the maximum length of 1048576 characters", recorded as
  `runtime_error: exit code 1`; the reason took a manual rerun to find.
- **Trigger:** now; it blocks diagnosing any runtime failure.
- **Done when:** a failed call's evidence keeps a bounded tail of the
  runtime's stderr, and its error message quotes the reason.
