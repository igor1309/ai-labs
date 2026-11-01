# core/workflow, a workflow item's child run told to the events: its
# start, then its end, its id the run's own and the item's name.
# Spies answer its ports.

Feature: A workflow item is a child run, told to the events

  Background:
    Given the workflow "lens" of the param "goal": the step "draft"
      binding "g" from params.goal; its output "output" from
      steps.draft.outputs
    And the workflow "w": the item "tests", of the workflow "lens",
      binding "goal" from params.goal

  Scenario: A completed item is told as started, then completed
    Given "draft" completes with {"verdict": "approve"}
    When "w" runs with goal "ship"
    Then the events are told the child run "tests" of "lens" started,
      its params {"goal": "ship"} and its inputs {}, before "tests/draft"
      starts
    And then that it ended completed, class null, its output
      {"verdict": "approve"}

  Scenario: A failed item is told as ended failed, of its step's class
    Given "draft" fails, class "runtime_error"
    When "w" runs with goal "ship"
    Then the events are told the child run "tests" ended failed, class
      "runtime_error", its output null
