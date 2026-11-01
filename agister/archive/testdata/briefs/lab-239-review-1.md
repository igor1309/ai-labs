# LAB-239 review 1: the three findings the review ruled fix

## Goal

`testdata/briefs/lab-239-goal.md`

## Covers

- The goal's own-types claim for a verification: the verifier owns its configuration, and Calls does not hand it a Calls-owned type.
- The goal's claim that every verify value is kept.

## Acts on

Code review run `20261013T051400Z-43301a`:

- 1#1 (major, fix): the verifier's public request and its loop state use `CallVerify`, a Calls-owned type, and the composition root passes that type straight through. Declare the verifier's own command-and-bounds type. Keep a Calls-owned verification request, and translate between the two through an adapter at the local composition root. Test that translation with stand-ins, keeping the command and clock seams.
- 4#1 (major, fix): the comments on `collects` and `callSkills` in `internal/app/reader.go` record what parser helpers currently read. Remove those observation sentences and keep the behavioural descriptions. No new test.
- 2#1 (minor, fix): `parsed_internal_test.go` asserts only the command of the named verification resolved through `parsedSettings.resolved`. Compare all four verify values, including instruction, timeout and maxAttempts, against an independent expected value.

## Constraints

- Change no logic, no message and no stored record. The CLI's behaviour and output stay as they are.
- Say in the notes where the adapter lives, which types each side owns, and each test you added or changed.
- No documentation gate applies: no command, flag, setting or output changes.
- Do not commit.

## Open

None.
