# LAB-247 step 2: the reference page says the rule

## Goal

`testdata/briefs/lab-247-goal.md`

## Covers

- 7: ADR-037 is linked where `agister/AGENTS.md` now says an ADR is linked.
- 8: the reference text that repeats the overlap definition.

## Constraints

- LAB-242 has merged since step 1. Behaviour detail now lives in `docs/reference/`, and the overlap definition is in `docs/reference/worktree-and-holds.md`. `agister/AGENTS.md` says a new ADR is linked from the reference page for its topic, and the README links to the ADR list only.
- Say the rule of step 1 in `docs/reference/worktree-and-holds.md`, in its own style, and link ADR-037 from it.
- Remove the ADR-037 line step 1 added to `README.md`, so the README is as trunk has it.
- Change no code. `SKILL.md` already says the rule from step 1. Leave it unless it now contradicts the reference page.
- Follow `agister/AGENTS.md`'s documentation gate.
- Do not commit.

## Open

None.
