# ADR-028: Settings are layered by field

- **Status:** Proposed
- **Date:** 2026-10-09
- **Scope:** which settings layers a call reads, how a document is
  composed from the layers that hold it, and how a process names its
  prompts
- **Decision type:** Architecture
- **Supersedes:** [ADR-019](019-a-prompt-may-be-optional.md)
- **Amends:** [ADR-014](014-prompts-are-settings.md): its decision's input
  source, its driver "a document is still replaced whole" and the layers
  of rule 4;
  [ADR-018](018-a-repository-blocks-what-home-allows.md) rule 1: a
  project directory has no blocks;
  [ADR-027](027-homes-settings-have-one-source-in-git.md) rules 2, 4, 5
  and 6 and its non-decision on the Go prompts' source
- **Relates to:** [ADR-010](010-a-process-names-its-verification.md),
  [ADR-015](015-a-broken-document-refuses-only-what-uses-it.md),
  [ADR-021](021-settings-give-an-agent-its-skills.md),
  [ADR-025](025-a-call-works-where-it-is-called.md) rule 1,
  [ADR-026](026-the-brief-is-a-runs-input-contract.md)
- **Source:** LAB-164; the owner's decisions, 2026-10-09

## Context

Settings are read from two layers, document by document: a repository's
`.agister/` over home's, the nearer file replacing the other whole
(`fsdefs.Layered`; ADR-014's driver "a document is still replaced whole").
A call finds its repository layer from the root of the git worktree that
holds the directory it is launched from, or the one `--dir` names
(ADR-025 rule 1; `project` in `cmd/agister/main.go` asks git for that root
and reads `<root>/.agister`). A call launched in `warder/` therefore gets
the same settings as one launched at the root.

On trunk, 2026-10-09, this multiplies documents:

- A process names each further prompt as an input with `optional: true`
  (ADR-019): 12 such lines across 7 processes, 10 of them in six of
  home's. Adding one prompt edits every process.
- Home's processes (`agister/home/processes/`) name `go-testing-seams`
  and `go-architecture`, though home is for every repository.
- Both prompts exist in `prompts/` and again in `.agister/prompts/`, kept
  identical by a test (ADR-027 rule 5).
- A repository that needs one field different copies the document:
  `.agister/processes/implement_warder.yaml` is `implement` with another
  `verify`, and exists only for the Claude implementer. `implement_codex`
  launched for warder still runs Agister's check.
- The four `implement*` processes of home carry the same instruction
  text, four times.

## Decision drivers

- A layer says only what it changes. The rest follows the layer above,
  its later changes included.
- A project in a repository of many gets its own settings without a
  process of its own name.
- One prompt text has one file.
- Home's documents name nothing of one language or one repository.
- Which layer gave a call each field is readable before the call and on
  its record.
- The installed binary keeps running this repository's settings until
  the change's last commit (`agister/AGENTS.md`, LAB-122).

## Decision

Settings have three layers: home, the repository's `.agister/` and the
`.agister/` of the project directory the call is launched in. A document
is composed from every layer that holds it, field by field, the nearest
layer winning. A process names one `prompt` and a `guidance` list of
further prompts in place of prompt inputs; `optional: true` goes.

## Rules

### 1. Three layers, each inheriting from its parent only

A layer is a settings directory:

- **home**: `~/.agister` (`$AGISTER_HOME`, `--home`);
- **repository**: `<root>/.agister`, where `<root>` is the root of the
  git worktree that holds the launch directory;
- **project**: `<dir>/.agister`, where `<dir>` is the nearest directory
  that holds one, from the launch directory upward and below `<root>`.

The launch directory is the one the command is launched from, or the one
`--dir` names. The project layer inherits from the repository layer, and
that from home. Nothing inherits from a sibling: no `extends`, and one
project directory never reads another's.

A command launched at the root, or under no directory that holds
`.agister/`, has no project layer. Outside a git worktree only home is
read, and a repository's `.agister` that is home itself is not a layer,
both as today.

There is no fourth layer. A second `.agister/` between the project
layer's directory and the root stops every command launched there, as a
problem that cannot be attributed does (ADR-015 rule 4), naming both
directories: read, it would be a layer nobody decided; skipped, settings
would stop applying unseen.

### 2. The layers select settings, not the place of work

ADR-025 rule 1 stands. The call's directory is still `<root>`: the hold,
the clean check, the agent's working directory, the verification command
and the captured changes are the worktree's. A project layer's
verification command is therefore written from the root:
`warder/scripts/test.sh`, `cd agister && …`. A relative `source: file`
path is read from the launch directory, as today.

`check`, `process list`, `process show`, `workflow list` and `workflow
show` read the layers of their launch directory and take `--dir` as `run`
does, so what a call launched in a directory would get is read without
launching it. A continuation selects its layers where it is launched, as
a fresh call does.

### 3. The same document is the same kind and name

A document is identified across layers as today: its kind, the folder it
is in, and its name, the file's name without its extension; a singleton
by its kind alone.

```
~/.agister/processes/implement.yaml           home
<root>/.agister/processes/implement.yaml      repository
<root>/warder/.agister/processes/implement.yaml   project
```

These three are one document, `process implement`. Nothing else joins
documents: not the `name` field, not a path, not another document that
names them. A `name` a layer sets must be the file's name, as today.

### 4. A layer's document sets fields

A layer's file for a composed kind (rule 6) is one YAML mapping, or one
TOML table, holding the fields that layer sets. It need not be complete,
and it repeats nothing: `schema` and `name` are fields like any other.

The document is composed from home downward. For each nearer layer, key
by key:

- **A map merges by key, at every depth.** A key both layers hold with a
  map on both sides merges the same way. A key only the parent holds is
  kept. A key only the nearer layer holds is added, after the parent's
  keys; a key both hold keeps the parent's position. The order matters
  where the document's does: an input value refers only to values before
  it.
- **A list or a scalar replaces whole.** Lists are never joined. `[]`
  is the list that means none.
- **Unlike values replace whole.** A map over a scalar or a list, or the
  reverse, replaces it.
- **Nothing unsets.** An empty map over a map changes nothing. `null` is
  a scalar: it replaces, and the field reads it as it does today, which
  for most is a problem.

A TOML table is a map and an array a list, an array of tables included.

Home's `processes/implement.yaml`, abridged:

```yaml
schema: agister.process/v1alpha1
name: implement
type: process
uses: agent:claude-implementer-opus
policy: process-policy:implement
prompt: implement
input:
  instruction: Implement the task given as input brief, as input prompt says.
  params:
    candidate: {default: HEAD}
    brief: {}
  values:
    candidate_revision: {source: git.revision, rev: "${param.candidate}"}
    brief: {source: file, path: "${param.brief}", form: [goal, step]}
verify: verify:repo
```

A repository's `.agister/processes/implement.yaml`, whole:

```yaml
guidance: [go-testing-seams, go-architecture]
```

A project's `docs/.agister/processes/implement.yaml`, whole:

```yaml
guidance: []
input:
  params:
    candidate: {default: origin/trunk}
    ticket: {}
  values:
    brief: {form: [step]}
    ticket: {source: param, name: ticket}
```

A call of `implement` launched in `docs/` runs this document:

```yaml
schema: agister.process/v1alpha1        # home
name: implement                         # home
type: process                           # home
uses: agent:claude-implementer-opus     # home
policy: process-policy:implement        # home
prompt: implement                       # home
input:
  instruction: Implement the task …     # home
  params:
    candidate: {default: origin/trunk}  # project
    brief: {}                           # home
    ticket: {}                          # project, added last
  values:
    candidate_revision: {source: git.revision, rev: "${param.candidate}"}  # home
    brief:
      source: file                      # home
      path: "${param.brief}"            # home
      form: [step]                      # project: a list, replaced whole
    ticket: {source: param, name: ticket}  # project, added last
verify: verify:repo                     # home
guidance: []                            # project, replacing the repository's
```

Launched at the root, the same call gets the repository's `guidance` and
everything else from home. A layer that gives `verify` as a map replaces
home's scalar whole, and so holds every field of the inline block:

```yaml
verify:
  command: scripts/test.sh
  timeout: 5m
  max_attempts: 3
  instruction: Fix the cause; do not weaken a check.
```

### 5. The composed document is what is checked

Every rule a document has today is checked on the composition: required
fields, references, limits, and the rules across fields, such as `verify`
requiring `workspace.revision`. A layer's file alone need only be one
YAML or TOML document that is a map.

A problem belongs to the document, by kind and name, and refuses what
depends on it (ADR-015). It names the layer file that set the field at
fault; a required field no layer sets names every layer file read. A
layer file that cannot be read or parsed breaks the document: it is not
skipped in favour of the parent's, as ADR-015 does not skip a broken
document. A field this binary does not know is reported as today,
whichever layer sets it.

A document one layer alone holds is composed from that layer, and so must
be complete.

### 6. A prompt, a skill and a schema are taken whole

A partial makes no sense for three kinds, which stay as today: the
nearest layer that holds the document gives all of it.

- **A prompt** (`prompts/<name>.md`) and **a skill**
  (`skills/<name>/SKILL.md`) are text. A text has no fields.
- **A schema** (`schemas/<name>.json`) is an output contract. Its meaning
  lies between sibling keys (`properties` beside `required`), so a merge
  by key would give a contract that no layer wrote and no review read.

Every other kind is composed (rule 4): the service settings, agents,
processes, workflows, policies, runtime mappings, verifications and
brief forms.

### 7. Blocks and the layer document belong to one layer

Two documents say something of a layer itself and are never composed:

- `blocks.yaml` is the repository layer's alone (ADR-018 rule 1), and
  applies to every call in the worktree, wherever it is launched. A
  project layer has no blocks: its lists replace whole (rule 4), so its
  `blocks.yaml` would lift the repository's. One there stops every
  command launched there, as a broken block list does (ADR-018 rule 5).
- `layer.yaml` (rule 9) is read for its own layer only.

### 8. A process has one prompt and a guidance list

```yaml
prompt: code-review-tests
guidance: [go-testing-seams]
```

- `prompt` names one prompt document and is required: a composed process
  without it is a problem of the process.
- `guidance` lists further prompt documents, each once. In no layer, or
  `[]`, it means none.
- Both are literal names, never interpolated (ADR-014 rule 2), and each
  resolves as a prompt does today: the nearest layer that has it. A name
  no layer has is a `check` problem of the process and refuses its calls
  (ADR-014 rule 4).

The agent is given the process's `input.values` in their order, then the
prompt as the input `prompt`, then each guidance prompt, in the list's
order, as the input `guidance.<name>`. Each is resolved with the call,
recorded among its inputs and its definitions with its digest (ADR-014
rule 3), and nothing refers to its value. `input.instruction` stays, a
field like any other.

`{source: prompt}` is no longer an input source, and `optional` goes with
it. A process that holds one is a problem of the process, which names
`prompt` and `guidance`. An input value may not be named `prompt`.

### 9. A layer names the folders its prompts are also found in

A repository or project layer may hold `layer.yaml`:

```yaml
schema: agister.layer/v1alpha1
prompts:
  - prompts
```

Each entry is a folder, relative to the directory that holds the layer's
`.agister/`, here `<root>/prompts`, and inside that directory. A
`layer.yaml` that is unreadable or invalid, or that lists a folder that
does not exist or is not inside, by an absolute path, a `..` or a link
that leaves, cannot be attributed (ADR-015 rule 4): which prompts it
was meant to give cannot be known, and running anyway could give a call
the parent's prompt in place of the layer's. It stops every command
launched under that layer, as a broken block list does (ADR-018 rule 5).

The layer's prompt `<name>` is `prompts/<name>.md` in its `.agister/`,
else `<name>.md` in each listed folder, in order; the first found is that
layer's prompt, and the layer wins over its parents as any layer does.
The file's contents, unchanged, are the prompt's text, as ADR-014 rule 1
has it. A file whose name is not a document name is no prompt, as in
`prompts/` today.

A listed folder is read for a name a process gives, and is not otherwise
settings: `check` lists a prompt found there only under the process that
names it, and the folder's other files are neither checked nor shown as
unused.

Home holds no `layer.yaml`: home is one folder and names no path
(ADR-027 rule 4). One there is a problem of home's settings, and
`install` does not install one, as with `blocks.yaml` (ADR-018 rules 1
and 6).

### 10. A workflow's nodes resolve against the run's layers

A workflow run selects its layers once, from its launch directory. The
workflow document is composed from them (rule 4: `fan_out` is a list and
replaces whole, `join` is a map), and so is every node's call: its
process, agent, policy, verification, prompt and guidance. A node selects
no layer of its own. `code_review` launched in `warder/` gives each
review warder's fields.

### 11. The record names each field's layer

A call's record lists each definition with the layer files it was
composed from, nearest first. Each names its layer (`home`, `repository`
or `project`), its path, its digest and the fields it gave the
composition. A field is the path of a leaf, its keys joined by `.`; a
leaf is a scalar, a list or an empty map. A layer whose file was read
and gave nothing is listed with no fields. The record is JSON; one of
its `definitions`, written as YAML:

```yaml
kind: processes
name: implement
layers:
  - layer: project
    path: /w/docs/.agister/processes/implement.yaml
    sha256: 5c1f…
    fields:
      - guidance
      - input.params.candidate.default
      - input.params.ticket
      - input.values.brief.form
      - input.values.ticket.source
      - input.values.ticket.name
  - layer: repository
    path: /w/.agister/processes/implement.yaml
    sha256: 9a40…
    fields: []
  - layer: home
    path: /h/processes/implement.yaml
    sha256: e3b0…
    fields: [schema, name, type, uses, policy, prompt, input.instruction,
             input.params.brief, input.values.candidate_revision.source,
             input.values.candidate_revision.rev, input.values.brief.source,
             input.values.brief.path, verify]
```

A document taken whole (rule 6) has one layer and no `fields`. The
record also names the directory of each layer the call selected. The
entry's own `path`, `sha256`, `project` and `overrides`, and the record's
`absent_prompts`, are no longer written; a record that holds them reads
as before, `project` as the repository layer.

### 12. `process show` and `check --tree` show each field's layer

A layer is named `home`, `repository` or `project`, in text and in JSON.
Today's `global` becomes `home`; today's `project`, which is the
repository's `.agister/`, becomes `repository`.

`process show` prints, for the process and for each composed document its
call uses, the layer files nearest first, and every field with the layer
it came from, as rule 11 names fields. `--json` carries the same. For
the call of rule 4, launched in `docs/`:

```
sources      process implement: project /w/docs/.agister/processes/implement.yaml
                                repository /w/.agister/processes/implement.yaml
                                home /h/processes/implement.yaml
fields       process implement
               guidance                        project
               input.params.candidate.default  project
               input.params.ticket             project
               input.values.brief.form         project
               prompt                          home
               …
```

`check --tree` shows each document with its layer files, nearest first,
in place of today's one layer and `(overrides …)`. A layer other than
the farthest lists the fields it gave, so every field's layer can be
read: one not listed is the farthest layer's.

```
process implement    project    /w/docs/.agister/processes/implement.yaml
                                  guidance, input.params.ticket, …
                     repository /w/.agister/processes/implement.yaml
                                  (none)
                     home       /h/processes/implement.yaml
├─ prompt implement  home       /h/prompts/implement.md
```

The prompt and each guidance prompt stand under the process that names
them, as a prompt does today.

## Replaced and amended

- **ADR-019:** superseded whole. No input is optional. A prompt only some
  repositories have is `guidance` set by the layers that have it.
- **ADR-014:** a prompt stays a settings document, its text (rule 1),
  named literally (rule 2), resolved with the call and recorded (rule 3),
  with `source: file` unchanged (rule 5). Replaced: the input source
  `{source: prompt, name: <name>}` of its decision, by `prompt` and
  `guidance` (rule 8); its driver "no new layering rule: a document is
  still replaced whole", by rules 4 and 6; "exists in neither layer" in
  rule 4, by "in no layer". Its non-decision on prompts that include
  other prompts stands.
- **ADR-018 rule 1:** a project directory has no blocks (rule 7). The
  rest stands. Its reason against blocks in `service.toml`, that the
  repository's replaces home's whole, no longer holds; blocks stay a
  document of their own because they belong to one layer.
- **ADR-027:** `agister/home/` stays home's one source, installed as it
  says. Changed:
  - rule 2: the `implement*` processes name no Go prompt, and their
    shared instruction is the prompt `implement`;
  - rule 4: a folder process gives a fixed text as its `prompt` or its
    `guidance`;
  - rule 5: the Go prompts stay in `prompts/`, and their copies in
    `.agister/prompts/` and the test that kept them identical go
    (rule 9). Its non-decision on moving their source is closed: they do
    not move;
  - rule 6: a layer below home keeps only what is its own, now field by
    field. A document it shares with the folder by kind and name is a
    layer of that document, and is still listed with its reason in the
    repository test of rule 7, which reads every layer this repository
    has and the folders its layer documents list.
- **ADR-015 rule 1:** "the prompts its inputs name" are the process's
  prompt and guidance. **ADR-021** stands: a skill is replaced whole
  (rule 6), and a `skills` list replaces whole (rule 4).

## Migration

The installed binary reads this repository's `.agister/` from the
worktree it works in, and refuses what it does not know (LAB-122). A
layer file that sets one field is, to it, a broken whole document. So the
order is:

1. **This ADR.** No behaviour changes.
2. **The binary,** proven on temp settings of its tests: the three
   layers, the composition, `layer.yaml`, `prompt` and `guidance`, the
   refusal of `{source: prompt}`, the record, `process show`, `check
   --tree` and `--dir`. With it, what the built binary reads and the
   installed one does not: `agister/home/` and the example settings
   (`agister/examples/settings/`). Home's processes take `prompt` in
   place of their `*_prompt` input, name it so in their instructions,
   and lose the Go prompts; the four `implement*` processes share the
   new prompt `implement`; each example process gets a prompt. The
   repository tests that expect the Go prompts through `.agister/` go
   here and return in step 4. `.agister/` is not touched, except that
   `processes/implement_warder.yaml`, which the new binary refuses for
   its prompt inputs, may be removed here: a removal is nothing the
   installed binary cannot read.
3. **The done gates** of `agister/AGENTS.md`: the caller skill, the
   README, the settings diagrams and the Pages settings view with its
   tests.
4. **This repository's settings, in the change's last commit, after its
   reviews:**
   - `.agister/layer.yaml` lists `prompts`; `.agister/prompts/` goes;
   - `.agister/processes/` holds one file of `guidance` for each of the
     four `implement*` processes, `architecture_review_codex` and
     `tests_review_codex`, as every call in this repository gets the Go
     prompts today; `implement_warder.yaml` is gone;
   - `agister/.agister/verifies/repo.yaml` is Agister's check and
     `warder/.agister/verifies/repo.yaml` warder's, each complete;
     `.agister/verifies/` goes;
   - `warder/AGENTS.md` names the prompts in `prompts/`;
   - the repository tests assert this state.

   From this commit the installed binary refuses `implement` and both
   reviews in the worktree. Nothing more is run there before the deploy.
5. **The deploy.** After the merge and the rebuild
   (`scripts/finish-merged-pr.sh`), `agister install home` from
   `agister/` in the main checkout (ADR-027 rule 10), then `agister
   check` at the root, in `agister/` and in `warder/`. Between the
   rebuild and the install the new binary refuses every process of
   home, each for its prompt input; `install` runs outside the check
   (ADR-016 rule 9).

Each project fills the slot home's `implement*` processes already name,
`verify:repo` (ADR-010), in its own layer. One document then serves all
four processes, where a `verify` set on `implement` alone would leave
`implement_codex` with another check, as `implement_warder` does today.
`implement` launched at the root has no verification and is refused, as
in any repository without one (ADR-010 rule 4): this repository has many
projects and no check of its own. A change to `gokit` is launched in
`agister/`, whose check covers both modules.

A worktree branched before the change keeps its old `.agister/` until it
merges trunk. There the new binary runs `implement` with Agister's check
and no guidance, and refuses `implement_warder`.

Another repository's whole copy of a home document becomes a layer of
it: it keeps every field it sets, and now also takes each field it left
out, home's `prompt` among them. Each such repository runs `check` and
reads `process show` after the deploy.

## Consequences

- `implement_warder` goes, and every project calls `implement`, with
  `--agent` or `implement_codex` as elsewhere.
- A change to home's `implement` reaches every repository and project
  that sets only its own fields.
- A whole-document override no longer hides what it left out: a field
  home sets and the copy omits now applies. `process show` shows it.
- A layer cannot take a key away. An input value whose source it changes
  keeps the parent's other arguments, which is then a problem of the
  process; the layer declares a value of another name instead, and the
  parent's is still resolved. Unsetting is out of scope until a
  repository needs it.
- Lists are replaced, so a layer that adds one guidance prompt repeats
  the others. Adding a Go prompt edits the six files of step 4, one line
  each.
- Where a command is launched now changes what it runs. An agent whose
  working directory is inside `warder/` gets warder's settings without
  asking; `process show` there says so, and the record names the layers.
- `check` checks what a call launched there would use. A project layer
  is checked only by a `check` launched in it, or with `--dir`.
- A file in a listed folder named like one of home's prompts replaces it
  in that layer, as one in the layer's `prompts/` does.
- The layer names in output and JSON change (rule 12), and the record's
  definitions change shape (rule 11): the caller skill and Pages follow.
- Every process needs a prompt document, a one-line process included.
- Settings that use `prompt`, `guidance`, `layer.yaml` or a partial need
  a binary that knows them; an older one reports each as a problem.

## Alternatives considered

What selects the project layer:

- **A flag or param that names the project** (`--project warder`).
  Rejected: a caller that forgets it gets the repository's settings and
  a passing check of the wrong code, with nothing to show for it.
- **The files the change touches.** Rejected: an implementer's are not
  known before it runs, and a change across two projects has no one
  answer.
- **A list of projects in the repository layer.** Rejected: a registry to
  keep in step with the directories, which already say it by holding
  `.agister/`.
- **Every `.agister/` from the launch directory to the root is a
  layer.** Rejected: the owner decided three, and each further layer
  makes a field's origin harder to read.
- **The call works in the project directory.** Rejected: ADR-025 has the
  hold, the clean check and the changes on the worktree, and a change in
  one project often touches another.

How a prompt in `prompts/` is used without a copy:

- **Move the Go prompts into `.agister/prompts/`** (ADR-027's
  non-decision). Rejected: `prompts/` is the library where a prompt is
  written and versioned, for readers besides Agister, and each prompt
  that is also a setting would have to leave it.
- **A link in `.agister/prompts/` to the library file.** It works in
  today's binary. Rejected: still one entry per prompt and per layer; a
  checkout without symbolic links gives the agent the link's path as the
  prompt's text; and `install` refuses a folder that holds a link
  (ADR-016 rule 1, ADR-027 rule 9).
- **A map of prompt names to files in `layer.yaml`.** Rejected: every
  new prompt is again a line to add, which this ADR sets out to end. It
  would rule out the accidental override the folders allow.
- **The folders in the service settings.** Rejected: those are composed
  (rule 6), so a project's list would replace the repository's, and a
  relative path would lose the directory it is relative to.
- **`guidance` takes a path.** Rejected: home names no path (ADR-027
  rule 4), and a name is what lets a layer replace a prompt.

The migration:

- **The binary reads `{source: prompt}` and `optional` for one more
  release.** Rejected: the owner decided it refuses them, and home is
  brought over by one install.
- **Adopt the layers in `.agister/` with the binary.** Rejected: the
  installed binary would refuse `implement` and the reviews for the rest
  of the change (LAB-122).
- **`warder/.agister/processes/implement.yaml` sets `verify`,** as the
  issue sketched. Rejected for the slot: it needs one file per
  `implement*` process and project.

The composition:

- **Merge a schema's JSON by key.** Rejected in rule 6.
- **Join lists, or merge them by an item's key.** Rejected by the owner:
  a list then cannot be shortened, and `[]` could not mean none.
- **A layer file marks itself a partial.** Rejected: every layer file is
  one, and a complete one is only the case that sets every field.

## Explicit non-decisions

`null`, or any other way to unset a field or remove a key; `extends` or
inheritance from a sibling; guidance selected by the files a change
touches; a prompt that extends another; blocks of a project directory;
a `check` that finds and checks every project layer of a repository;
refusing a continuation launched in another directory of the worktree
than the run it continues; keeping the composed document's text with the
run; search folders for kinds other than prompts; another name for the
slot `verify:repo`; whether `input.instruction` moves into the prompt;
the wording of `process show` and `check --tree`.
