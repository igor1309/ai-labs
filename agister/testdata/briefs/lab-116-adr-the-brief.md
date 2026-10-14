# LAB-116: ADR-026, the brief is a run's input contract

Write one new ADR, `agister/docs/adr/026-the-brief-is-a-runs-input-contract.md`
(rename it if a better title fits the ADR naming), with status
**Proposed**. Write no code and change no settings, prompts, schemas,
README or skill in this step: what follows comes in later issues
(LAB-117 to LAB-121), after the ADR is reviewed.

ADR-025 (LAB-114, `agister/docs/adr/025-a-call-works-where-it-is-called.md`)
is accepted on PR #908 and not yet on this branch; reference it by number
and that path. ADRs reference only earlier ADRs.

## Source

The research is `research/agister/research/brief.md` (LAB-115). Its
sections 1 to 6 are the findings; section 7 is the proposal this ADR
decides; section 8 the follow-ups. Read it in full. Take its findings as
given: do not re-derive them from the sources it cites. Cite it in the
ADR's **Source** line with LAB-115 and LAB-116, and use its findings for
the Context and the Decision drivers.

Follow the form and voice of `agister/docs/adr/023-reviewers-know-the-goal.md`:
the header fields, Context, Decision drivers, Decision with numbered
rules, Consequences, Alternatives considered. Plain, short sentences.

## What the ADR decides

1. **A brief is a run's input contract.** It says what the run must make
   true, as the implementer's result (`schemas/implementation.json`) says
   what it did: the definition of ready to its definition of done. The
   caller writes it, the owner or the caller's agent. Agister does not
   write, plan or repair a brief (ADR-025's small steps; the caller seam).
2. **Two layers.**
   - The **goal**: what a piece of work is for. Every review node receives
     it as `goal` (ADR-023, unchanged). One per issue is usual, not a rule.
   - The **step brief**: one implementer run. The goal's criteria it makes
     true, and a reference to the goal. A review round's brief is a step
     brief whose items are the judge's fix items, and it names the
     judgement it answers. A one-step change passes the goal as the brief.
3. **The goal's contract**: a small common part with conditional parts,
   not one fixed form at every size. Take the parts from the research's
   §7 table: Intent (prose or a reference to the upstream artifact that
   states it; a reference is preferred), Done when (reuse upstream ids),
   for a bug fix the expected behaviour with its source and reproduction,
   Out of scope (the owner's and challengeable, ADR-023 rule 2), Sources
   when correctness depends on an upstream artifact, Decisions (dated),
   Open, which reads `None.` for every run that receives the goal.
4. **The step brief's contract**: Goal (the reference), Covers (the
   criteria; the implementer derives the check for each unless the goal
   names one), Acts on (when there are findings or judge items),
   Constraints (only what the goal does not say), Open `None.`.
5. **The exact headings and templates are settings**, not code (ADR-001
   rule 1, ADR-014). The ADR names the parts, not their Markdown.
6. **A brief belongs to the run, not to the repository.** A SPEC and its
   QA are the repository's truth; plans, briefs and goals are disposable
   as content and kept as research and audit material. The run keeps the
   durable copy of what it was given (ADR-001 rule 10); a disposable
   working copy may sit under `~/.agister/cache/`, in a record field whose
   name says so. Nothing is found by searching runs: a run records the
   goal it serves by reference and digest.
7. **Two conditions.** A goal's owner decisions also land in the SPEC or
   the issue; a ruling kept only in a run is lost to the next SPEC change.
   The run store is one host, so runs need an export for audit.
8. **Checks at the entry.** A structural check (the goal resolves, its
   references resolve, the conditional parts are present, Open reads
   `None.`) is a normal contract check. Whether a brief is right is an
   optional caller process, not Agister's.
9. **Who receives what.** The implementer: `brief`. Every review node:
   `goal`, not the step brief, whose claims are testimony. The judge stays
   blind (ADR-003 rule 4, ADR-023); not reopened.

## Left out, in the ADR

How the bytes are stored and linked (LAB-117, LAB-118), the templates and
the check (LAB-119), the intent reviewer (LAB-120 re-scopes LAB-105), the
export (LAB-121). Name them as the follow-ups.

## Alternatives the ADR records as rejected

- Commit briefs to the repository (today's `agister/testdata/briefs/`):
  wins until the PR, then needs a cleanup that is skipped, and an audit
  digs through history.
- A /tmp working copy: macOS clears /tmp on a schedule.
- One fixed brief form at every size: contradicts scaling ceremony down.
- Agister writes or reviews the brief's meaning: Agister does not plan.

## Check

`git diff --stat` shows only the new ADR file.
