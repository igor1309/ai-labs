# Settings architecture: preparation notes

The facts behind `index.html` (top level) and `detailed.html`, each with
its source. Paths are relative to `agister/`. Checked against trunk at
8c148634 (2026-10-06); where a call works, against ADR-025 at 57a17137
(2026-10-07).

## What settings are

- Agents, processes, policies, output contracts, permission mappings, the
  permission vocabulary and service limits are settings, changeable
  without rebuilding. Code adds only mechanisms settings cannot express:
  runtimes, input source kinds. (ADR-001 rule 2)
- The core owns what definitions mean; the store only supplies documents
  and their origin. (ADR-001 rule 2; `internal/adapters/fsdefs/fsdefs.go:414`)
- Agister runs settings; it does not judge whether they are right or safe.
  A project's settings override global ones unconditionally. (ADR-001,
  "runner, not a guard")

## The documents and what they name

The settings are a graph of documents that name each other by name.
Fields: `internal/domain/definition/documents.go:24-130`, `toml.go:25-60`,
`workflow.go:19-35`, `limits.go:11-48`. Shapes as in
`.agister/processes/implement.yaml`, `.agister/workflows/code_review.yaml`,
`~/.agister/runtimes/claude-code.yaml`, `~/.agister/service.toml`.

- **workflow** composes process calls into one run; its settings and the
  calls' records fix what each call receives, never whoever starts it
  (ADR-003 decision drivers). Has its own params and values. Its one
  shape today, "the smallest shape the one use needs: no conditions,
  loops or graphs": fan-out nodes, each a call of a process over the same
  resolved inputs, then one join node, a call of a process given the
  fan-out results. (`workflow.go:19`; ADR-003)
  - Existing workflows (`.agister/workflows/`, also in home):
    `code_review` (architecture, tests, adversarial and clarity reviews
    concurrently, then the judge) and `adr_review` (the ADR review, then
    the judge); both take a required `goal` file whose text every review
    node receives and the judge does not (ADR-023); `code_review`'s goal
    must have the `goal` brief form (ADR-026).
    (`.agister/workflows/code_review.yaml`,
    `.agister/workflows/adr_review.yaml`)
- **process** is a named agent call. It names:
  - its **agent** (`uses: agent:<name>`);
  - its **policy** (`policy: process-policy:<name>`);
  - its **output schema** (`output.schema`, JSON only);
  - its **verification**: inline, or `verify: verify:<name>` (ADR-010);
  - **prompts**, as inputs `{source: prompt, name: ...}`, maybe optional
    (ADR-014, ADR-019);
  - **skills** (`skills: [...]`, ADR-021);
  - **brief forms**, as `form: [...]` on a `file` input: its text must
    have one of them, or the call is refused before it starts (ADR-026
    rule 8). A workflow's file inputs may name them too.
  It also holds the instruction, caller params, input values (sources:
  `param`, `file`, `git.revision`, `git.merge_base`, `git.diff`,
  `git.changed_files`, `prompt`; `cmd/agister/main.go` inputs map),
  `workspace.revision`, the input HEAD must be at, `workspace.clean`, a
  fresh call needs HEAD's content (unset: `false`), required permissions,
  and limit overrides that may only narrow its policy. A process with a
  verification declares both. `workspace.checkout` is a problem, now
  `workspace.revision`; `workspace.setup` is obsolete and ignored, and
  `check` warns. (`documents.go:80-105`, `:161-270`; ADR-025 rules 2 and 3)
- **agent** is a runtime profile: it names a **runtime mapping**
  (`runtime`), and holds model, model family, effort, session mode
  (fresh-only or resumable), and **skills** it names. It carries no task
  and no permissions. (`toml.go:25`)
- **runtime mapping** (`runtimes/`): for one adapter (`claude-code`,
  `codex`, `pi`, `opencode`) and adapter contract, the efforts it accepts
  and each restriction primitive (a tool or sandbox mode) with the
  permissions it grants, verified against runtime versions.
  (`documents.go:113-130`; ADR-001 terms)
