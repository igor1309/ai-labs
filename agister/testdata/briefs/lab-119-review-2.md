# LAB-119 review round 2: fixes

## Goal

`agister/testdata/briefs/lab-119-goal.md`

## Covers

- Done when 1, 3, 5 and 7, as the fix items below require.

## Acts on

The judgement of `code_review` workflow run `20261007T113352Z-2772e5`
(base `d6ead815`, candidate `15143359`), its four `fix` items, as written:

1. **Keep concrete definition types out of Calls' resolution contract**
   (1#1). Declare a Calls-owned form-check contract or callback value in
   place of `definition.Brief` in `ResolvedCall.Forms` and
   `ResolvedWorkflow.Forms`. Adapt the parsed forms into it at the
   existing resolution boundary (`callResolution` and the workflow
   adapter). Add a Calls test that uses a check stand-in, and keep the
   domain and composition tests.
2. **Accumulate section bodies without quadratic copying** (3#1). Change
   `Brief.sections` to use a builder per open section or to collect body
   ranges, keeping fence handling, normalized lines and nested-section
   behaviour. Add an allocation-bound regression test in the domain tests.
3. **Settings test for missing workflow forms uses a param input instead
   of a file input** (2#1). Change the formed fixtures in
   `agister/internal/domain/settings/briefs_test.go` to `source: file`,
   and explicitly supply mechanisms that include `file`.
4. **Check constraints on present, empty optional parts** (3#2). Limit
   the empty-body early return in `Brief.Check` to unconstrained optional
   parts. Extend the table-driven domain tests with cases for empty
   optional `reads` sections and empty optional reference sections.

## Constraints

- Do not edit `agister/AGENTS.md`, or the clause at
  `agister/skills/agister/SKILL.md:203` about dropping a form: an owner
  item.
- Do not edit `.agister/processes/implement.yaml` or
  `.agister/workflows/code_review.yaml`; that wiring lands last.

## Open

None.
