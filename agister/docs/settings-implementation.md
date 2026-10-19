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
| `settings/documents` | a snapshot, a kind and a name → one definition, or its problems; or its files, each its layer, path and digest | what each kind is, and `extends` |
| `settings/resolve` | a request → what a run needs, or a refusal naming the chain | how documents name one another; blocks; plans |
| `settings/check` | handed resolve: resolves every document and reports; lists and shows documents, each field with its layer | no kind's fields; how a source is read |

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
left out for now: a skill named is followed, and its source gives it as
a problem while no layer holds one. An agent's skills, which documents
does not type yet, are left out with them (`backlog/skills.md`).

It checks each workflow's boundaries and bindings, and each process's
own references (ADR-011, rule 6), and plans each step: its process's
permissions against its agent's runtime mapping (ADR-003). A step that
needs what its runtime cannot do, by the runtime's facts, is refused: an
output schema, a continued or recovered session, skills, a staleness
limit on tool calls or tool commands (ADR-003, rule 7; ADR-012, rule 3);
a model or an effort its runtime does not take refuses its agent
(ADR-012, rule 2). Every step is resolved and planned, those of
branches a run may not take too. A document requested alone, of any
kind, is followed; a process's own references are checked (ADR-011,
rule 6); with no agent it plans no step and meets no runtime's facts.

A request that depends on a blocked document is refused, naming the
block; a block is not a problem, and a block naming no document is a
warning. A blocked document is not asked for, nor followed. The source
gives the blocks, each a document by kind and name, with its reason and
origin, and whether a layer holds a document; documents types the
blocks file, and its problems are problems of no document. A warning
is given with what resolves; a refusal gives none.

Resolve declares its ports in its own words (ADR-001, rule 1). Its source
gives a document by kind and name in resolve's types, each holding only what
resolve reads: the names it references, its params and inputs, its items,
their bindings and conditions, a repeat's bound, its permissions, and what
it needs of a runtime: an agent's model and effort; a mapping's contract,
grants and options; a process's recovery and staleness limits; each with its
origin: its file, its line and its place in the document, which the
composition takes from documents. Resolve spells no field of a document: a
problem is at the origin of what it is about, and a link of a chain at the
origin of the name it follows; only in the workflow it makes of a step does
resolve give the places. A reference is given as what it reads, not as its
text: a param, an input or a repeat's state, by name; an item's outputs, or
one field of them; an item's session; or the item of an all or any query.
The composition translates it from documents. A document resolve reads
nothing of, a brief, a prompt, a schema or a skill, is given as its problems
alone. The source also gives the problems of no document, which refuse every
request. The composition answers the source from documents.

Its facts port gives, by a runtime mapping's contract, what the runtime
wrapper can do: check output against a schema, resume a session, take
skills, take a model, the efforts it accepts, report tool calls and tool
commands (ADR-003, rule 7; a model, ADR-012, rule 2). The composition
answers it from the wrappers; a contract no wrapper takes is the mapping's
problem. What a process or a step needs of its runtime, and a required
permission no plan gives, is a problem of the step, at its place in its
workflow, of no document for a step requested alone; a model or an effort
the runtime does not take is its agent's. A plan's extra is a warning, at
its step's place. How a runtime takes its inputs, the fact ADR-003 (rule 7)
names last, refuses no step, and the port does not give it yet.

Resolve gives what a run needs (ADR-002, rule 6), and its warnings: the
workflow, requested or made of a step (ADR-013); every document it
reached, by kind and name; the definitions of the workflows, processes,
agents and runtime mappings among them, in resolve's types; and each
step's plan. Every document reached, the composition gives whole, as
documents types it, from the same fixed snapshot, by the name resolve
reached: resolve's definitions hold only what it reads, and a run needs
all of a document, its limits and its conditions' values among them.

A refusal is the problems of no document, the source's, then the
request's; then every document at fault, each with its problems, or the
block that refuses it, and the first chain that reached it, in the order
reached. A link of the chain is a document's kind and name, and where
the document before it names it.

Resolve comes in four sections, each specified, then coded: the request
and its references; boundaries and bindings; planning and runtime facts;
blocks.

Decisions of its reviews, each with its reason:

