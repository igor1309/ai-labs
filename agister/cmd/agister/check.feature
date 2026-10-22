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
      | holding                                          | line                                                                      |
      | the branch "b", whose default is a step of "say" | the workflow "w": the item "b", a branch, is not run yet                  |
      | the repeat "r", whose body is a step of "say"    | the workflow "w": the item "r", a repeat, is not run yet                  |
      | the step "s" of "say" on the agent "pi-m3"       | the step "s": the runtime "pi"'s turn is not run yet                      |
      | the input "d" from the source "git.diff"         | the workflow "w": the input "d" from the source "git.diff" is not run yet |

  Scenario: A workflow a run runs is not refused for it
    Given the workflow "w" of the steps "a" and "b", each of "say" on
      "bash"
    When check asks its resolve for the workflow "w"
    Then it resolves

  Scenario: A process asked for alone is paired with no agent
    Given the process "say" names an input "prompt" from the param "what"
    When check asks its resolve for the process "say"
    Then it resolves: what a run does not run depends on its agent
