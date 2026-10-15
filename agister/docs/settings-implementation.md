---
date: 2026-10-15
model: claude-opus-5-5
description: "Settings implementation notes: how settings files become what a run needs, step by step, and where each check sits; the owner's decisions of 2026-10-14, as ADR-011 and ADR-012 amend them"
---

# Settings: implementation notes

How settings files become what a run needs. Not an ADR: the steps and
who does what, and the packages that do them, as the owner decided them
on 2026-10-14, brought to ADR-011 and ADR-012 (2026-10-15). The
architecture is `docs/settings-architecture/`; the syntax of each kind is
specified in `settings/documents`' feature files.

## Packages

| Package | Does | Knows |
|---|---|---|
| `settings/layout` | home's folder and the launch directory → the layers found, and a snapshot | where layers are, folders and file names; no content |
| tree, a library | bytes → a value tree with origins; one tree merged over another | values and origins; no Agister word |
| `settings/documents` | a snapshot, a kind and a name → one definition, or its problems | what each kind is, and `extends` |
| `settings/resolve` | a request → what a run needs, or a refusal naming the chain | how documents name one another; blocks; plans |
| `settings/check` | handed resolve: resolves every document and reports | |

Tree is a library, not a part: decode, merge and the value type are
generic, the one vocabulary that decoding, merging and typing share, and
they are imported like the YAML parser they wrap. It lives outside the
agister module, in `gokit/tree`, so it cannot reach into a kind.

Documents answers "what is this one document": it decodes, merges the
layers, applies `extends` (the base is a lookup in the snapshot it
holds) and types. It is pure: it reads no file and imports no other
settings package; the composition maps layout's snapshot to its own.
Resolve answers "what does it reach, and can all of it be used", asking
documents for each document, and the runtime wrappers for their facts,
through ports.

## The pipeline

1. **layout**: home's folder and the launch directory → the layers
   found, a snapshot of sources, and file problems.
2. **decode**: each source's bytes → a tree with origins; blobs stay
   bytes.
3. **merge**: per document, its sources' trees → one tree, the nearest
   winning.
4. **extends**: the base's merged tree, with the extending document's
   merged tree over it.
5. **type**: a tree → a definition (`Process`, `Agent`, …), and field
   problems.
6. **resolve**: the names between definitions followed, every step
   planned → what a run needs, or a refusal naming the chain.

Only step 1 touches files. Steps 2 to 6 are pure functions over data;
step 6 asks runtime facts through a port, which the composition answers
from the wrappers.

## 1. Layout

The only step that knows files. It takes a filesystem and a worktree
root as ports, and home's folder and the launch directory as
parameters. It finds the layers (ADR-002, rule 2): home; the
repository's `.agister` at the root of the git worktree holding the
launch directory; the nearest `.agister` below that root, from the
launch directory upward. Outside a git worktree it reads home alone.
The composition answers the worktree root from git; layout knows no
git.

It knows folders and file names: the folder of each kind and the file of
each name (`processes/<name>.yaml`, `prompts/<name>.md`, …). It knows no
precedence, no content and no run.

It reads everything at once. Settings are kilobytes; reading them all is
simpler than answering requests, and can be improved when it is not.

What it gives:

```text
Snapshot: kind → name → Sources{Home, Repository, Project}
          each slot: {path, bytes}, or absent
          + blocks: the repository layer's blocks.yaml, {path, bytes},
            or absent
          + file problems, each of its document: a file that cannot be
            read, a file in a wrong place, …
          + layer problems: a layer that cannot be read at all
```

Blocks belong to the repository layer alone and are no document: they
are not merged and have no name. They are decoded like a tree and applied
by resolve.

Sources are named slots, not an ordered list: two homes, or a repository
before home, cannot be written. The path is a source's identity, its
provenance.

## 2. Decode

Two shapes of document.

- **Trees**: agents, processes, workflows, runtime mappings, briefs.
  Each source's bytes are decoded, in its kind's format (TOML, YAML), into
  a value tree: maps, lists, strings, numbers, booleans; a JSON value.
  The tree is a type of its own, not `map[string]any`: every node keeps
  the source it came from.
