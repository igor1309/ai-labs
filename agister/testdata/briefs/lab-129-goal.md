# Goal: LAB-129, the ADRs for the investigator and for a run's output

## Intent

Turn `research/agister/research/investigator-draft.md` into two ADRs,
both with status **Proposed**, and amend ADR-026 to agree with them:

- **ADR-028**, `agister/docs/adr/028-a-run-keeps-its-output.md`: a run
  keeps its output's bytes, the cache holds a disposable copy, and a
  file param may name a run's output.
- **ADR-029**, `agister/docs/adr/029-the-investigator-grounds-a-task.md`:
  the investigator, the grounding, the revision check, the gate on open
  questions, and the brief as task and grounding.

Rename a file if a better title fits the ADR naming. This is a change of
documents only: the ADRs decide, and LAB-130 to LAB-134 build.

Follow the form and voice of
`agister/docs/adr/026-the-brief-is-a-runs-input-contract.md`: the header
fields, Context, Decision drivers, Decision with numbered rules,
Consequences, Alternatives considered. Plain, short sentences. The
context states the problem, not the story of how it was found: no dates,
runs or who said what outside the **Source** line. An ADR references
only earlier ADRs, so ADR-029 may refer to ADR-028 and not the reverse.
Take the findings of the two research notes as given; do not re-derive
them.

## Done when

1. **ADR-028 decides how a run's output is kept and passed on**, closing
   the six points of the draft's "Extending the cache to outputs":
   1. Which bytes: a completed run keeps its output as an artifact of
      the run, exactly the bytes that passed the output check, written
      once, with their digest and byte count in the result. The parsed
      value in the record stays for reading and is never the source of
      the bytes: a copy is made from the artifact, not by writing the
      record's value again. A record made before this has no such
      artifact.
   2. The file's name is fixed, not set by the process:
      `artifacts/output.json` for a JSON output, `artifacts/output.txt`
      for a text one, and the same base name in the cache folder
      `<home>/cache/<sha256 hex>/`. The digest names the bytes; a name
      the settings choose would be a field nothing needs.
   3. A removed copy: a file param accepts a reference to a run's
      output, `run:<run-id>`. Agister reads the run's artifact, checks
      it against the recorded digest, and makes the cache copy again if
      it is gone; the cache is only how the reference is served. The
      call is refused before it starts, exit 3, when the run does not
      exist, did not complete, keeps no output artifact, or the bytes do
      not match the digest. A plain path still works, the cache path
      among them, with the risk that the copy is gone. A file whose
      name begins `run:` is given as `./run:...`.
   4. Lineage: a consuming input given by reference records the run it
      came from beside its digest. One given by path records its digest
      only: nothing is found by searching runs (ADR-026 rule 6).
      `--goal` and `--answers` are unchanged.
   5. Failure: a cache copy that cannot be written is the event
      `CACHE_FAILED` and the run goes on; a reference is still served
      from the artifact. An output artifact that cannot be written is
      `ARTIFACT_FAILED`; the run completes, its output is in its record,
      and a reference to it is refused.
   6. Done gates: the change that builds this (LAB-130) changes what the
      CLI and a run's record offer, so it is done only when the caller
      skill, `README.md`, the settings diagrams and the Pages view say
      the same (`agister/AGENTS.md`).
   It also says what the cache does not give: the digest proves the
   consumer received the same bytes, not that the code still matches
   them. And that an export brings a run's output with the run, and not
   the run a reference names.
2. **ADR-029 defines the investigator**: a process in settings that the
   caller runs, not something the binary does (ADR-025: Agister does not
   plan). It works per task, read-only, in its own context. It gets the
   task by reference, the candidate and the depth the caller asks for.
   It may read, search, diff, read history and run commands that do not
   write, as home's read-only review policy already grants; it may not
   write. It reads the repository's instruction files and recorded
   decisions and reconciles them with the code. It describes what exists
   and proposes neither a solution nor a way to prove a criterion. It
   checks an absence claim against the owning code and other names. It
   is one process to start, and becomes a workflow of narrow readers
   only if one prompt proves unreliable.
3. **ADR-029 defines the grounding**: task-scoped; a JSON output under a
   schema, so that a missing part fails a check; each finding tied to a
   criterion of the task, a path and a symbol, never a line number; only
   facts that locate the work, show a gap, or name something already
   there that changes the work needed. Its nine parts are those of the
   draft's "The grounding" list. It stays in the run that produced it
   and reaches a later run by reference (ADR-028); the orchestrator
   passes the run's ID and never reads the grounding.
4. **ADR-029 defines the two checks at the consuming call's entry**,
   both deterministic and both a refusal:
   - the revision check: the grounding's revision is an ancestor of the
     candidate, and none of the files its findings rest on changed
     between the two;
   - the gate on open questions: a grounding with an open question is
     not accepted. The investigator's run completes with them; each goes
     to who owes the answer, and the investigator runs again with the
     answers.
