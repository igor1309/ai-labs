---
date: 2026-09-18
model: claude-opus-5
description: "Usage notes for cx, the Codex launcher with quota-aware profile selection."
---

# cx

Launches Codex on a [`codex-mgr`](../codex-mgr/README.md) profile — the Codex counterpart of [`cl`](../cl/README.md).

## Usage

```sh
cx [-y] [email] [session-id] [codex args...]

cx                          # pick the profile by quota, confirm, then start codex
cx -y                       # same, without confirmation
cx me@example.com           # switch to that profile, then start codex
cx 019a2b3c-4d5e-...        # pick the profile by quota, confirm, then resume that session
cx me@example.com <session> --model gpt-5
```

## Behavior

- an email as the first argument switches to that profile with `codex-mgr load`
- without one, the profile is picked by [`select-account.sh --codex`](../account-rotation/select-account.sh) per [account-selection-adr.md](../account-rotation/account-selection-adr.md), from `codex-mgr limits --json`; it prints every profile's 5h and 7d usage and reset time, the ratios, and the selected profile
- after quota selection, `cx` asks before switching and starting `codex`: `Switch to … and start codex? Enter to continue, any other key to cancel`. Enter continues; any other key (or Ctrl-C) exits without switching or starting `codex`. This leaves the usage list readable before `codex` takes over the terminal
- `-y` / `--yes` (first argument only) skips the confirmation; so does a non-terminal stdin. A given email is switched to without asking, unless the switch fails
- a session ID (UUID) resumes that session with `codex resume`
- remaining arguments are passed to `codex`
- if no profile is eligible or the switch fails, `cx` says so and starts `codex` on the current profile, after the same confirmation (without confirmation: after a 2-second pause)
- `cx` is for starting sessions; run other `codex` commands directly. In particular, `cx login` / `cx logout` switch profiles first — use `codex login` / `codex logout`

## Install

```sh
./install.sh     # symlinks cx.sh to ~/.local/bin/cx
./uninstall.sh
```

A `cx` function or alias in the shell profile takes precedence over the installed script; remove it.

## Test

```sh
./cx-test.sh
```
