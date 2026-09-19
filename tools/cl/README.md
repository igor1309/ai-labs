---
date: 2026-09-18
model: claude-opus-5
description: "Usage notes for cl, the Claude Code launcher with quota-aware account selection."
---

# cl

Launches Claude Code on a `ccswitch`-managed account.

## Usage

```sh
cl [-y] [-f] [email|account-number] [session-id] [claude args...]

cl                          # pick the account by quota, confirm, then start claude
cl -y                       # same, without confirmation
cl -f                       # start at once on the current account, no quota query
cl me@example.com           # switch to that account, then start claude
cl 33b61934-2a6a-...        # pick the account by quota, confirm, then resume that session
cl me@example.com <session> --model opus
```

## Behavior

- an email or account number as the first argument switches to that account with `ccswitch.sh --switch-to`
- without one, the account is picked by [`select-account.sh`](../account-rotation/select-account.sh) per [account-selection-adr.md](../account-rotation/account-selection-adr.md); it prints every account's 5h and 7d usage and reset time, the ratios, and the selected account
- after quota selection, `cl` asks before switching and starting `claude`: `Switch to … and start claude? Enter to continue, any other key to cancel`. Enter continues; any other key (or Ctrl-C) exits without switching or starting `claude`. This leaves the usage list readable before `claude` takes over the terminal
- `-y` / `--yes` skips the confirmation; so does a non-terminal stdin. A given email or account number is switched to without asking, unless the switch fails. Note that `-y` still runs the quota query and still switches accounts — it only skips the keypress
- `-f` / `--fast` is the fast path: no quota query, no switch, no confirmation, so `claude` starts on the currently active account right away. Use it when you already know the account is fine and want to skip the ~2s selection. With an email or account number it only implies `-y`: that account is still switched to
- flags come before the other arguments and may be combined in either order (`cl -y -f`)
- a session ID (UUID) resumes that session with `claude --resume`; `cl` finds
  the local transcript and changes to its recorded project first, so this works
  even when `cl` is invoked from another directory
- remaining arguments are passed to `claude`
- if no account is eligible or the switch fails, `cl` says so and starts `claude` on the current account, after the same confirmation (without confirmation: after a 2-second pause)
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
