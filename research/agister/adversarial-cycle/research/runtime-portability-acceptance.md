---
date: 2026-08-03
model: gpt-5.6
description: "Live subprocess acceptance evidence for Claude and Codex adversarial-cycle runtime portability."
status: blocked-by-claude-auth
---

# Runtime Portability Acceptance

## Claim status

The historical Phase 5 index committed as `2f94fab` is invalid and
superseded. Its host bridges ran the installed CLIs outside the production
adapters and injected the host responses into callback-only launchers. Its
native-spawn PASS cells do not prove public-entry executable portability and
must not be used as acceptance evidence.

This corrected index records subprocess evidence from the shipped
`resolve-runtime-profile.py` → `launch-runtime-agent.py` entry point. Overall
acceptance is **STOPPED** because the installed Claude CLI is not authenticated;
the Codex live path is green.

## Environment and fixture

- Date: 2026-08-03.
- Python: `Python 3.14.6`.
- Claude: `2.1.220 (Claude Code)`; `claude auth status` exited 1 with
  `{"loggedIn":false,"authMethod":"none","apiProvider":"firstParty"}`.
- Codex: `codex-cli 0.146.0`.
- Base fixture SHA: `4722055797cf9c4ea692c57b4b9e67db0a08a64e`.
- Live evidence root:
  `/private/tmp/adversarial-cycle-live.ua0QoR`.
- Codex `CODEX_HOME`: disposable
  `/private/tmp/adversarial-cycle-live.ua0QoR/codex-home` containing a copy of
  the installed auth file; the shared `~/.codex` was not written.
- Codex terminal SHA:
  `d94dfef156e2b26a941b9c63858aa4f41565b023`.
- Claude terminal SHA:
  `7b7ac59d173afeb5b14438d245fe550ef58caae0`; no implementation artifact;
  `.cycle` contains only the rejected launch evidence.

## Resolved configuration

| Host | Profile digest | Implementer | Reviewer | Access control |
|---|---|---|---|---|
| Claude | `0a3867e97131a6b8b8ef47b5605ad78be422fd8a2fb2861e2783498b8fba8694` | `sonnet` / `medium` | `opus` / `high` | Implementer `workspace-write`; Reviewer `read-only` |
| Codex | `3d0916b336f353fa18106ecc51628dc1809d59030f2ddd35ca2b2ab3d41f1c2e` | `gpt-5.6-luna` / `max`, `caller-preset` | `gpt-5.6-sol` / `high` | Implementer `workspace-write`; Reviewer `read-only` |

The Codex resolver command was:

```bash
env CODEX_HOME=/private/tmp/adversarial-cycle-live.ua0QoR/codex-home \
  PYTHONDONTWRITEBYTECODE=1 python3 \
  .claude/skills/adversarial-cycle/scripts/resolve-runtime-profile.py \
  --host codex --set implementer=luna-max
```

Its manifest recorded `gpt-5.6-luna`, `max`, `source=caller-preset`, and no
fallback field. The Claude default resolver was run through the same public
pipeline with `--host claude`.

## Verdicts

