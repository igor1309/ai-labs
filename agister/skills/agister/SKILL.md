---
name: agister
description: Drive Agister from outside - set up a repository for it, run an `implement` call on a brief, continue a run, apply a run's patch, review a change with the `code_review` or `adr_review` workflow and act on the judge's rulings. Use when asked to "use agister", to implement or review work through Agister, or to set up `.agister/` in a repository.
---

# Agister: the caller's guide

This skill is for the agent that runs Agister. It is not a settings skill
that Agister gives to the agents it starts (ADR-021).

Agister (`agister`, on PATH) runs agent calls and workflows that the
settings define. Home's settings are in `<home>`: the directory `--home`
selects, else `$AGISTER_HOME`, else `~/.agister/` by default. A repository's
`.agister/` takes priority over them, document by document. Each run is
recorded in `<home>/runs/<run-id>/`.
`agister --help` is authoritative, so check it before you rely on a flag.
For the details, see the Agister source: `README.md` and `docs/adr/`.

## What home provides

Processes and workflows are settings, not part of the binary. To see
what is there, run `agister process list`, `agister workflow list`,
`agister process show <name>` and `agister workflow show <name>`. Home's
settings usually have:

- `implement`, plus variants for other runtimes. It implements a brief in
  a fresh checkout of a revision. It takes the params `brief` (a file) and
  `candidate` (a revision, default `HEAD`). It does not commit: Agister
  keeps the changes as `changes.patch`.
- `verify:repo`: the process names it, and it runs after each turn on a
  clean copy of the checkout with the patch applied. A failure goes back to
  the agent in the same session. Home may not have one, so a repository
  supplies its own in `.agister/verifies/repo.yaml`. When neither has one,
  the call is refused.
- `code_review`: reviewers of `candidate` against `base`, run concurrently,
  then a judge that rules on every finding. `adr_review` does the same for
  ADRs. There is also an `advisor` process.

## Set up a repository

1. Write a testing command: one shell command that passes on a clean
   checkout and needs nothing untracked.
2. Put it in `.agister/verifies/repo.yaml`:

   ```yaml
   schema: agister.verify/v1alpha1
   name: repo
   command: <the testing command>
   timeout: 10m
   max_attempts: 3
   instruction: >-
     The verification command failed on your changes. Fix the cause in the
     code; do not weaken, skip or delete the check.
   ```

   It runs with your authority, not the agent's permissions, and it runs
   code the agent wrote.
3. Put the testing command and the repository's hard rules in `AGENTS.md`.
   The runtime loads that file in the checkout (ADR-006).
4. Run `agister check`, which ends with `settings OK` and lists warnings.
   Then run `agister process show implement`: the `plan` line lists the
   tools the agent gets, and the `verify` line shows your command.
5. Optional: `.agister/workspace.yaml` (`setup.command`) prepares a fresh
   checkout, and may only make files git ignores (ADR-012).
   `.agister/blocks.yaml` blocks home's processes, workflows or agents in
   this repository (ADR-018).
6. Commit `.agister/` and `AGENTS.md`.

## Do one task

1. Write a brief: one scoped task, which files and functions it touches,
   what tests it adds, what it must not touch, and "Done when <testing
   command> passes. List every file you changed." The implementer starts
   cold.
2. Commit the brief and everything it relies on. The checkout holds only
   the files git tracks at the revision.
3. Launch from the repository the checkout is of. `HEAD` and other
   revision defaults resolve in the directory you launch from. Pin the
   candidate revision:

   ```sh
   agister run implement --param candidate=<rev> --param brief=<file> --json
   ```

   Exit 0 means the run completed and verify passed. `--json` prints the
   result with its `run_id` and the absolute path of each artifact.
4. Read the result: `agister runs show <run-id>` prints the run's record
   as JSON. That includes its `result` (status, output, cost, artifacts)
   and its `attempts`. An attempt's `run.passed` is present only when the
   verification command ran; a stopped attempt may contain only `stopped`,
   which says why verification ended there, and no `run`.
5. Apply the patch. It is in `<home>/runs/<run-id>/artifacts/changes.patch`
   (`~/.agister/runs/...` by default).
   A run that changed nothing records `NO_CHANGES` and has no patch.

   ```sh
   git apply <home>/runs/<run-id>/artifacts/changes.patch
   ```

   Then run the testing command yourself, and commit.
6. To continue the same session with a small correction:

   ```sh
   agister run implement --continue <run-id> --param candidate=<same rev> --param brief=<file>
   ```

   Pin the candidate again, to the same revision. The session's latest
   run's `changes.patch` is carried into the new checkout, uncommitted. A
   `NO_CHANGES` run carries nothing. The new run's patch is again
   cumulative from the revision, so apply only the latest one (ADR-013).

## Review a change

```sh
agister run code_review --param base=<rev before the change> --param candidate=<rev>
```

Always pass `base`. Its default is a setting (`agister workflow show
code_review`), and it may name a ref that this repository lacks. Use
`adr_review` the same way for a change to an ADR.

The judge's items come from home's settings, so check the judge's output
schema there. In the repository that holds the Agister source,
`.agister/schemas/judgement.json` gives each item `severity` (`blocker`, `major`, `minor`, `nit`), `ruling`,
`reason`, `action` and `switching_condition`. Here is what to do for each
ruling:

- `fix`: write a fresh brief that quotes the item's `action`, run
  `implement`, apply and commit. Review again for a blocker or major item.
- `defer`: record it in the repository's deferred work. Its `action`
  gives the gap, the trigger and when it is done.
- `owner`: ask the owner. Its `action` gives the question and the options.
- `waive`, `reject`: no change. The item's `switching_condition` says what
  would change the ruling.

## Watching

- `agister runs list`, `agister runs show <run-id>`, `agister runs watch <run-id>`.
  Stopping a watch leaves the run going. Interrupting `agister run`
  cancels the run.
- Exit codes: 0 completed, 1 failed, 2 interrupted, 3 refused, 4 lost,
  64 usage or invalid settings, 70 internal error, 130 stopped watching.
- Runs cost money. `--max-cost <usd>` caps a call. Write one scoped brief
  per run, and do not loop runs unattended.

## Rules

- Never weaken, skip or delete a check to make verify pass.
- Running Agister in a repository applies that repository's `.agister/`,
  including the commands its agents run. Review settings you did not write.
- Do not edit `~/.agister/` to fix one repository. Use the repository's
  `.agister/`. For a change to home, use `agister install <dir>`, which
  shows a diff, asks before it writes and backs up what it replaces.