- **Blobs**: prompts and schemas. Not decoded, merged or typed; bytes, with
  their path and digest, taken whole from the nearest slot that holds
  one. Skills are blobs too, and left out for now (`backlog/skills.md`).

A blob is a document of its own, reached by kind and name like any other:
a prompt is shared by many processes, a repository can block it, check
lists it, and a run's record keeps its digest. Inside a tree it is only
ever a name.

A script is a prompt: the text the bash runtime is given (ADR-012,
rule 2). It is a blob like any prompt, in `prompts/<name>.md`, and a run
records its digest. Bash runs it whatever its extension; a script's own
extension is a layout decision for later, costing a lookup and a listing
across extensions and the problem of one name in two files.

## 3. Merge

Per document: the trees of its slots → one tree. Maps merge by key at
every depth; lists and scalars replace whole; nothing unsets. Every node
keeps its origin.

Precedence is merge's, stated once: project over repository over home.
The merge of two trees is generic, this tree over that one, and knows no
kind and no layer; the fold over the slots applies it twice.

## 4. Extends

`extends` is a field like any other, seen only once a document is
decoded. It is a name, looked up in the snapshot like a prompt's. The
base is merged first, then the extending document's merged tree over it,
by step 3. Only then is the document typed: a field the extending
document leaves to its base, such as its schema, comes from the base.

## 5. Type

A merged tree → a definition with typed fields, or field problems: an
unknown field, a wrong type, a missing field, a schema version not known.
What each field means is known here, and only here. Every field keeps
the origin it came from, for inspect.

The kinds:

- **workflow**: its inputs, its output contract, and its children by
  sequence, parallel, branch or bounded repetition, with bindings and
  conditions (ADR-011). A child is a step, naming a process and an
  agent, or a workflow by name.
- **process**: its prompt, guidance, inputs, environment, output schema,
  permissions, skills and limits, the prompt and schema by name.
- **agent**: its runtime mapping by name, and the model, effort and
  skills it gives. A bash agent names only the runtime.
- **runtime mapping**: what its runtime grants with no option, and its
  options, each with what it grants. Bash's offers no options.
- **brief**: a form a text input may take (ADR-010, rule 5).

Typing knows a kind's shape, not a runtime: an agent that gives a model
to bash types, and resolve refuses the agent, and every request that
reaches it.

## 6. Resolve

Follows every name from the request: a workflow's input brief forms and
its children, each step's process and agent, and each child workflow; a
process's prompt, guidance, skills, input brief forms and schema; an
agent's runtime mapping. A tree document named goes through steps 2 to
5; a blob is taken from its nearest slot, with its digest; its source
finds both, and gives a blob no layer holds as a problem. Skills are
left out for now: a skill named is followed, and refused while no layer
holds one. An agent's skills, which documents does not type yet, are
left out with them (`backlog/skills.md`).

It checks each workflow's boundaries and bindings (ADR-011, rule 6), and
plans each step: its process's permissions against its agent's runtime
mapping (ADR-003). A step that needs what its runtime cannot do, by the
runtime's facts, is refused: an output schema, a continued or recovered
session, skills, a model, an effort, a staleness limit on tool calls or
tool commands (ADR-003, rule 7; ADR-012, rule 3). Every step is resolved
and planned, those of branches a run may not take too.

A request that depends on a blocked document is refused, naming the
block; a block is not a problem, and a block naming no document is a
warning. A blocked document is not asked for, nor followed. The source
gives the blocks, each a document by kind and name, with its reason and
origin, and whether a layer holds a document; documents types the
blocks file, and its problems are problems of no document. A warning
is given with what resolves; a refusal gives none.

