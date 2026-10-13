# AGENTS (agister)

What any change to Agister needs, besides the root `AGENTS.md`'s
verification rules. Issues are in the Multica project `Agister`, in the
`ai-labs` workspace.

- The full check is `agister/scripts/test.sh` (about 35 s): format, vet,
  race tests, the Pages tests and `gokit`'s check, which Agister builds
  against (ADR-019). CI and `verify:repo` run the same. Narrow it while
  working, from `agister/`, quiet (never `-v`):
  `go test -count=1 -timeout 2m ./<pkg>/...`, `-run <Test>` to narrow.
- A change to what the CLI or the settings offer, such as a command, a
  flag, a settings field or a behaviour a caller relies on, is done only
  when these say the same as the binary:
  - the caller skill, `skills/agister/SKILL.md`;
  - the page in `docs/reference/` for each topic the change touches:
    [settings and layering](docs/reference/settings-and-layering.md),
    [processes and workflows](docs/reference/processes-and-workflows.md),
    [permissions and runtimes](docs/reference/permissions-and-runtimes.md),
    [runs and records](docs/reference/runs-and-records.md),
    [the worktree and holds](docs/reference/worktree-and-holds.md),
    [skills](docs/reference/skills.md), or [home](docs/reference/home.md);
  - the settings diagrams, `docs/settings-architecture/`;
  - the Pages settings view, `pages/`, with its tests.

  Its issue names these as done gates.
- `README.md` is for orientation, `docs/reference/` for behaviour, and
  `docs/adr/` for decisions. Add behaviour detail to the reference page
  for its topic, adding a page and linking it from the reference index
  when needed. Change the README only when what it summarises changes,
  such as a new command or a new top-level concept. Link a new ADR from
  the reference page for its topic; the README links to the ADR list.
- The installed binary reads this repository's `.agister/` from the
  worktree it works in, so settings it does not know refuse every later
  run there: `--continue`, `code_review`, everything (LAB-122). A change
  that adds a settings field, or a value a field did not accept before,
  adopts it in this repository's `.agister/` only in the change's last
  commit, after its reviews, or in a later change after the deploy.
  Until then the change's tests use the field in their own temp
  settings, not through the repository's `.agister/`. A refusal of this
  repository's settings that ends `the settings may need one newer than
  agister <version>` is the sign this rule was broken: take the adoption
  out of `.agister/` until then; do not route around the refusal. The
  binary does not read `home/` from the worktree: a field adopted there
  reaches home only through an install, whose staged check refuses it
  until the installed binary knows it.
- Home's settings have one source, `home/` (ADR-027): change home's
  documents there, never in `~/.agister` or this repository's `.agister/`,
  which keeps only what is this repository's own. After a change to
  `home/`, or one that `home/` must follow, merges and
  `scripts/finish-merged-pr.sh` rebuilds Agister, install the folder
  from `agister/` in the main checkout. First run
  `scripts/retire-review-judge-codex.sh` to back up and remove any
  runtime-specific judge copies (ADR-036); then `agister install home`, read its
  plan, answer yes, and check home with the new binary (`agister check`).
  This step is the agent's, not the owner's. The exception is the
  folder's first install into home, after LAB-84 merges: it replaces
  home's hand copies, and the owner runs it (LAB-84, out of scope;
  ADR-027). Until the owner has, no agent installs the folder.
- ADRs reference only earlier ADRs.

- Runtime permissions are best effort (ADR-036): use runtimes as shipped,
  with documented options only, and no runtime-specific workarounds.
  `tools.require` and the service's `state_reaching` remain hard checks;
  extra grants and unverified versions warn. Select by distinct grants and
  persist call warnings before runtime startup and workflow node warnings as
  nodes finish for abandoned and reaped outcomes.
  Keep binding views, records and printed outcomes consistent about those
  warnings. Prompts instruct
  which evidence to use and make no claim about the environment's tools.
