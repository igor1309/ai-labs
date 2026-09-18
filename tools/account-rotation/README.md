---
date: 2026-09-18
model: claude-opus-5
description: "Quota-aware account selection for ccswitch Claude accounts and codex-mgr Codex profiles."
---

# account-rotation

Picks the account to start the next session on, by remaining quota. Used by [`cl`](../cl/README.md) (Claude Code) and [`cx`](../cx/README.md) (Codex).

## Contents

| Path | Description |
| --- | --- |
| [`account-selection-adr.md`](account-selection-adr.md) | The selection policy: rank accounts by the pacing ratio of their most constrained quota window |
| `select-account.sh` | Implements the policy for `ccswitch` accounts or `codex-mgr` profiles |
| `select-account-test.sh` | Tests for `select-account.sh` |
| [`ccswitch-auto/`](ccswitch-auto/README.md) | Notes on the hourly `ccswitch.sh --switch` launchd job |

## Usage

```sh
./select-account.sh            # ccswitch accounts; prints the selected account number
./select-account.sh --codex    # codex-mgr profiles; prints the selected profile email
./select-account.sh --help
```

Only the selection goes to stdout, so the result can be captured:

```sh
account=$(./select-account.sh) && ccswitch.sh --switch-to "$account"
profile=$(./select-account.sh --codex) && codex-mgr load "$profile"
```

Progress goes to stderr: every account's 5h and 7d usage and reset time (or why it is skipped), the ratios of the eligible accounts best first, and the selected account.

```text
querying accounts...
account 1 a@example.com: skipped, usage_request_failed
account 2 b@example.com (active): 5h 20% used, resets 14:30 24.03; 7d 70% used, resets 00:00 28.03
account 3 c@example.com: 5h 50% used, resets 14:30 24.03; 7d 50% used, resets 00:00 28.03
account 3: ratios 1.00 / 1.00
account 2: ratios 0.60 / 1.60
selected account 3 c@example.com
```

## Selection

Per [the ADR](account-selection-adr.md):

- each window's pacing ratio is `remaining quota fraction / remaining time fraction`, with a 5h interval for the short window and 7d for the weekly one
- an account is skipped when its query failed, a window or reset time is missing or invalid, utilization is negative, or either window is at 100%
- an account is also dropped when a reset time is not in the future
- eligible accounts are ranked by the lower ratio, then the higher one, then the lower account number
- exits 1 with `Error: no eligible account` when nothing is eligible

## Sources

Both providers emit the same JSON Lines records (`account_number`, `email`, `active`, `status`, and `usage.five_hour` / `usage.seven_day` as `{utilization, resets_at}`):

- default: [`ccswitch-limits.sh --json`](../ccswitch-limits/README.md)
- `--codex`: [`codex-mgr limits --json`](../codex-mgr/README.md#limits), where `account_number` is the profile's position in list order; profiles are keyed by email, so the email is printed

For Codex, a window with no usage yet appears to report its reset a full interval from now, so its ratio is about `1.00`; in practice idle profiles tie on the 5h ratio up to a few seconds of reset time.

## Configuration

| Variable | Default |
| --- | --- |
| `SELECT_ACCOUNT_LIMITS_SCRIPT` | `../ccswitch-limits/ccswitch-limits.sh` |
| `SELECT_ACCOUNT_CODEX_MGR_SCRIPT` | `../codex-mgr/codex-mgr.sh` |
| `SELECT_ACCOUNT_NOW` | current time, epoch seconds (for tests) |

## Test

```sh
./select-account-test.sh
```

## Requirements

- POSIX `sh`, `jq`