- **policy** holds execution defaults: timeout, attempts, cost cap,
  allowed and denied permissions, workspace access (read-only or
  read-write) and scope (candidate or repository), staleness limits.
  Policies speak in permissions, never in runtime primitives.
  (`limits.go:11`; ADR-001 rule 4)
  - Its `stale` block holds the limits `no_event`, `tool_command`,
    `repeated_tool_calls` and `no_output`, and `recover`:
    `max_resumes`, how many recovery turns a call may take after a turn
    ended at a staleness limit, each resuming its session with what went
    stale (unset: 0, none), and `instruction`, what the agent is told
    with the evidence, which a budget above 0 needs.
    (`limits.go:26-48`; ADR-024 rules 4 and 5)
- **service** (one): hard limits (max timeout, attempts, cost, verify
  attempts) and the permission vocabulary every policy and mapping must use;
  which permissions write, which reach Agister's state (never granted).
  (`toml.go:46`)
- **schema**: a JSON Schema a process's output must match.
- **verification**: command, timeout, max attempts, failure instruction.
  It runs in the call's worktree. `where` is obsolete and ignored, and
  `check` warns. (`documents.go:56-78`; ADR-010, ADR-025 rule 5)
- **prompt**: plain text, the file is the value. (ADR-014)
- **skill**: one `SKILL.md`. (ADR-021)
- **brief**: a brief's form: its parts in order, each a Markdown heading
  line, required or not, maybe the exact text it must read (Open:
  `None.`) or `reference: file`, a part whose first back-quoted path,
  relative to the caller's directory, must exist; and the template a
  caller copies, whose headings are the parts', in order. Agister checks
  a text's structure against it, never its meaning. The examples ship
  `goal` and `step`. (`internal/domain/definition/briefs.go`; ADR-026
  rules 3 to 5 and 8)
- **blocks** (one, repo only): agents, processes, workflows or runtime
  mappings this repo refuses, with reasons. (ADR-018)

### How permissions and limits compose

- Limits only narrow: service ⊇ policy ⊇ process ⊇ caller. Widening is
  rejected, never clamped. Denied always wins over allowed. (ADR-001 rule 3)
- `stale.recover` only narrows: a process may lower its policy's
  `max_resumes`, down to 0, and one above the policy's, or above 0 where
  the policy sets none, is invalid; the caller has no override. The
  process's `instruction`, where it gives one, replaces the policy's: it
  is text, not a limit. A budget above 0 refuses the call unless its
  agent is resumable and its runtime resumes sessions.
  (`internal/domain/policy/policy.go:250`,
  `internal/app/resolve.go:421-443`; ADR-024 rules 5 and 6)
- The enforcement plan comes from the effective permissions and the
  agent's runtime mapping: a primitive is granted only if everything it
  grants is allowed; allowed permissions no primitive provides are withheld
  and recorded, and the call is refused if the process requires them.
  (ADR-001 rule 4; `internal/domain/enforce/enforce.go:31`)

## Where they live: two layers

- **Home** (global): `$AGISTER_HOME`, else `~/.agister`, or `--home`.
  (`internal/cli/cli.go:88`, `:1283`) Home also holds live state that is
  not settings: `runs/`, `logs/`, `locks/`, `backups/`, and the runtimes'
  sessions (`codex/homes`, `pi/sessions`). (ADR-016 context;
  `cmd/agister/main.go` runtime wiring)
- **Repo** (project): `<git root>/.agister`. None outside a git repo,
  without that folder, or when it is home itself. A `.agister` that exists
  but cannot be used is an error, so project settings never silently stop
  applying. (`cmd/agister/main.go:336`)
- Agents cannot reach home; they can change a repo's `.agister` when they
  may write the repo. (ADR-001 rule 9)

## Document kinds and layout

Same layout in both layers (`internal/adapters/fsdefs/fsdefs.go:1`,
`:81`; `internal/domain/definition/definition.go:20`):

| Kind | File |
| --- | --- |
| service (singleton) | `service.toml` |
| agents | `agents/<name>.toml` |
| processes | `processes/<name>.yaml` |
| policies | `policies/<name>.yaml` |
| runtimes (adapter mappings) | `runtimes/<name>.yaml` |
| schemas (output contracts) | `schemas/<name>.json` |
| workflows | `workflows/<name>.yaml` |
| verifies | `verifies/<name>.yaml` (ADR-010) |
| prompts | `prompts/<name>.md` (ADR-014) |
| skills | `skills/<name>/SKILL.md`, the folder's only file (ADR-021) |
| briefs | `briefs/<name>.yaml` (ADR-026) |
| blocks (singleton, repo only) | `blocks.yaml` (ADR-018) |

