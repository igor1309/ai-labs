# The behaviours of settings/check, before its code: inspect (ADR-002,
# rule 8). Its ports are check's (check.feature); its fields port gives a
# document's fields, each its place, its value as text and its source: a
# file, a line and the layer of the file. Check spells no field of any
# kind: it shows them as given, but for a description, which a listing
# reads by its place.

Feature: Inspect lists processes, workflows and agents, and shows one

  Scenario Outline: A listing gives each name of its kind, with what it is
    Given the layers hold the <kind> "x", in home and the repository,
      and the <kind> "y", in the project
    And the <kind> "x" has the field "description", "reviews a branch"
    And resolve resolves the <kind> "x" and refuses the <kind> "y"
    When inspect lists the <kind>s
    Then it gives "x", "reviews a branch", in home and the repository,
      resolving
    And it gives "y", with no description, in the project, refused

    Examples:
      | kind     |
      | process  |
      | workflow |
      | agent    |

  Scenario: A listing gives no other kind
    Given the layers hold the process "p" and the runtime "r"
    When inspect lists the processes
    Then it gives "p" alone

  Scenario: A document shown gives each field with its source
    Given the process "p" has the field "prompt", "review", from
      "home/processes/p.yaml", line 2, in home
    And the field "permissions.require[0]", "edit", from
      ".agister/processes/p.yaml", line 4, in the repository
    When inspect shows the process "p"
    Then it gives "prompt", "review", from "home/processes/p.yaml", line
      2, in home
    And then "permissions.require[0]", "edit", from
      ".agister/processes/p.yaml", line 4, in the repository

  Scenario: A document shown gives what resolve gives
    Given resolve resolves the workflow "w": it reached the workflow "w",
      the process "p" and the agent "a"; the step "steps[0]" has a plan;
      and it warns "the runtime grants beyond the allowed: net"
    When inspect shows the workflow "w"
    Then it gives its fields, then the documents reached, the plan of
      "steps[0]" and the warning

  Scenario: A document refused gives each fault with its chain
    Given resolve refuses the workflow "w": the agent "a", reached by the
      workflow "w" at "steps[0].agent", with the problem "runtime is
      missing"
    When inspect shows the workflow "w"
    Then it gives its fields, then the refusal: the agent "a", reached by
      the workflow "w" at "steps[0].agent", with the problem "runtime is
      missing"

  Scenario: A document no layer holds is shown as not held
    Given no layer holds the agent "z"
    When inspect shows the agent "z"
    Then it gives that no layer holds the agent "z", and asks resolve
      nothing
