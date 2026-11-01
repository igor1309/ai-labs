# The `agister` caller skill, and where home's settings come from (LAB-65, LAB-73)

An agent that drives Agister from outside (runs `agister run`, reads runs,
applies patches, acts on review rulings) has only `--help` and the README.
Write it a skill, kept in this repository, and say in the README where
home's settings and this skill come from.

## 1. The skill: `agister/skills/agister/SKILL.md`

One file, in a folder holding nothing else. Front matter: `name: agister`
and a `description` that says when to use it (setting up a repository for
Agister, running `implement`, continuing a run, applying a run's patch,
reviewing with `code_review` or `adr_review`, acting on the judge's
rulings). It is for the caller, not for an agent Agister starts (that is
ADR-021, settings skills); say so in one line.

Start from the draft at the end of this brief. It was written by an agent
while it learned Agister and is not checked. Check every claim against
the code and `agister --help` (build with `go build -o bin/agister
./cmd/agister` in `agister/`, and run `bin/agister <command> --help`):
commands, flags, defaults, exit codes, file paths, record fields. Keep,
correct or drop each; do not add claims you have not checked. Where a
claim is about home's settings rather than the binary (which processes and
workflows home has, `verify:repo` not being in home, the judge's rulings
and their fields), say it is what home's settings provide and that
`agister process list`, `agister workflow list` and `agister process show
<name>` show what is there; check the field names against
`examples/settings/` and the schemas in the code, and do not read
`~/.agister`.

Cover what LAB-73 found callers get wrong, from the README (§ continuing
a run, ADR-013):
- launch from the repository the checkout is of: `HEAD` and other
  revision defaults resolve in the directory you launch from;
- pin the candidate revision, and pin it again on `--continue`;
- `--continue <run-id>` carries the session's latest run's
  `changes.patch`, uncommitted; a `NO_CHANGES` run carries nothing;
- apply a finished run's `changes.patch` with `git apply`;
- commit the brief and what it relies on: the checkout holds only
  tracked files at the revision.

Point to `agister --help`, the README and `docs/adr/` for detail rather
than copying them. Paths: say "the Agister source" and give the README
and ADRs relative to it; do not hard-code a home directory path. Keep it
short; it is loaded into a working agent's context.

## 2. A test that keeps the skill loadable and its commands real

