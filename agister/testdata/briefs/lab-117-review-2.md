# LAB-117 review round 2: fixes

## Goal

`agister/testdata/briefs/lab-117-goal.md` (Done when 1, 2 and 5; read its
Decisions: the owner's ruling on question 1 amends Done when 2).

## Answers

The judgement of `code_review` workflow run `20261007T084631Z-5dedb2`
(base `c6e5c14d`, candidate `ffc3613d`): its 4 `fix` items, as written,
and its `owner` item, as the owner decided.

## Acts on

1. **Input names that differ only in case overwrite each other's artifacts on a case-insensitive filesystem.** Action: In inputArtifactName, treat ASCII case-equivalent names as collisions and use the existing indexed fallback for both colliding inputs. Add a recorder-spy regression case in inputs_evidence_test.go that asserts the artifact names stay distinct after case folding and that each input's bytes are kept. Update the naming descriptions in README.md and the caller skill.

2. **The whole-record leak checks search for raw newlines that json.Marshal escapes.** Action: Fix both containment checks in inputs_evidence_test.go (lines 95 and 218) to search for longText's JSON-escaped form, or to inspect decoded string values. Optionally share an escaping helper.

3. **No test asserts the artifacts for a long prompt input or a long workflow collection.** Action: Add two cases in inputs_evidence_test.go: a long prompt, and a workflow whose collection is over the inline limit. Each asserts the receiving run's artifact metadata, exact bytes, and that the agent input is unchanged. Use the existing prompt, workflow, recorder and runner helpers.

4. **No test fails if the artifact-name length bound is removed.** Action: Extend TestInputArtifactsAreEachInputsOwn with an ASCII input name longer than 64 characters, and assert its indexed artifact name and bytes.

5. **A long request param is replaced by its digest before its bytes are
   stored, so a refusal loses it.** Owner's decision, option (a): delay
   redacting `request.params` until matching evidence is kept, and keep
   the original request on refusal paths. A long param stays its literal in
   the recorded `request.params` until an input's artifact keeps its bytes;
   a run refused before that keeps the literal. Add a regular test: a long
   goal param followed by a failing file input; assert the refused run's
   record keeps the param's text.

## Constraints

Change nothing else.

## Open

None.