5. **ADR-029 closes the three open questions**, each with its reason and
   the options not taken under Alternatives considered:
   - The name is **grounding**. "Onboarding" names what happens to a
     newcomer and suggests the standing repository documentation this
     decision avoids; "orientation" suggests an overview or a map, which
     a grounding may not hold. "Grounding" says what it is: the facts in
     the code that the task's work rests on.
   - In multi-step work **a planning step of its own splits the task**:
     a process in settings that takes the task and the grounding by
     reference and returns the step briefs. Not the orchestrator, which
     would have to read the grounding and so take back the context the
     investigator relieves. Not the investigator, which would then
     propose, and a grounding that proposes cannot be checked. The
     planning step's own contract is LAB-133; until it exists a caller
     splits a task as it does today.
   - **One grounding is made per task**, and its steps share it. The
     steps are not known until the task is split, and the split reads
     the grounding, so a grounding per step cannot come first. When the
     revision check refuses it, because an earlier step changed a file
     it cites, the investigator runs again for the same task at the new
     candidate. A grounding is not used for another task.
6. **ADR-029 amends ADR-026**, naming each rule it amends and what
   changes, and ADR-026 says so:
   - rule 1: a brief has two parts, the task and the grounding. The task
     is rule 2's goal or step brief. "The caller writes it" holds for
     the task part only; the grounding is a run's output.
   - rule 4: a step brief's Constraints hold only what neither the goal
     nor the grounding says.
   - rules 6 and 8: the grounding belongs to the run too, and its two
     checks join the checks at the entry.
   - rule 9: the implementer receives the brief's two parts as two
     inputs, side by side, never merged into one file; the grounding is
     optional, and a change small enough to need none runs as today.
     Review nodes still receive the goal and not the grounding; the
     judge neither.
   - ADR-026 gains an `Amended by` header line for ADR-029, and its
     Context no longer says the owner writes briefs by hand: the
     caller's agent writes them. Nothing else in ADR-026 changes.
7. Both ADRs name what they leave to the follow-ups: LAB-130 (the output
   artifact, its cache copy and the reference), LAB-131 (the
   investigator process and the grounding's schema), LAB-132 (the
   grounding as an input of `agister/home/processes/implement.yaml`,
   with its two checks), LAB-133 (the planning step), LAB-134 (what
   standing instruction files hold, which ADR-029 does not decide).
   ADR-029 says that until LAB-132 lands a caller works as
   `agister/AGENTS.md` says today.
8. `research/agister/research/investigator-draft.md` is reduced to a
   pointer: a few lines that name ADR-028 and ADR-029 as the record, and
   LAB-134 for the standing-knowledge proposals. The link to the draft
   in `research/agister/research/pre-implementation-investigation.md`
   still resolves, and that note's two sentences that call the draft the
   place of the decisions point to the ADRs.
9. No open question remains in either ADR, and the two ADRs, ADR-026 and
   `agister/AGENTS.md` do not contradict each other.

## Out of scope

Code, settings, prompts, schemas, the caller skill, `README.md`, the
settings diagrams, Pages and `agister/AGENTS.md`. Building the
investigator, the schema, the checks or the cache change. The planning
step's contract. What standing instruction files hold. Any change to
ios.config. Reopening ADR-023's judge rule.

## Sources

- Multica LAB-129 (the issue), LAB-126 and LAB-127 (the research).
- `research/agister/research/investigator-draft.md`: the decisions so
  far and the draft proposals. Read it in full before it is reduced.
- `research/agister/research/pre-implementation-investigation.md`: what
  existing solutions do (sections 1 to 3), our own practice (sections 4
  and 5). Its findings give the Context and the Decision drivers.
- `agister/docs/adr/026-the-brief-is-a-runs-input-contract.md`, and
  ADR-001 rule 10, ADR-007, ADR-023, ADR-025, ADR-027.
- `agister/README.md`, on a run's `inputs`, `artifact`, `cache_path` and
  `links` as the binary has them today.

## Decisions

- 2026-10-08, owner: a brief is what the implementer gets, the task and
  the onboarding. The investigator's output is the onboarding part and
  is not called a brief.
- 2026-10-08, owner: the grounding is task-scoped, stays in the run that
  produced it, and reaches a later run through the disposable cache. The
  cache may be extended to hold a run's output.
- 2026-10-08, owner: the orchestrator did this work until now; the
  investigator takes it out of the orchestrator's context.
- 2026-10-08, owner: what works is taken in the shape needed. An ADR
  that stands in the way is changed.
- The answers in items 1 and 5 are the orchestrator's proposal on
  LAB-129. The owner rules on them with the ADRs, which is why both are
  Proposed.

## Open

None.
