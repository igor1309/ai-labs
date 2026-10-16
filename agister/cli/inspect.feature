# cli (docs/settings-implementation.md, "The composition"): inspect. Its
# givens are commands.feature's.

Feature: The command line inspects settings

  Scenario Outline: inspect asks the port to list a kind, or show one
    When "agister inspect <args>" runs
    Then it asks the port to <request>

    Examples:
      | args       | request               |
      | processes  | list the processes    |
      | workflows  | list the workflows    |
      | agents     | list the agents       |
      | process p  | show the process "p"  |
      | workflow w | show the workflow "w" |
      | agent a    | show the agent "a"    |

  Scenario: A listing prints each name, its layers and whether it resolves
    Given the port lists the process "a", in home and the repository,
      resolving, and "b", in the project, refused
    When "agister inspect processes" runs
    Then it prints "a", home and repository, resolves; then "b",
      project, refused
    And it exits 0

  Scenario: A show prints each field with its source, then what resolves
    Given the port shows the workflow "w": the field "steps[0].agent",
      "a", from "/r/.agister/workflows/w.yaml", line 4, in the repository;
      the documents reached; the plan of "steps[0]"; and one warning
    When "agister inspect workflow w" runs
    Then it prints the field with its value, file, line and layer; then
      the documents reached, the plan and the warning
    And it exits 0

  Scenario: A show of a refused document prints the refusal with its chains
    Given the port shows the workflow "w", refused: the agent "a", reached
      by the workflow "w" at "steps[0].agent", with the problem "runtime
      is missing"
    When "agister inspect workflow w" runs
    Then it prints the fault, its chain and its problem
    And it exits 0

  Scenario: A document no layer holds is said so
    Given the port shows that no layer holds the agent "z"
    When "agister inspect agent z" runs
    Then it prints that no layer holds the agent "z", and exits 1
