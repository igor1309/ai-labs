# LAB-111: an edit a recorded done gate requires is not a finding

## Gap

Two recorded rules contradict each other:

- `prompts/code-review-clarity.md`, definition of done item 9: a change
  does not edit a recorded decision (an ADR, a design specification, a
  prompt, AGENTS.md or another agent instruction). Such an edit is a
  finding "however accurate it is": decisions are the owner's.
- `agister/AGENTS.md`, the done gates (D-18, Confirmed): a change to what
  the CLI or the settings offer is done only when the caller skill
  `skills/agister/SKILL.md`, `README.md`, the settings diagrams and Pages
  say the same as the binary.

So every change that honours the done gate edits the caller skill, the
clarity reviewer reports it, the judge, who reads only the reviews, rules
it `owner`, the advisor answers `owner`, and the owner is asked a question
with one admissible answer. It happened in LAB-88 (D-18) and in LAB-43
(D-19).

The owner asked for this change (2026-10-06, LAB-111). It edits a review
prompt and `agister/AGENTS.md`: that is the decision, and those edits are
this change's purpose.

## What to do

1. **`prompts/code-review-clarity.md`, item 9.** Add the exception, in
   the prompt's own voice, in the same numbered item, so the item count
   stays 9. The prompt is reusable across projects: name no Agister file
   in it. What it must say:
   - An edit is not such a finding when a recorded rule of the project
     requires the change to make it: a document the rule names is brought
     in line with behaviour the change itself built (a done gate). The
     owner's rule is the decision.
   - The reviewer checks it: the coverage entry for the item quotes the
     rule and where it stands.
   - It is still a finding where the edit says more than the change
     built, or changes a rule instead of describing behaviour. An edit to
     an ADR, a prompt or AGENTS.md that no such rule requires stays a
     finding, as today.
   - An edit the goal expressly directs is the owner's own and not a
     finding either; say so in the same place if the prompt does not
     already.

   Bump the prompt's `version` and set its `date` as the other prompt
   edits in the history do.
2. **`agister/AGENTS.md`**, where it says how to run `code_review` with
   its goal: the goal file names the done gates the change touches, and
   any edit to an agent instruction the owner asked for in the change.
   One sentence.
3. **Test.** In `agister/cmd/agister/repo_settings_test.go`, beside
   `TestReviewPromptsCarryTheirCoverageContract` and
   `TestReviewPromptsCarryTheGoal`, a test that the clarity prompt
   carries the exception, held by its short phrases standing in one
   paragraph, as those tests hold theirs: the exception itself, that the
   rule is quoted in coverage, and that an edit beyond what the change
   built is still a finding. Use the existing `promptInstruction` helper.

Change nothing else: not the judge's prompt, not the other reviewers'.

## Check

From `agister/`: `test -z "$(gofmt -l .)" && go vet ./... && go test -count=1 -timeout 1m ./... && go test -race -count=1 -timeout 1m ./internal/app/...`.

No mutation or revert checks. List every file you changed.
