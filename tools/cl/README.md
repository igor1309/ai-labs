---
date: 2026-09-18
model: claude-opus-5
description: "Usage notes for cl, the Claude Code launcher with quota-aware account selection."
---

# cl

Launches Claude Code on a `ccswitch`-managed account.

## Usage

```sh
cl [email|account-number] [session-id] [claude args...]

cl                          # pick the account by quota, then start claude
cl me@example.com           # switch to that account, then start claude
cl 33b61934-2a6a-...        # pick the account by quota, then resume that session
cl me@example.com <session> --model opus
```

## Behavior

- an email or account number as the first argument switches to that account with `ccswitch.sh --switch-to`
- without one, the account is picked by [`select-account.sh`](../account-rotation/select-account.sh) per [account-selection-adr.md](../account-rotation/account-selection-adr.md); it prints every account's 5h and 7d usage and reset time, the ratios, and the selected account
- a session ID (UUID) resumes that session with `claude --resume`
- remaining arguments are passed to `claude`
- if no account is eligible or the switch fails, `cl` says so and starts `claude` on the current account
- `cl` is for starting sessions; run other `claude` commands directly. In particular, `cl auth …` switches accounts first, so `cl auth logout` logs out the account that was just picked — use `claude auth …`

## Install

```sh
./install.sh     # symlinks cl.sh to ~/.local/bin/cl
./uninstall.sh
```

A `cl` function or alias in the shell profile takes precedence over the installed script; remove it.

## Test

```sh
./cl-test.sh
```
