# Goal: LAB-116, the ADR for the brief

## Intent

Record, as ADR-026 (status Proposed), the decision proposed in
`research/agister/research/brief.md` §7 (LAB-115): a brief is a run's input
contract, the definition of ready to the implementer's definition of done.

## Done when

1. The ADR decides: the caller writes a brief and Agister does not write,
   plan or repair one; two layers, the goal (every reviewer's `goal`,
   ADR-023) and the step brief (one implementer run, referencing its goal);
   each layer's contract as common and conditional parts, not one fixed
   form; headings and templates are settings.
2. The ADR decides that a brief belongs to the run, not the repository:
   the run keeps the durable copy; a disposable working copy may sit under
   `~/.agister/cache/`; a run records its goal by reference and digest.
3. The ADR states the two conditions: owner decisions also land in the
   SPEC or the issue; runs need an export for audit.
4. The ADR separates a structural entry check (Agister's or the caller
   skill's) from judging whether a brief is right (an optional caller
   process).
5. Review nodes get the goal, not the step brief; the judge stays blind.
6. The follow-ups LAB-117 to LAB-121 are named; the change adds only the
   ADR file.

## Out of scope

Code, settings, prompts, schemas, README, the caller skill and Pages.
Reopening ADR-023's judge rule.

## Sources

- Multica LAB-116 (the issue) and LAB-115 (the research issue).
- `research/agister/research/brief.md`: §1-6 are verified findings; §7 the
  proposal.
- ADR-025 is on PR #908, not on this branch; referencing it is expected.

## Decisions

- 2026-10-07, owner: SPEC and QA belong to the repository as its truth;
  plans, briefs and goals do not — they are disposable content kept as
  research and audit material, outside the repository.
- 2026-10-07, owner: the working copy goes in `~/.agister/cache/`, not
  /tmp.

## Open

None.
