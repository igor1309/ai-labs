# LAB-129 review round 1: a workflow's run keeps its output too

## Goal

`agister/testdata/briefs/lab-129-goal.md`

## Covers

- Criterion 1, points 1 and 3: every completed run keeps its output as
  an artifact, and `run:<run-id>` names it, a workflow's run among them.
- Criterion 9: the two ADRs and the goal do not contradict each other.

## Acts on

Judgement `20261008T184746Z-432c32` of adr_review workflow run
`20261008T184238Z-e7aac9`:

- Item 1 (fix, major, sources 1#1), "ADR-028 rule 1 excludes completed
  workflow runs from keeping a referenceable output artifact". In
  `agister/docs/adr/028-a-run-keeps-its-output.md` rule 1, remove the
  exception for workflow runs and decide that a completed workflow keeps
  its own output artifact, copied from the join's checked artifact
  rather than serialized from the record. LAB-130 consequently covers
  workflow finalization: say so in rule 8. Bring every other place in
  ADR-028 that rests on the exception into line with it.

The same review's coverage gap on Timelessness, not ruled on, in
`agister/docs/adr/029-the-investigator-grounds-a-task.md`:

- The Context states the problem, not the story of how it was found.
  Take the measured run baseline (the median of 13 tool calls, 47%) and
  the account of how the field moved and what BMAD deprecated out of the
  Context. Keep what they establish as plain statements of the problem,
  and let the Consequences name the research note,
  `research/agister/research/pre-implementation-investigation.md`
  section 4, as where the baseline is, not the Context.

## Constraints

Documents only: the two ADR files, nothing else. No other rule of either
ADR changes. Both stay Proposed.

## Open

None.