## How the layers combine

- A repo document replaces home's of the same kind and name, whole; no
  field merging. It records which home file it overrides. Listing is the
  union of both layers. (`internal/adapters/fsdefs/fsdefs.go:414-490`)
- A document missing from both names both expected paths.
  (`fsdefs.go:461`)
- Writes from the CLI (`init`, agent create) go to home.
  (`cmd/agister/main.go:281`)
- Reuse by name instead of copying: a global process names
  `verify:repo` and prompts by name, and each repo supplies its own
  `verifies/repo.yaml` or `prompts/<name>.md`. (ADR-010 rule 5, ADR-014)
  A prompt input may be optional; missing, it is left out and the record
  says so. (ADR-019)
- Limits only narrow: service ⊇ policy ⊇ process ⊇ caller; widening is
  rejected. (ADR-001 rule 3)
- A repo can block an agent, process, workflow or runtime mapping that
  home allows, with a reason; only the repo's `blocks.yaml` counts.
  (ADR-018)

No workspace document: a `workspace.yaml`, in either layer, is obsolete
and ignored, and `check` warns (`internal/app/check.go:289`; ADR-025).

## How a call uses them

- The call reads every document once into an in-memory snapshot, checks
  it, and uses exactly what it checked. (`internal/app/snapshot.go:58`,
  `internal/app/gate.go:187`, `internal/app/resolve.go:172`)
- The call's definitions, prompts, verification, skills and brief forms
  are recorded with their digests. (ADR-010 rule 3, ADR-014 rule 3,
  ADR-021 rule 3, ADR-026 rule 8)
- A call depends on the service, its process, and what that uses: agent,
  runtime mapping, policy, schema, verification, prompts, skills, brief
  forms. A broken
  document refuses only the calls that depend on it, naming the chain.
  Only unattributable problems (service settings broken, an unreadable
  name, a name defined twice, a broken `blocks.yaml`) stop every command.
  (ADR-015, ADR-018 rule 5)
- The call works in the caller's worktree, or the one `--dir` names, with
  its settings: Agister makes no checkout or copy and runs no setup.
  Readers share the worktree; a writer, whose plan grants a `writing`
  permission or whose process has a verification, holds it alone. The
  verification runs there, and the changes stay there; `changes.patch`
  is evidence. (`internal/app/calls.go:1537-1585`,
  `internal/app/hold.go`; ADR-025)
- Skills: the call's skills (its process's and its agent's) are written
  before each turn into a folder outside the worktree, from the recorded
  bytes, and handed to the runtime the adapter's way (Claude Code plugin
  dir, Pi `--skill`, OpenCode `skills.paths`, Codex a per-thread
  `CODEX_HOME`). The runtime still loads repo and home skills of its own
  as before. (ADR-021 rules 5-7, ADR-006)

## Installing a repo's settings into home

- `agister install <dir>` merges a settings folder into home document by
  document: plan (create / replace with diff / unchanged; home-only
  documents kept), check the result in a staged copy with this binary,
  ask yes, back up to `backups/<stamp>/` with a manifest, then write each
  file atomically. The yes binds the plan: changed meanwhile, it refuses.
  (ADR-016 rules 2-5)
- `install --restore <stamp>` undoes one install; the last five backups
  are kept. Install never deletes; restore deletes only what its install
  created. (ADR-016 rules 6-8)
- Install and restore run even when settings are broken. (ADR-016 rule 9)
- Not installed: live state, `blocks.yaml`, `skills/`.
  (`internal/adapters/fsdefs/install.go:91`; ADR-018 rule 6, ADR-021)

## Who reads settings

- The CLI and the core read them through the store, layered as above.
- `agister pages` reads settings files directly, not through the client
  contract, read-only, loopback only. (ADR-009) `GET /api/settings`
  returns the repo's files and home's files; the page composes the layers
  itself, the same rule as the core: repo over home by kind and name,
  marked `repo`, `home` or `repo, replaces home`. (`pages/serve.go:94`,
  `pages/page.js:85`, `pages/README.md`)
- `GET /api/skills` is pages' one source of skills: the skills the
  settings name (each with its layer and structure checks) and, apart, the
  skills each runtime would load from repo and home folders.
  (`pages/serve.go:116`, `pages/skills.go:573`; ADR-011 as amended by
  ADR-021; LAB-62, D-16)
