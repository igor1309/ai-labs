# LAB-117 review round 1: fixes

## Goal

`agister/testdata/briefs/lab-117-goal.md` (Done when 1 and 2).

## Answers

The judgement of `code_review` workflow run `20261007T083621Z-46d2d2`
(base `c6e5c14d`, candidate `e12332c0`), its two `fix` items, as written.

## Acts on

1. **Artifact names come from raw input names: repeated names overwrite
   each other's evidence, and names with a slash fail to store.**
   Action: Change `recordInputs` (`agister/internal/app/calls.go`) so each
   input gets a bounded, filesystem-safe artifact name that is distinct for
   each occurrence (for example a declaration index when names repeat, or a
   content digest). Do not reject repeated or currently accepted input
   names, and keep today's file names for inputs whose names do not
   collide. Add a regular regression test in
   `agister/internal/app/inputs_evidence_test.go`, using the existing
   recorder spy: two long inputs with the same name and different text, and
   one long input whose name contains a slash. Assert that each artifact
   holds its own input's bytes and matches its recorded digest. Update the
   file-name descriptions in `agister/README.md` and
   `agister/skills/agister/SKILL.md`.
2. **The workflow test cannot catch the fix for long caller params being
   undone.** Action: Add a workflow case to `inputs_evidence_test.go` that
   submits a long goal param through `source: param`, using the existing
   workflow harness, param provider, recorder and runner spies. Assert the
   parent's recorded digest, the stored artifact bytes, and that the nodes
   receive the original goal text unchanged.

## Constraints

Change nothing else.

## Open

None.
