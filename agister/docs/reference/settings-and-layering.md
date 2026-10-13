# Settings and layering

[Reference](README.md) · [Agister](../../README.md)

## Layers and validation

Global settings live in `~/.agister/` (`$AGISTER_HOME` or `--home`); a
repository's `.agister/` and the nearest project `.agister/` below the
worktree root compose over home by field ([ADR-028](../adr/028-settings-are-layered-by-field.md),
decided and implemented). The launch directory, or `--dir`, selects the
project; each layer inherits only from its parent. Maps merge by key at
every depth; lists and scalars replace whole, `[]` means none, and an
empty map over a map changes nothing. A partial sets only what it changes;
the composition is checked. Prompts, skills and schemas are taken whole
from the nearest layer. Commands check the composed settings before use.
A YAML settings file (a process,
workflow, runtime mapping, verification, brief form or
`blocks.yaml`) holds exactly one YAML document: a second, after a `---`,
even an empty one, is a problem of that file (`must hold exactly one YAML
document`), never left unread. A problem refuses only what uses
the document it is in: a call whose process, its base, agent, runtime
mapping, schema, prompt, skill or named verification is broken is refused
before its first turn and recorded, and a workflow with such a node is
refused before any node runs; everything else keeps running. Only broken
service settings, a file or a skill's folder whose name is not a name, a
settings directory that cannot be listed, or a workflow named like a
process stop every command except `init`, `install`, `check`, cancelling a
run and following an admitted run.
An invalid layer also stops commands launched under it: a second project
`.agister/` between the nearest one and the root, a project `blocks.yaml`,
or a `layer.yaml` that cannot be used (home holds none). `check` names the
layer, the path and the reason; elsewhere in the worktree it does not apply.
`check` reports every problem and says what each refuses. When a problem
names a field, a field's shape, an adapter, an input source or a schema
version this binary does not know, the check adds a line saying the
settings may need a newer binary, and `agister --version` names the binary
that is running. A field's shape this binary does not know is a list or a
mapping where it reads a scalar, such as a field of an input value. A call
or a workflow refused for such a problem prints the same line after its
summary, and its record's `result.error.unknown` counts the problems; an
install refused for such a problem prints it after the problems. A known
field with a wrong value adds no such line. Runs are
recorded under `~/.agister/runs/<id>/`.

Listings and shows display refused items. `check`, `process
list`, `process show`, `workflow list` and `workflow show` take `--dir` to
read a launch directory's layers; outside a git worktree only home is read.
`process show` lists each document's layer files nearest first, and each
leaf field's layer for each composed document, naming the base a field
came from; `--json` carries the same. `check --tree` lists those files and, under each but the
farthest, the fields it gave (`(none)` when it gave none); prompts taken
whole mark farther files `(replaced)`. A write is refused if
it adds a problem; existing document problems do not stop it.

## Additional prompt folders

A repository or project can hold `layer.yaml`, with
`schema: agister.layer/v1alpha1` and `prompts: [prompts]`: additional
folders relative to the directory holding `.agister/`, inside it, that
must exist. `.agister/prompts/<name>.md` comes first, then listed folders
in order. Only names a process gives are read there; unrelated files are
neither checked nor shown as unused. Guidance a node must follow is in
its `prompt` or `guidance`, resolved and recorded by Agister, never a
pointer in `AGENTS.md` or a skill (ADR-028 rule 13). A text the caller
names stays a `source: file` input, relative to the launch directory.

## Blocking home documents

A repository can also take away what home provides, without copying any
of home's documents: `.agister/blocks.yaml` names the processes,
workflows, agents and runtime mappings it blocks
([ADR-018](../adr/018-a-repository-blocks-what-home-allows.md)).

```yaml
schema: agister.blocks/v1alpha1
blocks:
  - ref: agent:codex-sol-61
    reason: Codex does not run in this repository
  - ref: workflow:implement_pi
```

In that repository, every workflow that depends on a blocked document,
through any chain of uses, is refused before its first turn, naming the
block's path and reason: here every workflow whose node binds
`codex-sol-61`, until a layer rebinds that node, and `implement_pi`.
`check` lists each block and what it refuses, and passes. A `blocks.yaml` that is broken or names a document
that exists nowhere stops every command, as broken service settings do;
`install` and `install --restore` still run. One in home blocks nothing
and is a problem, and `install` does not install one.

Agister is a runner, not a guard: running it in a repository applies that
repository's and project's `.agister/`, including the commands its agents
run. Review settings you did not write.
