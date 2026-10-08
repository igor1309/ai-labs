# The investigator: decisions so far and draft proposals

What the owner decided on Multica LAB-127 and LAB-126 on 2026-10-08, and
the proposals that came out of the research in
[`pre-implementation-investigation.md`](pre-implementation-investigation.md):
what existing solutions do (its sections 1 to 3) and what our own
repositories already do (sections 4 and 5). This is draft material for
the ADR that defines the investigator. It is not an ADR and it defines
no process, workflow or setting. Nothing here was tested against a live
run: what it says about Agister today is read from `agister/README.md`,
the caller skill and the settings in `agister/home/`.

## Decided

Decided by the owner in the LAB-127 and LAB-126 threads.

- **A brief is what the implementer gets:** the task (an issue, a bug, a
  ticket) and the onboarding. The investigator's output is the
  onboarding part and is not called a brief. This note calls it the
  **grounding**; the name is a proposal, under Open.
- **The grounding is task-scoped.** It is made for one task, not as
  standing documentation of the repository.
- **The run keeps it.** The grounding stays in the run that produced it,
  for observability. The run is the source.
- **The cache carries it between runs.** A copy in Agister's cache is
  what a later run, such as investigate → implement, refers to. The
  cache is disposable: no run may depend on a copy being there.
- **The cache may be extended to outputs.** Today only an input read
  from a file gets a cache copy (`cache_path`). The owner sees no
  problem in the cache also being the disposable store of a run's
  output. The conditions below are what that extension has to settle.
- **The orchestrator did this work until now.** None of the briefs in
  `agister/testdata/briefs/` were written by the owner: the orchestrating
  agent wrote them, and the investigation behind each filled its
  context. The investigator takes that work out of the orchestrator.
- **What works is taken in the shape needed.** An ADR that stands in the
  way is changed. The ADRs this touches are listed below.

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
   reference is served. The second is proposed: it leaves the caller
   nothing to repair, and the orchestrator passes a run's id without
   ever reading the grounding.
4. **Lineage.** The consuming run records the digest of what it
   received, not the run that produced it. `--goal` and `--answers`
   name a goal and a judgement, not "made from this run's output". The
   digest alone identifies the bytes; whether the producing run is also
   linked is a choice to make. A reference as in point 3 would record
   it.
5. **Failure.** As with `CACHE_FAILED` for an input, a copy that cannot
   be written should be an event, not the run's failure.
6. **Done gates.** It changes what the CLI and a run's record offer, so
   by `agister/AGENTS.md` it needs the caller skill, `README.md`, the
   settings diagrams and the Pages view to say the same, and an ADR.

One thing the cache does not give: the digest proves the implementer
received the same bytes, not that the code still matches them. That is
the grounding's revision, below.

## Draft proposals

Not decided. Each has its reason in the research note, in the section
named.

### The brief: task and grounding

- The implementer takes two inputs: the task, which is today's goal or
  step brief, and the grounding. Together they are the brief. Agister
  puts them side by side as it already does with a brief and its
  guidance prompts (`agister/home/processes/implement.yaml`); nobody
  merges them into one file.
- The orchestrator writes the task part, or refers to the issue. It no
  longer writes where the code is, which pattern applies or what
  constrains the change. Those parts of today's briefs (`## Constraints`
  in 47 of 218, code paths in 150) move to the grounding.
- The grounding is optional. A change small enough to need none runs as
  today.

### The investigator

- Works per task, read-only, in its own context. It gets the task, not
  "document the repository". The existing `codex-review` policy
  (`agister/home/policies/codex-review.yaml`) already grants read,
  search, diff and history without write.
- Describes what exists and does not propose a solution or a way to
  prove a criterion. A grounding of facts can be checked; one that
  recommends cannot, and it takes the planner's and the implementer's
  work. The implementer derives each check, as ADR-026 rule 4 says.
