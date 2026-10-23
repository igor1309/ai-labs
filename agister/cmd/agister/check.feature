# cmd/agister, check's resolve (docs/settings-implementation.md, "Check"):
# what a run of a workflow does not run yet, check refuses too, in the
# run's own words.

Feature: Check refuses what a run does not run yet

  Scenario Outline: A workflow a run refuses before it starts, check refuses
    Given the workflow "w" holds <holding>
    When check asks its resolve for the workflow "w"
    Then it refuses the workflow "w", with the problem "<line>"
    And "agister run w" refuses with the same line, and nothing runs

    Examples:
      | holding                                    | line                                                                      |
      | the workflow item "c", of the workflow "v" | the workflow "w": the item "c", a workflow, is not run yet                |
      | the step "s" of "say" on the agent "pi-m3" | the step "s": the runtime "pi"'s turn is not run yet                      |
      | the input "d" from the source "git.diff"   | the workflow "w": the input "d" from the source "git.diff" is not run yet |

  Scenario: A workflow a run runs is not refused for it
    Given the workflow "w" of the steps "a" and "b", each of "say" on
      "bash"
    When check asks its resolve for the workflow "w"
    Then it resolves

  Scenario: A process asked for alone is refused for a source a run does not take
    Given the process "say" names an input "d" from the source "git.diff"
    When check asks its resolve for the process "say"
    Then it refuses the process "say", with the problem "the process
      "say": the input "d" from the source "git.diff" is not run yet"

  Scenario: A process's line is the process's, reported once
    Given the process "say" names an input "d" from the source
      "git.diff", and the workflows "w1" and "w2" each have a step of it
    When "agister check" runs
    Then it reports the process "say" once, with the problem "the
      process "say": the input "d" from the source "git.diff" is not run
      yet", refusing "say", "w1" and "w2"

  Scenario: Inspect shows a workflow a run does not run yet as refused
    Given the workflow "w" holds the workflow item "c", of the workflow
      "v"
    When "agister inspect workflow w" runs
    Then it shows the refusal, with the line "the workflow "w": the item
      "c", a workflow, is not run yet", and no plan
