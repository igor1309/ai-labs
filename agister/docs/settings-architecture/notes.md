# Settings architecture: preparation notes

The facts behind `index.html` (top level) and `detailed.html`, each with
its source. Paths are relative to `agister/`. Checked against trunk at
27e7d8b1 (2026-10-10), including the ADR-028 implementation.

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
`home/processes/implement.yaml`, `home/workflows/code_review.yaml`,
`home/runtimes/claude-code.yaml`, `home/service.toml`.

- **workflow** composes process calls into one run; its settings and the
  calls' records fix what each call receives, never whoever starts it
  (ADR-003 decision drivers). Has its own params and values. Its one
  shape today, "the smallest shape the one use needs: no conditions,
  loops or graphs": fan-out nodes, each a call of a process over the same
  resolved inputs, then one join node, a call of a process given the
  fan-out results. (`workflow.go:19`; ADR-003)
  - Existing workflows (`home/workflows/`, home's source, ADR-027):
    `code_review` (architecture, tests, adversarial, clarity and intent
    reviews concurrently, then the judge) and `adr_review` (the ADR review, then
    the judge); both take a required `goal` file whose text every review
    node receives and the judge does not (ADR-023); `code_review`'s goal
    must have the `goal` brief form (ADR-026).
    (`home/workflows/code_review.yaml`,
    `home/workflows/adr_review.yaml`)
  - The intent review (LAB-120) needed no change to the caller skill,
    the README or Pages. The skill (`skills/agister/SKILL.md`) names no
    workflow's reviews: it has the caller discover workflows from the
    settings (`agister workflow list`, `workflow show`). The README names
    the review workflows and their `goal`, not their reviews. Pages needs
    no change because it renders the configured nodes dynamically: it
    reads a workflow's `fan_out` nodes from the settings and renders each
    (`pages/config.js:286`, `pages/page.js:366`). Its existing test 'the
    settings in .agister load without errors' loads this repository's
    actual settings, so it picks up the added process and node
    automatically (`pages/tests/config.test.js:446`).
- **process** is a named agent call. It names:
  - its **agent** (`uses: agent:<name>`);
  - its **policy** (`policy: process-policy:<name>`);
  - its **output schema** (`output.schema`, JSON only);
  - its **verification**: inline, or `verify: verify:<name>` (ADR-010);
  - **prompts**, one required `prompt` and a `guidance` list, empty when
    absent or `[]`; a missing name refuses the call. `{source: prompt}`
    and `optional` are refused (ADR-028, superseding ADR-019);
  - **skills** (`skills: [...]`, ADR-021);
  - **brief forms**, as `form: [...]` on a `file` input: its text must
    have one of them, or the call is refused before it starts (ADR-026
    rule 8). A workflow's file inputs may name them too.
  It also holds the instruction, caller params, input values (sources:
  `param`, `file`, `git.revision`, `git.merge_base`, `git.diff`,
  `git.changed_files`; `cmd/agister/main.go` inputs map),
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
  permissions it grants, verified against runtime versions. A version it
  lists for no primitive is probed by the adapter, where it has a probe,
  and the probe kept in `~/.agister/probes/`, outside the settings.
  (`documents.go:113-130`; ADR-001 terms; ADR-029)
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
- A process that names no policy holds its own `workspace.access`:
  `read-write` where it sets it, read-only where it sets none. One that
  names a policy may only narrow its policy's: `read-write` over a policy
  that is read-only, or sets no access, is invalid.
  (`internal/domain/policy/policy.go`, `Compose`;
  `internal/domain/policy/policy_test.go`)
- `stale.recover` only narrows: a process may lower its policy's
  `max_resumes`, down to 0, and one above the policy's, or above 0 where
  the policy sets none, is invalid; the caller has no override. The
  process's `instruction`, where it gives one, replaces the policy's: it
  is text, not a limit. A budget above 0 refuses the call unless its
  agent is resumable and its runtime resumes sessions.
  (`internal/domain/policy/policy.go:253`,
  `internal/app/resolve.go:421-443`; ADR-024 rules 5 and 6)
- The enforcement plan comes from the effective permissions and the
  agent's runtime mapping: a primitive is granted only if everything it
  grants is allowed; allowed permissions no primitive provides are withheld
  and recorded, and the call is refused if the process requires them.
  (ADR-001 rule 4; `internal/domain/enforce/enforce.go:31`)

## Where they live: three layers

- **Home** (global): `$AGISTER_HOME`, else `~/.agister`, or `--home`.
  (`internal/cli/cli.go:88`, `:1283`) Home also holds live state that is
  not settings: `runs/`, `logs/`, `locks/`, `backups/`, and the runtimes'
  sessions (`codex/homes`, `pi/sessions`). (ADR-016 context;
  `cmd/agister/main.go` runtime wiring)
- **Repository**: `<git root>/.agister`. None outside a git repo,
  without that folder, or when it is home itself. A `.agister` that exists
  but cannot be used is an error, so project settings never silently stop
  applying. (`cmd/agister/main.go:336`)
- Agents cannot reach home; they can change a repo's `.agister` when they
  may write the repo. (ADR-001 rule 9)

- **Project**: the nearest `.agister/` from the launch directory upward,
  below the worktree root. The launch directory or `--dir` selects it;
  `check`, process and workflow list/show take `--dir` too. Nothing reads
  a sibling layer. A second `.agister/` between it and the root makes the
  project invalid, as does a project `blocks.yaml` or an unusable
  `layer.yaml`: commands launched under it are refused. (`fsdefs.Select`,
  `Layered.Layers`; `cmd/agister/layers_test.go`)

## Document kinds and layout

Same layout in all three layers (`internal/adapters/fsdefs/fsdefs.go:1`,
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
| layer (repository or project only) | `layer.yaml` (ADR-028) |

- A YAML settings file holds exactly one YAML document: a second, after
  a `---`, even an empty one, is the problem "must hold exactly one YAML
  document", never left unread; an empty file is "empty document". This
  holds for every YAML kind above: processes, policies, runtime mappings,
  workflows, verifies, briefs and `blocks.yaml`. (`parseOneYAML`,
  `internal/domain/definition/yaml.go:21`; LAB-59 for blocks, LAB-77 for
  the rest)
  - LAB-77's done gates: the README's Settings section, the caller
    skill's "What a repository provides" and both diagrams (`index.html`
    on where documents come from, `detailed.html` under "Two layers") now
    say it. Pages changed too. Its page reads the settings files with its
    own parser, which reads only `key: value` and list lines
    (`pages/config.js:119`), so a file with a `---` line already failed
    there and is shown as a file it cannot parse (`pages/page.js:308`); a
    test now holds that (`pages/tests/config.test.js`, 'YAML: a second
    document fails at its --- line'). Its server read the runtime files
    for `/api/skills` with `yaml.Unmarshal`, which takes the first
    document; it now refuses a runtime file with a second
    (`runtimeAdapters`, `pages/skills.go`), with the same problem, and
    `pages/skills_test.go` holds that. `pages/README.md`'s Settings
    section now states the one-document rule.

## How the layers combine

- Documents of the same kind and filename compose by field, home downward:
  maps merge by key at every depth; lists, scalars and unlike values
  replace whole; `[]` means none. An empty map over a map changes nothing.
  Partials need not repeat `schema` or `name`; the composition is checked.
  Prompts, skills and schemas are taken whole from the nearest layer.
  (`definition.Compose`; `fsdefs.Layered.Read`)
- A document missing from every layer names all expected paths. Broken
  files are never skipped in favour of a parent's. (`fsdefs.Layered.Read`)
- Writes from the CLI (`init`, agent create) go to home.
- A project fills `verifies/repo.yaml` in its own layer for `implement`,
  the command written from the worktree root; without it in any layer,
  that call is refused. (`cmd/agister/named_verify_test.go`)
- `layer.yaml` lists extra prompt folders relative to the directory
  holding `.agister/`, inside it and existing. Its own `prompts/` comes
  first, then listed folders in order. Only names a process gives are
  read there; unrelated files are neither checked nor shown as unused.
  Home holds no `layer.yaml`. (`fsdefs.Store.promptFolders`; ADR-028)
- A node's required guidance belongs in its `prompt` or `guidance`, never
  a pointer in `AGENTS.md` or a skill. Values precede input `prompt`, then
  `guidance.<name>` in list order, each recorded with its digest.
  (ADR-028 rule 13; `cmd/agister/prompts_test.go`)
- `process show` lists each document's layer files nearest first, and a
  fields block naming each composed document's leaf fields with their layers;
  `--json` carries the same. `check --tree` lists those files and, under
  each but the farthest, the fields it gave (`(none)` for none). Text
  documents mark farther files `(replaced)`. (`cmd/agister/layers_test.go`)
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
  - Settings newer than the binary (LAB-122) needed no change here or in
    Pages. LAB-122 adds no settings field, value or document and changes
    no composition: it marks more problems as naming something this
    binary does not know (a list or a mapping in an input value's field,
    an argument a prompt input does not take), and every refusal of those
    settings, on `check`, a call or an install, then ends with the hint
    that they may need a newer binary. That is what the binary says of a
    refusal, which the diagrams do not show: they draw the documents,
    their layers and what a call depends on, all unchanged. Pages reads
    the settings files with its own parser and never runs `check` or
    shows its problems or hints (`pages/serve.go:94`, `pages/page.js:308`
    shows only a file it cannot parse), so it has nothing to say of them.
- The call works in the caller's worktree, or the one `--dir` names, with
  its settings: Agister makes no checkout or copy and runs no setup.
  Readers share the worktree; a writer, whose plan grants a `writing`
  permission or whose process has a verification, holds it alone. The
  verification runs there, and the changes stay there; `changes.patch`
  is evidence. (`internal/app/calls.go:1537-1585`,
  `internal/app/hold.go`; ADR-025)
  - A writer's run whose owner was killed (LAB-123). A writer call whose
    hold meets an unfinished writer's run in an overlapping directory,
    whose owner lock is free, has that run reaped before it decides: the
    reaper's own per-run step adopts it, ends its effects and finishes it
    as `lost`, `abandoned`, with `EFFECTS_REAPED` in its events, and the
    call says so (`WORKTREE_RUN_REAPED`). (`internal/app/hold.go`,
    `Reaper.ReapRun` in `internal/app/reap.go`; one reaper serves this
    and the reap beside the calls, `cmd/agister/main.go`)
  - This departs from ADR-001 invariant 11, which has the reap start
    beside the next call, never inside it, and has only a continuation
    read another run, never changing its record. Here the call has one
    run reaped inside its hold: the one that keeps it from its worktree,
    and only once its owner lock says nobody owns it. Its record is
    changed by the reaper, as the reap beside the calls would change it.
    Everything else is still reaped beside the calls, and nobody waits
    for that reap. The ADR is not edited.
  - ADR-025 rule 4 and ADR-022 rule 3 hold as written. A writer's run
    that is unfinished still refuses the call: one its owner holds is
    left alone, and one the reap cannot finish stays unfinished. A run
    the reap finishes is a finished run, asked about by its processes as
    before: a process the reap left not known to have ended is asked to
    end through the same seam, and refuses the call if it cannot. A
    directory a run made before ADR-025 that Agister may still remove is
    refused first, as before, with no reap (LAB-123 question 1, with the
    owner).
  - A step of the reaper holds only the run it adopted, until it is
    finished; a step for that run waits for it, a step for another run
    does not. The reaper's turn covers only reading the runs' owner
    locks and adopting one, never the removal of a directory, which may
    run past the reap deadline: another run's cleanup does not use up a
    call's reap.
  - A reader is not an owner (LAB-123, the owner on `code_review`
    `20261007T213927Z-21fb29` item 1#1). A run's owner, and a process
    adopting it, hold its `owner.lock` alone; a status read holds it
    shared for the moment it reads the run's state, and an export for as
    long as it copies the run. Adoption refuses a lock held alone at
    once (`ErrRunOwned`), and waits for one held shared, on its own
    timer, about a second and never past the reap deadline; readers that
    still hold it then leave the run unadopted (`ErrRunRead`): an export
    still holds its run against recovery, and a writer call that meets
    it is refused, `it is being read`. The lock file and how it is held
    are unchanged, so runs recorded before read and are adopted as
    before, and an earlier build's adoption still takes any holder for an
    owner. (`fsruns.Adopter` in `internal/adapters/fsruns/fsruns.go`;
    its timer is the composition's `readers`, `cmd/agister/main.go`)
  - Done gates. The caller skill and the README changed: a refused writer
    is one whose owner still runs it, and a killed owner's run is
    finished by the call that meets it, which a reader of its state does
    not stop and an export does until it is done. `index.html` and
    `detailed.html` needed no change: LAB-123 adds no settings field,
    value or document, and its one new collaborator, the reap's timer of
    readers, is process wiring they do not draw; they draw the documents,
    their layers and what a call depends on, and say nothing of a hold, a
    refusal for a writer, a reap or the run store. The Pages settings view needed none: it shows
    settings. Its runs view needed none either: it tells a run from its
    record, `running` while its `owner.lock` is held and `lost` once
    none is, and a run the call reaped carries the same `lost` result a
    reap beside the calls records; of the events it reads only the
    skills and tool calls. (`pages/README.md`, `pages/runs.go`)
- Skills: the call's skills (its process's and its agent's) are written
  before each turn into a folder outside the worktree, from the recorded
  bytes, and handed to the runtime the adapter's way (Claude Code plugin
  dir, Pi `--skill`, OpenCode `skills.paths`, Codex a per-thread
  `CODEX_HOME`). The runtime still loads repo and home skills of its own
  as before. (ADR-021 rules 5-7, ADR-006)

## Installing settings into home

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
- Not installed: live state, `blocks.yaml`, `layer.yaml`. A skill
  (`skills/<name>/SKILL.md`) is installed as any document; a skill folder
  holding anything beside its `SKILL.md` refuses the install.
  (`internal/adapters/fsdefs/install.go`; ADR-018 rule 6, ADR-027 rules 8-9)
- Home's settings have one source in git, `home/`, installed with
  `agister install home`; the repository's `.agister/` keeps only its own
  (`layer.yaml`, the Go guidance partials). A test installs the folder into
  an empty home and checks it. (`cmd/agister/home_folder_test.go`;
  ADR-027)
- LAB-84's done gates. The caller skill, the README, these notes and
  the example captions of `detailed.html` changed. `index.html` needed
  no change: it shows the kinds and what each names, and names no
  install, no source folder and no file of this repository. The Pages
  settings view and `pages/README.md` needed none either: the page reads
  the `<home>` in use and the repo's `.agister/`, composes them and marks
  each item's layer as it finds it, so this repository's shared documents
  show as `home` without a change; it reads no source folder, shows no
  install and compares nothing (ADR-027 rule 10). Only its tests
  changed: they load `home/` alone and with `.agister/` over it.
  (`pages/serve.go`, `pages/config.js`, `pages/tests/config.test.js`)

## Who reads settings

- The CLI and the core read them through the store, layered as above.
- `agister pages` reads settings files directly, read-only, loopback only
  (ADR-009). `GET /api/settings` returns composed text and each document's
  layer files and surviving fields, using `definition.Compose`, as the
  binary does. The page renders these rather than replacing whole files.
  It selects home, repository and project from the chosen launch folder;
  a `layer.yaml` supplies only prompts the composed processes name.
  (`pages/settings.go`, `pages/config.js`, `pages/tests/config.test.js`)
- `GET /api/skills` is pages' one source of skills: the skills the
  settings name (each with its layer and structure checks) and, apart, the
  skills each runtime would load from repo and home folders.
  (`pages/serve.go:116`, `pages/skills.go:573`; ADR-011 as amended by
  ADR-021; LAB-62, D-16)

## ADR-028 and the binary

- Rule 11 says a document taken whole has one layer. The binary's store
  and show/tree metadata also name farther files, unopened, with
  `(replaced)` in the tree. Run records keep only the chosen file.
  (`fsdefs.Layered.read`; `cmd/agister/prompts_test.go`,
  `internal/app/calls.go`)
- Rule 9 describes paths with `..` as invalid. `ParseLayer` uses
  `filepath.IsLocal` and cleans a path: an internal `a/../b` that stays
  inside is accepted, while a path that escapes is refused. Folder links
  that leave are refused too. (`definition.ParseLayer`, `Store.promptFolders`)
- The ADR's status header still says Proposed at this candidate; the
  README describes its implemented decision. Guidance rule 13 states what
  settings must give a node; the binary resolves and records those fields,
  and does not audit pointers in `AGENTS.md` or skills.