| Cell | Verdict | Falsifying evidence |
|---|---|---|
| Historical native-spawn acceptance | **INVALID / SUPERSEDED** | `2f94fab`; host-bridge wording and evidence are retained in git history, not reused |
| Claude public launch | **BLOCKED** | Claude evidence directory `claude-run/.cycle/evidence/implementer-de23dd1a4604431d9148a356a3fc3263`; subprocess exit `1`; exact CLI result says `Not logged in`; no artifact was created |
| Codex public launch with Luna Max | **PASS** | `codex-run/.cycle/evidence/implementer-76d9718f56484f8c946e54b9489bf52e`; exit `0`; argv contains `--model gpt-5.6-luna`, `model_reasoning_effort="max"`, `--sandbox workspace-write`; returned thread `019fc7c3-1e1a-70c2-bb89-cbc0394ca99e` |
| Codex cold Reviewer | **PASS** | `codex-run/.cycle/evidence/reviewer-93d2528dd9b14b568ca22d5237cd1ef4`; exit `0`; argv contains `--sandbox read-only` and no resume argument; returned thread `019fc7c4-19b4-7240-adcb-7df08caeb7e5` |
| Codex owner follow-up | **PASS** | `codex-run/.cycle/evidence/implementer-89d19ae950bb41cbb243298238de324e`; `codex exec resume` uses the Luna Max model/effort and returns the original thread ID; exit `0` |
| Codex status | **PASS** | `runtime-lifecycle.py status` exited `0` for both live IDs and returned `status=completed` with state-record paths |
| Codex cancel result | **PASS** | `runtime-lifecycle.py cancel` exited `1` with explicit `launch is already complete; cancellation is not applicable`; no silent mutation or retry |
| Codex fixture artifact | **PASS** | `artifact.txt` is exactly `runtime-portability-artifact\n`; terminal fixture commit is `d94dfef`; `git status --porcelain` is empty |
| Deterministic CLI contract | **PASS** | 18 tests, exit `0`; stub executables exercise exact argv, stdin, cwd, streams, exit status, identifier extraction, access, cold launch, no fallback, and lifecycle |
| Resolver-to-lifecycle pipe | **PASS** | `test_lifecycle_status_shouldConsumeManifestFromPipe` passes after `4024baf`; the resolver writer exits `0` while lifecycle status returns `completed` |
| Direct sandboxed Codex failure | **PASS** | `codex-run/.cycle/evidence/implementer-9d4ccd4b307540de8f202d35afef7773`; exit `1`; exact provider/network failure is preserved and no fallback launch occurs |
| Worktree hygiene | **PASS** | Both disposable fixture terminals are clean; the Claude terminal contains only the committed rejected-launch evidence and no artifact |

## Exact live launch commands

Claude implementer command, exit `1`:

```bash
env PYTHONDONTWRITEBYTECODE=1 python3 \
  .claude/skills/adversarial-cycle/scripts/resolve-runtime-profile.py \
  --host claude |
env PYTHONDONTWRITEBYTECODE=1 python3 \
  .claude/skills/adversarial-cycle/scripts/launch-runtime-agent.py \
  --manifest /dev/stdin --role implementer --review-round-spent 0 \
  --workspace /private/tmp/adversarial-cycle-live.ua0QoR/claude-run \
  --evidence-dir /private/tmp/adversarial-cycle-live.ua0QoR/claude-run/.cycle/evidence \
  --state-dir /private/tmp/adversarial-cycle-live.ua0QoR/claude-run/.cycle/state
```

Codex implementer command, escalated live run exit `0`:

```bash
env CODEX_HOME=/private/tmp/adversarial-cycle-live.ua0QoR/codex-home \
  PYTHONDONTWRITEBYTECODE=1 python3 \
  .claude/skills/adversarial-cycle/scripts/resolve-runtime-profile.py \
  --host codex --set implementer=luna-max |
env CODEX_HOME=/private/tmp/adversarial-cycle-live.ua0QoR/codex-home \
  PYTHONDONTWRITEBYTECODE=1 python3 \
  .claude/skills/adversarial-cycle/scripts/launch-runtime-agent.py \
  --manifest /dev/stdin --role implementer --review-round-spent 0 \
  --workspace /private/tmp/adversarial-cycle-live.ua0QoR/codex-run \
  --evidence-dir /private/tmp/adversarial-cycle-live.ua0QoR/codex-run/.cycle/evidence \
  --state-dir /private/tmp/adversarial-cycle-live.ua0QoR/codex-run/.cycle/state
```

The first identical Codex command without network escalation exited `1` and
is retained as the direct sandbox failure evidence; the escalated command is
the live provider PASS.

## Limitations and release rule

- Claude cannot receive a PASS until an authenticated Claude CLI session or
  `ANTHROPIC_API_KEY` is supplied and the same public-entry miniature cycle
  creates, reviews, and records the fixture artifact.
- The Codex live result proves launch, requested model/effort, permission
  mapping, returned thread identity, reviewer isolation, and owner follow-up.
- The deterministic suite proves both runtime adapters without provider calls;
  it does not convert the blocked Claude live cell into a PASS.
- The corrected task is not releasable while the overall status is
  `blocked-by-claude-auth`.