- Reads the repository's instruction files (`AGENTS.md`, `.agister/`)
  and the recorded decisions (ADRs, a `decisions.md`). Reconciling them
  with the code is part of its work, and nothing else gives the
  implementer the decisions that bear on its change (section 4).
- Uses tools for structure (files, symbols, dependencies) and spends
  its judgement on intent and conventions.
- Takes its depth from the caller, so a small change does not pay for a
  full investigation.
- Is one process to start. It becomes a workflow of narrow readers
  (where, how, which pattern) with a join only if one prompt proves
  unreliable (section 5).
- Checks an absence claim against the owning code and other names: a
  search that finds nothing does not show that something is missing.

### The grounding

- States the revision and branch it was made at. A later run accepts it
  when that revision is an ancestor of the candidate and none of the
  files it cites changed in between. Requiring the same revision would
  refuse every step after the first, since each step runs at the
  previous step's commit (section 5).
- Ties each finding to a path and a symbol. A line number goes stale
  with the first edit.
- Keeps only facts that locate the work, show a gap, or name something
  already there that changes the work needed. It does not restate the
  task or catalogue what was read.
- Has an output schema, as the implementer's result has
  (`agister/home/schemas/implementation.json`), so that a missing part
  fails a check. Its parts:
  1. the task it serves by reference, the repository, the revision and
     branch read, the depth asked for;
  2. where the work lives: one sentence per finding, tied to a criterion
     of the task;
  3. boundaries touched: the modules involved, and what is shared with
     code outside the change;
  4. patterns to follow: a pointer to the rule, prompt or ADR that owns
     each, with one example file;
  5. dependencies of the touched code, internal with direction and
     external;
  6. entry points: the build, test and verify commands for the touched
     area, each with the file that defines it;
  7. constraints, pitfalls and prior decisions that bear on the change,
     and any contradiction between an instruction file and the code;
  8. coverage: what was searched, what was excluded, and the files the
     findings rest on;
  9. open questions, each with its source and who owes the answer.
- An unresolved open question stops the hand-off, as a brief form whose
  Open part must read `None.` does (ADR-026).
- Is reviewed by a person for the first runs. After that the open
  questions are the gate.
- Is not reused for a later task. Within one task it is reused for as
  long as the revision check passes.

### Standing knowledge

- Kept small: policy, and pitfalls someone has actually hit. No
  repository overview, directory tree or stack list.
- An audit may only shorten it.
- A rule says whom it is for. The root `AGENTS.md` holds rules for the
  caller that every implementer also loads, and implementers spend
  their notes explaining why those did not apply (section 4).

### How to tell it works

- The orchestrator's context spent per brief goes down.
- The implementer's tool calls before its first edit go down from the
  baseline in section 4: a median of 13 in ai-labs, 47% of a run's
  calls.

## ADRs this changes

- **ADR-026** (the brief is a run's input contract): a brief has two
  parts, the task and the grounding; rule 1's "the caller writes it"
  holds for the task part only; its context says the owner writes
  briefs by hand, which the owner corrected.
- **A new ADR** for the investigator, and for the cache holding outputs
  and a file param taking a reference to a run's output.
- `agister/home/processes/implement.yaml` gains the grounding as an
  input, and the brief forms may lose `## Constraints` to it.

## Avoid

- Whole-repository documentation as a step before work. BMAD built it
  and deprecated it.
- Memory read on every task and updated by hand, with nothing that
  checks it against the code.
- One large investigation prompt, if it grows: narrow stages follow
  instructions more reliably.
- An investigator that never sees the repository's rules.
- An orchestrator that reads the grounding in order to pass it on.

## Open

- The name. "Grounding" is used here because the owner glossed the
  onboarding as grounding; "onboarding" and "orientation" are the other
  candidates.
- In multi-step work, who splits the task into steps once the
  orchestrator no longer reads the code: the orchestrator from the
  grounding's findings, or a planning step of its own?
- Is one grounding made per task, or one per step?
