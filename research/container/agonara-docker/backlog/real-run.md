---
date: 2026-06-13
model: claude-opus-4-8
description: "Backlog ticket: run the first real agonara task through the Docker dev sandbox under strict TDD, then open a PR."
---

# Real Run: First Production agonara Task in the Docker Sandbox

## Goal

Use the proven `agonara-dev` sandbox for an actual agonara change — not a proof — to
confirm the rig holds up for day-to-day development and to make the sandbox the default
way agonara work happens.

## Context

The sandbox is built and fully validated (see `../log.md`): isolated container, private
clone, `npm install`, `npm test --workspace agonara` green (727/727), `codex` authoring +
running tests in-container, and the push + PR leg. The only thing not yet done is real
work. This ticket closes that.

## Steps

1. Pick one genuinely small, real agonara change (a backlog item or a small fix — not a
   throwaway).
2. Launch the sandbox: `./run.sh` (from `research/container/agonara-docker/`).
3. Inside: `cd ~/ai-labs`, create a feature branch (or git worktree).
4. Drive the change with `codex` (or `claude`) under the repo's **strict-TDD** discipline:
   RED (failing test that expresses the behavior) → GREEN (minimum code) → commit.
5. Verify: `npm test --workspace agonara` passes.
6. Push the branch and open a PR to `trunk` per repo convention (merge commit, auto-merge,
   delete branch).

## Acceptance criteria

- The change is a real agonara improvement, developed entirely inside the sandbox.
- At least one new/changed test expresses the behavior and the agonara suite is green.
- A PR to `trunk` exists from the sandbox-authored branch.
- Any friction hit during the run is noted back in `../log.md` (and the playbook/`run.sh`
  updated if a fix is obvious).

## Notes

- `gh`, `codex` auth and the clone persist in the `agonara-home` volume — no re-setup.
- Keep the isolation contract: no host repo bind-mount, no docker socket, no
  `--privileged` (see `../playbook.md`).
