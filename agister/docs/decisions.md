# Decisions

## D-1: Is an ADR committed earlier on an unmerged branch already recorded and immutable?

- **Status:** Owner
- **Asked by:** workflow run 20261002T102838Z-2f213a (code_review), judge item "ADR-010 edited after it was first committed on the branch"
- **Question:** does an ADR proposed earlier in the same unmerged branch count as recorded and therefore immutable?
- **Options:** (a) treat it as still a draft and keep the edit, folded into a single commit if a clean history matters; (b) restore the e8b1c614 text, keeping the original context, and record the acceptance or the revised context separately through the decision process; (c) restore only the original context and keep the status change.
- **Excluded:** (b) and (c): an ADR on an unmerged branch is still under review, and restoring text that review rejected would record a known defect.
- **Decision:** (a). An ADR stays a draft until its branch merges to trunk, so it may be edited on that branch. The history is kept by the pull request's merge commit, not by squashing.
- **Rests on:** none
- **Follow-ups:** none
