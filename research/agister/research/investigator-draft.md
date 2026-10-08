# The investigator: decisions so far and draft proposals

What the owner decided on Multica LAB-127 on 2026-10-08, and the
proposals that came out of the research in
[`pre-implementation-investigation.md`](pre-implementation-investigation.md).
This is draft material for LAB-126 (ground the investigator role) to
build on. It is not an ADR and it defines no process, workflow or
setting. Nothing here was tested against a live run: what it says about
Agister today is read from `agister/README.md` and the caller skill.

## Decided

Decided by the owner in the LAB-127 thread.

- **The investigator produces a brief.** Its output is an Agister brief
  for the implementer, task-scoped, not standing documentation of the
  repository.
- **The run keeps it.** The brief stays in the run that produced it, for
  observability. The run is the source.
- **The cache carries it between runs.** A copy in Agister's cache is
  what a later run, such as investigate → implement, refers to. The
  cache is disposable: no run may depend on a copy being there.
- **The cache may be extended to outputs.** Today only an input read
  from a file gets a cache copy (`cache_path`). The owner sees no
  problem in the cache also being the disposable store of a run's
  output. The conditions below are what that extension has to settle.

## Extending the cache to outputs: what to settle

No objection in principle: an output copy is derived from the run's
record exactly as an input copy is, so the rule "the cache may be
removed at any time" still holds. These points need an answer before
it is built.

1. **Which bytes.** A cache folder is named by the digest of the bytes.
   For a text output that is the text. For a JSON output the bytes must
   be fixed once and recorded, so that a copy made again from the record
   has the same digest. Where the record holds a parsed value, not the
   bytes, writing it again may not give the same digest.
2. **The file's name.** An input's copy takes the base name of its
   file. An output has no file, so the name must be given: fixed, such
   as `output.md` or `output.json`, or set by the process.
3. **A removed copy.** An investigate → implement step that passes the
   cache path fails when the copy is gone. Either a command makes the
   copy again from the run's record, or a file param accepts a
   reference to a run's output, and the cache is then only how that
   reference is served. The second leaves the caller nothing to repair.
4. **Lineage.** The consuming run records the digest of what it
   received, not the run that produced it. `--goal` and `--answers`
   name a goal and a judgement, not "made from this run's output". The
   digest alone identifies the bytes; whether the producing run is also
   linked is a choice to make.
5. **Failure.** As with `CACHE_FAILED` for an input, a copy that cannot
   be written should be an event, not the run's failure.
6. **Done gates.** It changes what the CLI and a run's record offer, so
   by `agister/AGENTS.md` it needs the caller skill, `README.md`, the
   settings diagrams and the Pages view to say the same, and most
   likely an ADR.

One thing the cache does not give: the digest proves the implementer
received the same bytes, not that the code still matches them. That is
the brief's revision, below.

## Draft proposals

Not decided. Each is from the research, with its reason there.

### The investigator

- Works per task, read-only, in its own context. It gets the change
  request, not "document the repository".
- Describes what exists and does not propose a solution. A brief of
  facts can be checked; one that recommends cannot, and it takes the
  planner's and the implementer's work.
- Reads the repository's instruction files (`AGENTS.md`, `.agister/`).
  Reconciling them with the code is part of its work.
- Uses tools for structure (files, symbols, dependencies) and spends
  its judgement on intent and conventions.
- Takes its depth from the caller, so a small change does not pay for a
  full investigation.

### The brief it produces

- States the revision it was made at. The implement process pins that
  revision (`workspace.revision`), so a brief made at another commit is
  refused, not trusted.
- Ties each claim to `path:line`.
- Answers narrow questions, which map to LAB-126's list:
  - where the code for this change lives: modules and their boundaries,
    the components responsible;
  - how it works now;
  - which existing pattern to follow, with one example of it;
  - dependencies, internal and external;
  - how to build, test and verify;
  - constraints, pitfalls and prior decisions that apply.
- Ends with open questions. An unresolved one stops the hand-off: this
  fits a brief form whose Open part must read `None.` (ADR-026).
- Is reviewed by a person before the implementer starts, since a wrong
  line here costs more than a wrong line of code.

### Standing knowledge

- Kept small: policy, and pitfalls someone has actually hit. No
  repository overview, directory tree or stack list.
- An audit may only shorten it.

## Avoid

- Whole-repository documentation as a step before work. BMAD built it
  and deprecated it.
- Memory read on every task and updated by hand, with nothing that
  checks it against the code.
- One large investigation prompt. Narrow stages follow instructions
  more reliably.
- An investigator that never sees the repository's rules.

## Open

- Is the investigator one process, or a workflow of narrow readers
  (where, how, which pattern) with a join?
- Does the brief it produces use the existing step brief form, or a
  form of its own?
- Is an old brief ever reused for a later task, and if so, what
  re-verifies it?
