# cmd/agister, the adapters (docs/settings-implementation.md, "The
# composition"; ADR-009, rule 4): each over spies on the ports it joins.

Feature: The adapters map one part's words to another's

  Scenario Outline: A reference is given to resolve as what it reads
    Given documents types a binding that reads <reads>
    When the source gives resolve the binding
    Then it reads <read>

    Examples:
      | reads                                        | read                                          |
      | the param "base"                             | the root param, the name "base"               |
      | the state "review"                           | the root state, the name "review"             |
      | the outputs of the step "a"                  | the root outputs, the name "a"                |
      | the field "v" of the outputs of the step "a" | the root outputs, the name "a", the field "v" |
      | the session of the step "a"                  | the root session, the name "a"                |
      | the field "fixed" of the item                | the root item, the field "fixed"              |

  Scenario: A value's origin carries its place
    Given documents types the workflow "w", whose first step names the
      agent "a" on line 4 of "/r/.agister/workflows/w.yaml"
    When the source gives resolve the workflow "w"
    Then the agent's name has the origin "/r/.agister/workflows/w.yaml",
      line 4, "steps[0].agent"

  Scenario: Check's resolve gives a workflow every param it declares
    Given the workflow "w" declares the params "base", with no default,
      and "goal"
    When check asks its resolve for the workflow "w"
    Then resolve is asked for the workflow "w", giving "base" and "goal"

  Scenario: A field's layer comes from its file
    Given home's folder "/u/.agister" and the repository's "/r/.agister"
    And documents' tree gives "instruction" from
      "/r/.agister/processes/p.yaml", line 2
    When check asks its fields of the process "p"
    Then it gives "instruction" from that file, line 2, in the repository

  Scenario: One command reads the settings once
    When "agister check" runs over a filesystem spy
    Then layout read each file once
