# LAB-84 step 3: ADR-027 review round 2 fixes

## Goal

`agister/testdata/briefs/lab-84-goal.md`

## Covers

- Done when 1: the ADR's text, as the fix items below require.

## Acts on

The judgement of `adr_review` workflow run `20261007T184903Z-67ed25`, its two `fix`
items, as written:

1. **Qualify the guarantee that processes work in every repository** (1#2). Narrow the consequence at ADR-027:234 to prompt portability, and keep ADR-010's requirement for the repository's verification slot. No change to implementation or tests.
2. **Replace the dated inventory with enduring context** (1#1). Move the dated inventory, prompt versions and migration observations into the existing LAB-84 briefs. Keep only the architectural problem in Context: settings copied by hand drift apart, and prompt inputs read from files tie global processes to particular locations.

## Constraints

- Change only the ADR and a new file,
  `agister/testdata/briefs/lab-84-inventory.md`, which takes the dated
  inventory and migration observations the ADR drops (what home and
  `.agister/` hold, which copy of each differing document is current).
  The implementation step will read it.

## Open

None.
