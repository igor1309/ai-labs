---
date: 2026-06-13
model: claude-opus-4-8
description: "Developer playbook for running a coding agent against agonara inside an isolated Docker container — build, run, clone, work, test, open a PR."
---

# Agonara Docker Dev Sandbox — Playbook

## What this gives you

A Linux container with Node 22, `git`, `gh`, and the `claude` and `codex` CLIs.
You run a coding agent *inside* it against a fresh clone of `ai-labs`, so the agent's
file writes, processes, and network are confined to the container — not your host.
Isolation is namespace-level (shared host kernel): adequate for solo, human-in-the-loop
dev. See [`docker-isolation-for-ai-labs.md`](../docker-isolation-for-ai-labs.md) for the
safety analysis.

## Isolation contract (do not break these)

- **No host repo bind-mount.** Clone `ai-labs` *inside* the container. Mounting the host
  checkout would let the agent reach host files — the thing the sandbox exists to prevent.
- **No `--privileged`, no docker socket.** Never pass `--privileged` or mount
  `/var/run/docker.sock` — either one is effectively host takeover.
- **Auth lives in the container, not the host.** Log in to `gh`/`claude`/`codex` *inside*
  the container; the named volume persists those credentials. Host credentials never
  enter the sandbox.
- **Run as non-root** (the image already does) and keep resource limits on.

## Quick start

```bash
./run.sh            # builds the image if missing, then opens a shell
./run.sh --build    # force a rebuild first
```

`run.sh` handles the build, the named volume, and the run flags below. The manual
equivalents follow for reference.

## One-time setup (manual)

```bash
# From this directory. Build the image.
docker build -t agonara-dev:latest .

# Create a named volume that persists the clone + tool auth across sessions.
docker volume create agonara-home
```

## Start a session (manual)

```bash
docker run -it --rm \
  --name agonara-dev \
  --memory 4g --cpus 2 --pids-limit 512 \
  -v agonara-home:/home/node \
  agonara-dev:latest
```

`--rm` discards the container on exit; the `agonara-home` volume keeps your work and
logins. Resource limits stop a runaway agent from starving the host.

## First time inside the container

```bash
# Authenticate (persisted in the volume; do this once).
# ai-labs is PRIVATE — gh auth is required before the clone will work.
gh auth login            # choose HTTPS; this also configures git credential helper
claude                   # complete Claude Code login (or export ANTHROPIC_API_KEY)
codex login              # or export OPENAI_API_KEY

# Clone the whole repo (agonara is an npm workspace member).
gh repo clone igor1309/ai-labs
cd ai-labs

# Install dependencies (root install covers the agonara workspace).
npm install
```

## Per-task loop

```bash
cd ~/ai-labs
git switch -c <feature-branch>          # or use a git worktree

# Drive the work with either agent, in the terminal:
claude                                   # interactive Claude Code
# or
codex                                    # interactive Codex

# Verify agonara before committing:
npm test --workspace agonara
#   runs: node --test tests/*.test.js && openapi:check && openapi:lint

git add -A
git commit -m "<imperative message>"
git push -u origin <feature-branch>
gh pr create --fill --base trunk
```

PR merge follows the repo convention (merge commit, auto-merge, delete branch) — run
that step from wherever you normally merge:

```bash
gh pr merge <number> --merge --auto --delete-branch
```

## Running the agonara server (optional)

Only needed if you exercise the running service rather than just tests. The server is
`node src/server.js`. If it talks to Nomos, inject **agonara's own** Nomos key as an env
var at run time (one Nomos project/key per project — do not reuse). `npm test` does not
need it.

## Teardown

```bash
exit                              # from inside the container; it is removed (--rm)
docker stop agonara-dev           # from the host; same effect (container is removed)
docker volume rm agonara-home     # only if you want to discard the clone + auth
```

## Notes / gotchas

- **`better-sqlite3`** installs via prebuilt binary for linux x64/arm64 on Node 22; if it
  ever compiles instead, the image already has `python3`/`make`/`g++`.
- **`redocly`** (used by `openapi:lint`) is an agonara devDependency; `npm install` pulls
  it. Telemetry is disabled in the script.
- **Persistence model:** git is the source of truth — push often. The volume is
  convenience, not backup.
- **Repo:** `igor1309/ai-labs` (private). `gh auth login` must succeed before cloning.
