# cmd/agister, a workflow item runs: a review whose tests lens is a
# workflow of its own, built from settings and run on spies in place of
# the wrappers.
# Settings: the repository's workflow "lens", of the param "goal": the
# step "draft" of "tests_review" on "codex-sol-61", then the repeat
# "debate" of the step "critique" of "review_critique" on "claude-opus"
# and the step "revise" of "review_revise" on "codex-sol-61",
# continuing steps.draft.session, until steps.critique.outputs.verdict
# equals "converged", max 2; its output "output" from the repeat's
# state "review". The workflow "reviewed": the parallel "reviews", max
# 1, of the step "arch" of "architecture_review" on "codex-sol-61" and
# the item "tests" of the workflow "lens", binding "goal" from
# params.goal; then the step "judge" of "review_judge" on
# "claude-opus", binding "reviews" from steps.reviews.outputs.

Feature: A workflow item runs in its caller's place

  Scenario: The item's calls run in its slot, and the join reads its output whole
    Given the critique converges on its first pass
    When "agister run reviewed --param goal=g.md" runs in "/r"
    Then the calls made are arch, tests/draft, tests/critique/1,
      tests/revise/1, judge
    And "judge" is given reviews whose second outcome's output is
      "tests/revise/1"'s review, not a mapping around it

  Scenario: The revise continues the draft's session, inside the item
    Given the critique converges on its second pass
    When "agister run reviewed --param goal=g.md" runs in "/r"
    Then "tests/revise/1" continues the session of "tests/draft", and
      "tests/revise/2" the same session, from "tests/revise/1"

  Scenario: The record and progress name each call by the item
    Given the critique converges on its first pass
    When "agister run reviewed --param goal=g.md" runs in "/r"
    Then the record's calls include "<run id>/tests/draft" and
      "<run id>/tests/critique/1"
    And stderr has a line "tests/draft" started on "codex-sol-61", and
      a line "tests/debate" stopped "until" after 1 pass

  Scenario: Check passes the workflow
    When "agister check" runs in "/r"
    Then it refuses nothing of the workflows "reviewed" and "lens"