- A step requested alone is a workflow declaring the process's params;
  its inputs are its step's, resolved once (ADR-013, rule 1, as revised
  2026-10-16; `request.feature`).
- The made workflow's one output, `output`, is the step's output whole:
  a workflow's outputs are named.
- A session bound from a step whose runtime keeps none is not refused:
  a case not yet met.
- A message is short, as documents' are: what must hold, or what is
  wrong. The messages stay as they are.
- A step's output field against its process's schema, a repeat's or a
  parallel's outputs, and a block
  reached through `extends`, are backlogged
  (`backlog/step-output-fields.md`, `backlog/blocks-through-extends.md`).
- A reference whose root its document may not read, a query's item
  outside any query, is documents' to type ("The composition").
- An agent's effort is checked against its runtime's facts (ADR-003,
  rule 7); a mapping's `efforts` is not read (`backlog/mapping-efforts.md`).

## Check

Check is handed three ports, each declared in its own words (ADR-001,
rule 1). Its names: each document a layer holds, by kind and name, with
the layers that hold it, which the composition answers from layout. Its
resolve: a document by kind and name to what resolves, its documents
reached, its plans and its warnings, or to a refusal; and the problems
of no document, which refuse every request, asked once. The composition
answers it from resolve and resolve's source, asking for a workflow as a
caller giving every param it declares, so a param with no default
refuses no document. Its fields: a document's fields, each its place,
its value as text and its source, from the document's tree as layered
and extended, so a document that does not type has its fields too, and
one that does not decode has none; the composition answers it from
documents. A source is a file, a line and the layer of the file; the
composition gives the layer from the path, in a problem, a link and a
field alike. Check spells no field of any kind: it shows the fields in
the order given.

**Check** asks for the problems of no document, and then for every
name, of every kind, alone: a document nothing uses is checked too, and
a layer that cannot be read is reported though no name is held. It
reports each fault once, in the order first met: the problems of no
document first, which refuse every request; then each document at
fault, with its problems, or the block that refuses it, and every name
it refuses, by kind and name. Each warning is given once, with every
name it came with; a refusal gives none. Then every name, by kind,
resolving or refused. Names are asked for kind by kind, in the order
workflow, process, agent, runtime, brief, prompt, schema, skill, and by
name within a kind. Check reports and does not gate (ADR-008, rule 3).

**Inspect** lists the processes, the workflows or the agents: each name,
the layers that hold it, and whether it resolves. It shows one of them:
each field, its value and its source; then what resolve gives: every
document it reached, the plan of each step and the warnings; or the
refusal, each fault with its chain. A document no layer holds is shown
as such, and resolve is not asked.

Check gives data; the command line prints it, and is the composition's.

Decisions of its reviews, each with its reason:

- A workflow is checked as if a caller gave every param it declares: a
  param no caller gives is a fault of a run's request, not of the
  settings. The composition gives the params, from documents, and its
  tests prove it; resolve is unchanged.
- The input delivery fact refuses no step, and section 6 says so; it
  needs no backlog file until a runtime takes inputs another way.
- Resolve's scenarios keep their wording: a block's chain, a refusal
  with no place, and "withheld", which `resolve.Plan` defines, are taste
  and merged; `planning.feature` is at its limit.
- Check plans no pairing of a process and an agent no workflow names: a
  step requested alone is a run's request, as a param no caller gives
  is; a workflow's steps are planned.
- A warning of a refused name is not reported: resolve gives none with
  a refusal, and check reports every problem; a warning is no problem.

## The composition

The composition, `cmd/agister`, connects the settings parts, and the
command line, to the files (ADR-001, rule 3). It comes in four sections,
each specified, then coded: what documents adds; the wrappers; the
adapters; the command line.

**What documents adds.** A reference is typed whole, in a workflow and a
process alike: `params` and `inputs` read a name; `state` a name, or one
field of it; `steps.<name>` the item's outputs, one field of them, or
its session; `item` the item of an all or any query, or one field of it.
A reference that is none of these, or reads a root its place may not
read, is a problem at typing, naming the roots its place reads; so is
`item` read outside an all or any query's `where`. Each reference has
its place, a condition's operands each theirs, spelled as a problem's
place is. The repository's blocks file is typed: a list, each block one
kind among the kinds with its document's name, and its reason, a text;
its problems are problems of no document. A block naming no document is
resolve's warning; whether its name is a name is not documents' to say.