In the `agister` module, add a test (place it where tests of repository
files already live, or next to the CLI's tests; follow
`docs/adr/017-tests-fake-at-seams.md` and the existing test discipline
checks) that reads `skills/agister/SKILL.md` and asserts:
- the folder holds only `SKILL.md`, and its front matter passes the same
  check Agister applies to a settings skill (ADR-021 rule 1: `name`
  equals the folder's name, `description` not empty); use the existing
  validation code, not a copy of it;
- every `agister <command> [<subcommand>]` the skill names, in code
  spans and code blocks, is a command the CLI has, and every `--flag`
  written after it is a flag of that command; take both from the CLI's
  own command definitions, not from a list in the test.
It must fail when the skill names a command or flag the CLI lacks.

## 3. README: where home's settings come from

In `agister/README.md`, at the end of `## Settings` (before the
`examples/settings/` paragraph is fine), add a short paragraph or two:
- Home's prompts are kept in git in `prompts/` at the repository root
  and copied into `~/.agister/prompts/` by hand; `install` does not take
  them from there, so a changed prompt reaches home only when copied
  (LAB-84).
- Settings skills (ADR-021) go in `~/.agister/skills/` by hand too:
  `install` lists a folder's `skills/` as not settings (LAB-84).
- The caller skill: `skills/agister/SKILL.md` in this folder. It is for
  the agent that runs Agister, not a settings skill. Install it by
  linking the folder into each runtime's home skills folder:
  `ln -s "$PWD/skills/agister" ~/.claude/skills/agister` and
  `ln -s "$PWD/skills/agister" ~/.agents/skills/agister` (Codex, Pi and
  OpenCode read `~/.agents/skills`, per ADR-011's table), run from
  `agister/` in the main checkout so the link follows `trunk`. Whether
  it is published for others is LAB-85.
Match the README's style: plain sentences, no headings inside `##
Settings` beyond what is there.

## Do not

- Do not change any `AGENTS.md` or `CLAUDE.md`.
- Do not touch `~/.agister`, `~/.claude` or `~/.agents`.
- Do not change `prompts/`.

Done when the repository's verify command passes. List every file you
changed.

## Appendix: the draft (unchecked)

~~~~markdown
---
name: agister
description: Set up a repository for Agister and run work through it - scoped implement runs with an automatic verification command, then a multi-reviewer code review with a judge. Use when asked to "use agister", to implement a task from a plan via Agister, to set up `.agister/` in a repo, or to review a change with Agister's code_review workflow.
---

# Agister: setup and use

Agister (`agister`, on PATH) runs agent calls and workflows defined as
settings. Global settings: `~/.agister/` (agents, processes, policies,
prompts, schemas, runtimes, workflows, `service.toml`). A repository's
`.agister/` overrides them document by document. Runs are recorded in
`~/.agister/runs/<run-id>/`. Source and ADRs:
`~/Developer/my-apps/ai-labs/ai-labs/agister` (README, `docs/adr/`).

`agister --help` is authoritative; check it before relying on a flag here.

## What home provides (check with `agister process list`, `workflow list`)

- `implement` (Claude Code, opus): implements a brief in a fresh checkout of
  a revision; does not commit; Agister keeps the changes as a patch. Also
  `implement_codex`, `implement_pi`, `implement_pi_glm`.
- `verify:repo`: named by every implement process; runs after each turn in a
  clean copy of the checkout with the patch applied. **Not in home: each
  repository provides its own.** Without it, implement calls are refused.
- `code_review` workflow: architecture, tests, adversarial and clarity
  reviews (Codex) of `candidate` against `base`, concurrently, then a judge
  (Claude) that rules on every finding: `fix`, `defer`, `owner`, `reject`.
- `adr_review` workflow, `advisor` process.

## Set up a repository

1. **Testing command.** Make the repo's checks one shell command that passes
   on a clean checkout and needs nothing untracked. Go example:

       test -z "$(gofmt -l .)" && go vet ./... &&
       go test -count=1 -timeout 1m ./... && go test -race -count=1 -timeout 1m ./...

   Prefix `cd <dir> &&` if the module is not at the root. `go vet ./...`
   fails on a module with no packages: add at least one package (a
   `doc.go`) before the first run.
2. **`.agister/verifies/repo.yaml`:**

       schema: agister.verify/v1alpha1
       name: repo
       command: >-
         <the testing command>
       timeout: 5m
       max_attempts: 3
       instruction: >-
         The verification command failed on your changes. Fix the cause in the
         code; do not weaken, skip or delete a check or a test.

   Run the command by hand from the repo root; it must pass before you
   commit the file.
3. **`AGENTS.md` at the repo root** with the same testing command and the
   repo's hard rules. The implement instruction tells the agent to run "your
   testing command, as ... the repository's AGENTS.md describe it". The
   implementer has Bash, network and host write access on this machine, so
   anything it must never do (sudo, touching system/network state, secrets,
   editing another team's directory) belongs in AGENTS.md.
4. **Check:**

       agister check                    # must end with "settings OK"
       agister process show implement   # "plan" must list Bash, Edit, Write;
                                        # "verify" must show your command

   If `plan` shows only Read, Glob, Grep: home's `~/.agister/service.toml`
   lists `host.write` under `state_reaching`. Report it to the owner; do not
   add a project `service.toml` to work around it.
   The warning "verify runs its command with the operator's authority" is
   expected: the verify command runs code the agent wrote, as you.
5. Optional: `.agister/workspace.yaml` (`setup.command`) if a fresh checkout
   needs preparing (it may only create git-ignored files);
   `.agister/blocks.yaml` to block home's processes/agents in this repo.
6. Commit `.agister/` and `AGENTS.md` (on a branch).

## Do one task

1. **Brief**: a markdown file, e.g. `docs/briefs/<task>.md` (or `/tmp`).
   One scoped task: what to build and where, which spec/acceptance lines it
   covers, which tests to add, what not to touch, and "Done when <testing
   command> passes. List every file you changed." Name files and functions;
   the implementer starts cold.
2. **Implement** (from the repo, on the branch to build on):

       agister run implement --param brief=docs/briefs/<task>.md [--param candidate=<rev>] [--json]

   `candidate` defaults to `HEAD` of the directory you launch from; the
   checkout holds only tracked files at that revision, so commit the brief
   and anything it relies on first. Exit 0 = completed and verified.
3. **Read the result**: `agister runs show <run-id>` (JSON record: summary,
   `files_changed`, checks, verify output and `passed`, cost). Changes:
   `~/.agister/runs/<run-id>/artifacts/changes.patch` (absent when the run
   recorded `NO_CHANGES`).
4. **Apply and commit**: review the patch, then

       git apply ~/.agister/runs/<run-id>/artifacts/changes.patch
       <testing command>
       git commit

5. **Follow-up on the same session** (small corrections):

       agister run implement --continue <run-id> --param candidate=<same rev> --param brief=<fix brief>

   Pin `candidate` to the original revision; the latest run's
   `changes.patch` is carried into the new checkout uncommitted.

## Review a change

    agister run code_review --param base=<rev before the change> --param candidate=<rev>

- `base` defaults to `origin/trunk`. In a repo without that ref (no remote,
  or a different base branch), always pass `base`.
- The judge's items: `severity` (blocker/major/minor/nit), `ruling`, `reason`,
  `action`. Act on rulings:
  - `fix`: write a short brief quoting the ruling and its action, run
    implement on it, apply, commit, re-review if it was blocker/major;
  - `defer`: record it in the repo's backlog;
  - `owner`: ask the user;
  - `reject`: nothing.

## Watching and housekeeping

- `agister runs list`, `agister runs watch <run-id>`, `agister runs show <run-id>`.
- `agister pages` serves a local page of what the settings can run.
- Exit codes: 0 completed, 1 failed, 2 interrupted, 3 refused, 4 lost,
  64 usage or invalid settings, 70 internal error.
- Runs cost money (`runs show` reports `cost_usd`; a small test-only fix
  was about $0.55): one scoped brief
  per run; do not loop runs unattended.

## Rules

- Never weaken, skip or delete a check to make verify pass.
- Review settings you did not write: running Agister in a repo applies its
  `.agister/`, including the commands its agents run.
- Do not edit `~/.agister/` to fix one repo; use the repo's `.agister/`, or
  `agister install <dir>` (shows a diff, backs up, asks) for home changes.
~~~~
