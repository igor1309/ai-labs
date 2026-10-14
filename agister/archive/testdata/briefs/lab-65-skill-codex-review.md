# Caller skill: fixes from the Codex review of the final skill (LAB-65)

A Codex review of `agister/skills/agister/SKILL.md` (as of 023f8271)
found the claims below wrong or over-broad. Fix each in the skill so it
says what the code does, checking the cited code yourself. Prefer
dropping a detail a caller does not need over adding qualifications.
Change only `SKILL.md`; the guard test must still pass.

Findings, as reported:

Factual claims:

- `agister/skills/agister/SKILL.md:25` — Lists say why any call would be refused. They report static problems and blocks; missing verification is only a warning and is absent from list entries. Evidence: `agister/internal/app/definitions.go:385`, `agister/internal/app/check.go:425`, `agister/internal/app/reach.go:175`.
- `agister/skills/agister/SKILL.md:47` — Verification runs “after each turn,” with failures returned to the agent. Failed/invalid turns bypass verification; verification timeouts terminate the call. Evidence: `agister/internal/app/calls.go:1010`, `agister/internal/app/verify.go:229`.
- `agister/skills/agister/SKILL.md:109` — Without `--json`, the run’s output is printed. Text output is printed only for completed runs; failed runs’ text is suppressed. Evidence: `agister/internal/cli/cli.go:600`.
- `agister/skills/agister/SKILL.md:126` — `run.passed` exists only when the verification command ran. A command-start error still produces a `CommandRun` with `error` and serialized `passed:false`. Evidence: `agister/internal/app/verify.go:390`, `agister/internal/app/verify.go:506`, `agister/internal/domain/run/attempts.go:45`.
- `agister/skills/agister/SKILL.md:134` — Every run directory holds `provider.jsonl` and `artifacts/`. These are created lazily upon raw output and artifact storage; refused runs and runs without artifacts can lack them. Evidence: `agister/internal/adapters/fsruns/fsruns.go:73`, `agister/internal/adapters/fsruns/fsruns.go:265`, `agister/internal/adapters/fsruns/fsruns.go:292`.
- `agister/skills/agister/SKILL.md:139` — Checkout runs keep their changes as a patch. Collection/storage failures emit `ARTIFACT_FAILED`; an unverified run can still complete without a patch or `NO_CHANGES`. Evidence: `agister/internal/app/calls.go:1531`, `agister/internal/app/calls_test.go:1127`.
- `agister/skills/agister/SKILL.md:160` — Continuing on another repository/revision is refused. Those checks apply only when carrying a patch; no patch returns before repository comparison, and revision checking requires a non-nil carry. Evidence: `agister/internal/app/calls.go:1445`, `agister/internal/app/calls.go:845`.

Home-specific settings: no findings.

Caller-irrelevant material:

- `agister/skills/agister/SKILL.md:16` — Directs callers to `docs/adr/`, retaining an architecture-history reference contrary to the requested caller-only scope. Caller help is embedded in `agister/internal/cli/cli.go:40` and printed by `agister/internal/cli/cli.go:314`; no ADR lookup is required.
Factual claims:

- `agister/skills/agister/SKILL.md:25` — Lists say why any call would be refused. They report static problems and blocks; missing verification is only a warning and is absent from list entries. Evidence: `agister/internal/app/definitions.go:385`, `agister/internal/app/check.go:425`, `agister/internal/app/reach.go:175`.
- `agister/skills/agister/SKILL.md:47` — Verification runs “after each turn,” with failures returned to the agent. Failed/invalid turns bypass verification; verification timeouts terminate the call. Evidence: `agister/internal/app/calls.go:1010`, `agister/internal/app/verify.go:229`.
- `agister/skills/agister/SKILL.md:109` — Without `--json`, the run’s output is printed. Text output is printed only for completed runs; failed runs’ text is suppressed. Evidence: `agister/internal/cli/cli.go:600`.
- `agister/skills/agister/SKILL.md:126` — `run.passed` exists only when the verification command ran. A command-start error still produces a `CommandRun` with `error` and serialized `passed:false`. Evidence: `agister/internal/app/verify.go:390`, `agister/internal/app/verify.go:506`, `agister/internal/domain/run/attempts.go:45`.
- `agister/skills/agister/SKILL.md:134` — Every run directory holds `provider.jsonl` and `artifacts/`. These are created lazily upon raw output and artifact storage; refused runs and runs without artifacts can lack them. Evidence: `agister/internal/adapters/fsruns/fsruns.go:73`, `agister/internal/adapters/fsruns/fsruns.go:265`, `agister/internal/adapters/fsruns/fsruns.go:292`.
- `agister/skills/agister/SKILL.md:139` — Checkout runs keep their changes as a patch. Collection/storage failures emit `ARTIFACT_FAILED`; an unverified run can still complete without a patch or `NO_CHANGES`. Evidence: `agister/internal/app/calls.go:1531`, `agister/internal/app/calls_test.go:1127`.
- `agister/skills/agister/SKILL.md:160` — Continuing on another repository/revision is refused. Those checks apply only when carrying a patch; no patch returns before repository comparison, and revision checking requires a non-nil carry. Evidence: `agister/internal/app/calls.go:1445`, `agister/internal/app/calls.go:845`.

Home-specific settings: no findings.

Caller-irrelevant material:

- `agister/skills/agister/SKILL.md:16` — Directs callers to `docs/adr/`, retaining an architecture-history reference contrary to the requested caller-only scope. Caller help is embedded in `agister/internal/cli/cli.go:40` and printed by `agister/internal/cli/cli.go:314`; no ADR lookup is required.

For the last one: drop the pointer to `docs/adr/` and keep `agister --help`
(and the README, if useful) as the reference.

Done when the repository's verify command passes. List every file you
changed.