**The wrappers.** Each runtime wrapper, `runtime/<name>`, gives its
contract and what it can do (ADR-003, rule 7), in its own types: check
output against a schema, resume a session, take skills, take a model,
the efforts it accepts, report tool calls and tool commands. The
wrappers are claude-code, codex, pi and bash, as home's runtime mappings
name them; each gives its facts alone until it runs its program, and a
runtime is added when met. `git` gives the root of the git worktree that
holds a directory, spelled as the directory was asked, so layout's walk
up from it meets the root; or none outside one; `files` is the operating
system's filesystem: a folder's entries, each with what it is, and a
file's bytes. Each wrapper has its own types. `git` and `files` are
tested against their real things (ADR-009, rule 3); a runtime wrapper's
facts touch none.

**The adapters.** The composition maps layout's snapshot to documents',
and answers resolve's source from documents: each definition in
resolve's types, each value with its origin and the place documents
gives it, building none; a reference as what it reads; the problems of
no document, layout's and the blocks file's; the blocks; whether a layer
holds a document. It answers resolve's wrappers from the runtime facts,
by contract, a contract no wrapper takes being none; layout's filesystem
from `files`, and its worktree root from `git`; the launch directory
with its links resolved, by `files`, so that layout's walk up and git's
root are of one path; check's names from layout's snapshot; check's
resolve from resolve, giving a workflow every param it declares; and
check's fields from documents' tree, each leaf with its file, its line
and the layer of its file. Every answer comes from one snapshot, which
layout reads once a command. Its tests give spies in place of the
wrappers (ADR-009, rule 4): a filesystem holding home's files as Agister
ships them, a git and the facts.

**The command line.** `cli` turns `check` and `inspect` into requests on
its port, and prints what the port gives; the composition answers the
port from check. It is given its arguments, its working directory and
its output streams; a write that fails is its error. Home is the
composition's: the user's home directory's `.agister`. `agister check`
prints each fault, each warning, then how many names resolve and how
many are refused, and exits 1 where it reports any fault. `agister
inspect processes`, `workflows` or `agents` prints each name, the layers
that hold it and whether it resolves; `agister inspect process <name>`,
`workflow` or `agent` prints each field with its value, its file, line
and layer, then the documents reached, the plans and the warnings, or
the refusal with its chains, and a fault of no document as such. Inspect
exits 0, a refusal shown being what was asked; one no layer holds is
said so, and exits 1. Both print to stdout. Each takes `--dir`, the
launch directory, the working directory by default; home is `~/.agister`
(ADR-002, rule 2). A bad command prints its usage to stderr and exits 2.

Decisions of its reviews, each with its reason:

- A link in a settings folder is skipped, with no problem: layout
  follows no link, and reporting one is layout's work, when met.
- Inspect gives each step's plan whole, in its categories, as ADR-003,
  rule 4 names them; check and cli each declare it in their own types
  and print it as it is. A projection of it would carry the same
  categories, and translate nothing.
- A relative `--dir` is joined to the working directory as Go joins a
  path, cleaned before its links are resolved: a `..` after a link is
  a corner case, handled when met.

## Where each check sits

| Check | Step |
|---|---|
| a file that cannot be read, in a wrong place, or with a wrong extension or name | 1, layout |
| a layer that cannot be read | 1, layout |
| bytes that are not their format | 2, decode |
| an `extends` naming no document of its kind, or a cycle | 4, extends |
| an unknown field, a wrong type, a missing field | 5, type |
| a reference that reads none of the readable forms, or a root its place may not read; `item` outside a query's `where` | 5, type |
| a blocks file that is not a list of blocks, each a kind, a name and a reason | 5, type |
| a name that reaches no document; a blob no layer holds | 6, resolve, from its source |
| a blocked document; a block naming no document, a warning | 6, resolve |
| a binding or a condition that reads what is not there | 6, resolve |
| an arm that does not give its branch's outputs | 6, resolve |
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