Resolve declares its ports in its own words (ADR-001, rule 1). Its
source gives a document by kind and name in resolve's types, each
holding only what resolve reads: the names it references, its params and
inputs, its items, their bindings and conditions, its permissions, each
with its origin: its file, its line and its place in the document.
Resolve spells no field of a document: a problem is at the origin of
what it is about, and a link of a chain at the origin of the name it
follows; only in the workflow it makes of a step does resolve give the
places. A reference is given as what it reads, not as its text: a param,
an input or a repeat's state, by name; an item's outputs, or one field
of them; an item's session; or the item of an all or any query. The
composition translates it from documents. A document resolve reads
nothing of, a brief, a prompt, a schema or a skill, is given as its
problems alone. The source also gives the problems of no document, which
refuse every request. The composition answers the source from documents.

Its facts port gives, by a runtime mapping's contract, what the runtime
wrapper can do: check output against a schema, resume a session, take
skills, take a model, the efforts it accepts, report tool calls and tool
commands (ADR-003, rule 7). The composition answers it from the
wrappers; a contract no wrapper takes is the mapping's problem. What a
process or a step needs of its runtime, and a required permission no
plan gives, is a problem of the step, at its place in its workflow, of
no document for a step requested alone; a model or an effort the runtime
does not take is its agent's. A plan's extra is its warning. How a
runtime takes its inputs, the fact ADR-003 (rule 7) names last, refuses
no step, and the port does not give it yet.

Resolve gives what a run needs (ADR-002, rule 6), and its warnings: the
workflow, requested or made of a step (ADR-013); every document it
reached, by kind and name; the definitions of the workflows, processes,
agents and runtime mappings among them, in resolve's types; and each
step's plan. A document resolve reads nothing of, the composition gives
from the same fixed snapshot, by the name resolve reached.

A refusal is every document at fault, each with its problems, or the
block that refuses it, and the first chain that reached it, in the order
the request names them; and the problems of no document, the request's
among them. A link of the chain is a document's kind and name, and where
the document before it names it.

Resolve comes in four sections, each specified, then coded: the request
and its references; boundaries and bindings; planning and runtime facts;
blocks.

Decisions of its reviews, each with its reason:

- A step requested alone is a workflow declaring the process's params
  and its inputs (ADR-013, rule 1; `request.feature`).
- The made workflow's one output, `output`, is the step's output whole:
  a workflow's outputs are named.
- A session bound from a step whose runtime keeps none is not refused:
  a case not yet met.
- A message is short, as documents' are: what must hold, or what is
  wrong. The messages stay as they are.
- A step's output field against its process's schema, and a block
  reached through `extends`, are backlogged
  (`backlog/step-output-fields.md`, `backlog/blocks-through-extends.md`).
- A reference read outside what it may read in its document alone, a
  query's item outside any query, is documents' to type
  (`backlog/references-typed-in-documents.md`).
- An agent's effort is checked against its runtime's facts (ADR-003,
  rule 7); a mapping's `efforts` is not read (`backlog/mapping-efforts.md`).

## Where each check sits

| Check | Step |
|---|---|
| a file that cannot be read, in a wrong place, or with a wrong extension or name | 1, layout |
| a layer that cannot be read | 1, layout |
| bytes that are not their format | 2, decode |
| an `extends` naming no document of its kind, or a cycle | 4, extends |
| an unknown field, a wrong type, a missing field | 5, type |
| a name that reaches no document; a blob no layer holds | 6, resolve, from its source |
| a blocked document; a block naming no document, a warning | 6, resolve |
| a binding or a condition that reads what is not there | 6, resolve |
| a param a step, a workflow item or a request gives that is not declared, or leaves out with no default | 6, resolve |
| a workflow that reaches itself | 6, resolve |
| a runtime mapping of a contract no wrapper takes | 6, resolve |
| a step its runtime cannot do; a model or effort its runtime does not take | 6, resolve |
| a required permission its mapping cannot give; a grant beyond the allowed, a warning | 6, resolve |

## Problems

A broken file is a problem of its document, not of the whole: it is kept
as data with the document, and refuses only what reaches it. A layer
that cannot be read is a problem of no document, and refuses every
request. Check shows every problem. How a run's record keeps the
problems of documents it did not use is open; they are data, so it can.
