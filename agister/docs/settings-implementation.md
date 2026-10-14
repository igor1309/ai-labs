---
date: 2026-10-14
model: claude-opus-5-5
description: "Settings implementation notes: how settings files become what a run needs, step by step; the owner's decisions of 2026-10-14"
---

# Settings: implementation notes

How settings files become what a run needs. Not an ADR: the steps and
who does what, and the packages that do them, as the owner decided them
on 2026-10-14.

## Packages

| Package | Does | Knows |
|---|---|---|
| `settings/layout` | a filesystem and three layer folders → a snapshot | folders and file names; no content |
| tree, a library | bytes → a value tree with origins; one tree merged over another | values and origins; no Agister word |
| `settings/documents` | a snapshot, a kind and a name → one definition, or its problems | what each kind is, and `extends` |
| `settings/resolve` | a request → what a run needs, or a refusal naming the chain | how documents name one another; blocks |
| `settings/check` | handed resolve: resolves every document and reports | |

Tree is a library, not a part: decode, merge and the value type are
generic, the one vocabulary that decoding, merging and typing share, and
they are imported like the YAML parser they wrap. It lives outside the
agister module, in `gokit`, so it cannot reach into a kind.

Documents answers "what is this one document": it decodes, merges the
layers, applies `extends` (the base is a lookup in the snapshot it
holds) and types. Resolve answers "what does it reach, and can all of it
be used", asking documents for each document through a port.

## The pipeline

1. **layout**: a filesystem and three layer folders → a snapshot of
   sources, and file problems.
2. **decode**: each source's bytes → a tree with origins; blobs stay
   bytes.
3. **merge**: per document, its sources' trees → one tree, the nearest
   winning.
4. **extends**: the base's merged tree, with the extending document's
   merged tree over it.
5. **type**: a tree → a definition (`Process`, `Agent`, …), and field
   problems.
6. **resolve**: the names between definitions followed → what a run
   needs, or a refusal naming the chain.

Only step 1 touches files. Steps 2 to 6 are pure functions over data.

## 1. Layout

The only step that knows files. It takes a filesystem as a dependency and
the three layers' folders as parameters: home's, the repository's and the
project's, each of them or none. The composition finds them; layout
searches for nothing, knows no git and no launch directory. It reads the
folders it is given.

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

- **Trees**: agents, processes, workflows, runtimes, verifies, briefs.
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

Scripts are not settings. A verification names a command line; the
scripts it runs are the worktree's files.

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
What each field means is known here, and only here.

## 6. Resolve

Follows every name between definitions: a workflow's processes and
agents, a process's prompt, guidance prompts, schema, verification and
input brief forms, an agent's runtime mapping. A tree document named goes through steps 2 to 5;
a blob is taken from its nearest slot, with its digest, and is a problem
if no layer holds it. Resolve gives what a run needs, or a refusal naming
the chain to the document at fault.

A request that depends on a blocked document is refused, naming the
block; a block is not a problem, and a block naming no document is a
warning.

## Problems

A broken file is a problem of its document, not of the whole: it is kept
as data with the document, and refuses only what reaches it. A layer
that cannot be read is a problem of no document, and refuses every
request. Check shows every problem. How a run's record keeps the problems of documents it did
not use is open; they are data, so it can.
