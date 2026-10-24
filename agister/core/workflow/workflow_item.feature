# core/workflow, a workflow item: a named workflow run in its caller's
# place, its params bound by the item, its outputs what the caller reads.
# Spies answer its ports.

Feature: A workflow runs as an item of its caller

  Background:
    Given the workflow "lens" of the params "goal" and "depth", "depth"
      of the default "2": the step "draft" binding "g" from params.goal,
      then the step "polish" binding "d" from params.depth and "r" from
      steps.draft.outputs.text; its output "output" from
      steps.polish.outputs
    And the workflow "w": the item "tests", of the workflow "lens",
      binding "goal" from params.goal, then the step "judge" binding
      "reviews" from steps.tests.outputs

  Scenario: The item's steps run in order, each with its bindings
    Given "draft" completes with {"text": "t"}
    When "w" runs with goal "ship"
    Then the caller is asked for "tests/draft" with g "ship", then
      "tests/polish" with d "2" and r "t", then "judge"

  Scenario: A workflow of one output named output gives that value whole
    Given "polish" completes with {"verdict": "approve"}
    When "w" runs with goal "ship"
    Then "judge" is called with reviews {"verdict": "approve"}

  Scenario: A workflow of other outputs gives them as a mapping
    Given "lens" maps "verdict" from steps.polish.outputs.verdict and
      "text" from steps.draft.outputs.text, and no output "output"
    And "draft" completes with {"text": "t"}, "polish" with
      {"verdict": "approve"}
    When "w" runs with goal "ship"
    Then "judge" is called with reviews {"verdict": "approve", "text":
      "t"}

  Scenario: The item's steps read only its own boundary and outputs
    Given "w" has, before "tests", the step "draft" completing with
      {"text": "outer"}
    And the item's "draft" completes with {"text": "inner"}
    When "w" runs with goal "ship"
    Then "tests/polish" is called with r "inner"

  Scenario: A session continued inside the item is the item's own
    Given "polish" continues the session of steps.draft
    And "w" has, before "tests", the step "draft", its session "outer"
    And the item's "draft" leaves the session "inner"
    When "w" runs with goal "ship"
    Then "tests/polish" continues "inner"

  Scenario: A repeat inside the item is told by the item and its pass
    Given "lens" holds, after "draft", the repeat "debate" of the step
      "revise", max 2, until steps.revise.outputs.done equals true
    And "revise" completes with {"done": false}, then {"done": true}
    When "w" runs with goal "ship"
    Then the caller is asked for "tests/draft", "tests/revise/1", then
      "tests/revise/2"
    And the events are told "tests/debate" stopped "until" after 2 passes

  Scenario: An item step that does not complete ends the run
    Given "draft" fails, class "runtime_error"
    When "w" runs with goal "ship"
    Then "tests/polish" and "judge" are not called, and the run ends
      failed, class "runtime_error"

  Scenario: A workflow item in a parallel runs beside its steps
    Given "w"'s first item is the parallel "reviews", max 1, of the step
      "arch", then the item "tests", then the step "intent"; then the
      step "judge" binding "reviews" from steps.reviews.outputs
    And "polish" completes with {"verdict": "approve"}
    When "w" runs with goal "ship"
    Then the caller is asked for "arch", "tests/draft", "tests/polish",
      then "intent", one at a time
    And "judge" is called with reviews of three outcomes, the second
      {"status": "completed", "class": null, "output": {"verdict":
      "approve"}}

  Scenario: A workflow item in a parallel that does not complete is its slot's failure
    Given "w"'s first item is the parallel "reviews" of the step "arch"
      and the item "tests"; then the step "judge"
    And "draft" fails, class "runtime_error", "arch" completes
    When "w" runs with goal "ship"
    Then "tests/polish" is not called, and "judge" is called with the
      second outcome {"status": "failed", "class": "runtime_error",
      "output": null}

  Scenario: The run's cost and usage count the item's calls
    Given "draft" and "polish" each cost 0.5 and use 10 tokens
    When "w" runs with goal "ship"
    Then the run's cost counts 1.0 and 20 tokens for the item
