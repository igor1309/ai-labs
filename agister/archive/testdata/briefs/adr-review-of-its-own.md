# The ADR review is a review of its own

An ADR is reviewed as an ADR, apart from code review. In code review the
ADRs are given: code that departs from one is a code finding, and the
reviewers do not critique an ADR's text. Make these changes, all of them,
and nothing else.

1. `.agister/workflows/code_review.yaml`: remove the `adr` fan-out node,
   and in the header say "the architecture, tests, adversarial and clarity
   reviews" again.
2. New `.agister/workflows/adr_review.yaml`: the same shape as
   `code_review` (params `base` and `candidate`, resolved once), one
   fan-out node `adr` using `process:adr_review_codex`, and the join
   `judge` using `process:review_judge`. Header: "Review of the
   architecture decisions one change adds or edits: the ADR review of the
   candidate against the base, then the judge's rulings on it." plus the
   run line `agister run adr_review --param base=<rev> --param
   candidate=<rev>`.
3. `.agister/processes/adr_review_codex.yaml` header: "Review of the
   architecture decisions a candidate adds or edits, per
   prompts/code-review-adr.md."
4. `prompts/code-review-adr.md`: version 0.2.0. Replace the first paragraph
   with "Review the architecture decision records (ADRs) a change adds or
   edits. A change that touches no ADR has no finding here.", and remove
   the section "For the code the change touches:" with its bullet. Keep the
   rest as it is.
5. `prompts/code-review-architecture.md`: version bumped by a patch level.
   After "Use architectural judgment. …" add the paragraph: "The recorded
   decisions (ADRs) are given. Code that departs from one is a finding:
   quote both. Do not review the decisions themselves."
6. `agister/cmd/agister/repo_settings_test.go`: `TestCodeReviewCollectsTheADRReview`
   becomes two assertions of the same kind: `code_review`'s judge collects
   exactly architecture, tests, adversarial and clarity; `adr_review`'s
   judge collects exactly the ADR review, and `adr_review_codex` gets
   `prompts/code-review-adr.md`. Each fails if its workflow's node set
   changes.
7. `agister/AGENTS.md`: after the code review bullet, add "- Review a
   change that adds or edits an ADR with `agister run adr_review --param
   base=<rev> --param candidate=<rev>`, before the code that follows it;
   its rulings are acted on the same way."

Use the quiet test commands from `agister/AGENTS.md`; report each with its
exit code and final line, and list every file you changed.
