# The behaviours of settings/resolve, before its code: the boundaries
# between a workflow, its children and its caller (ADR-011, rule 3). See
# request.feature for what resolve is given and what it gives.

Feature: Resolve checks what crosses each boundary

  Scenario: A step binds the params its process declares
    Given the process "p" declares the param "base", of no default, and
      the param "goal", of a default
    And the step "s" of "p" binds "base" and "head"
    When resolve is asked for its workflow "w"
    Then it refuses: the workflow "w", and the problem at
      "steps[0].inputs.head": the process "p" declares the param "head"

  Scenario: A step binds every param of no default
    Given the process "p" declares the param "base", of no default
    And the step "s" of "p" binds none
    When resolve is asked for its workflow "w"
    Then it refuses: the problem at "steps[0]": it binds the param "base"
      of the process "p", which has no default

  Scenario: A workflow item binds the params its workflow declares
    Given the workflow "c" declares the param "base", of no default
    And the item "child" of "w" names "c" and binds "head"
    When resolve is asked for the workflow "w"
    Then it refuses: the workflow "w", and the problems at
      "steps[0].inputs.head": the workflow "c" declares the param "head";
      and at "steps[0]": it binds the param "base" of the workflow "c",
      which has no default

  Scenario: A child workflow is read through its outputs
    Given the workflow "c" has the output "verdict"
    And the item "child" of "w" names "c", and "w" reads
      "steps.child.outputs.verdict" and "steps.child.outputs.summary"
    When resolve is asked for the workflow "w"
    Then it refuses only "steps.child.outputs.summary": the workflow "c"
      gives the output "summary"

  Scenario: Every arm of a branch gives the branch's outputs
    Given the branch "decide" of "w" has the arms "fix", of the outputs
      "summary" and "diff", and "done", of the output "summary"
    When resolve is asked for the workflow "w"
    Then it refuses: the problem at "steps[0].branch[1].outputs": it
      gives the output "diff", as another arm of its branch does

  # The request's problems are its own, not its document's: the workflow
  # is not at fault for a param a request leaves out.

  Scenario: The request gives the params its workflow declares
    Given the workflow "w" declares the param "base", of no default
    When resolve is asked for the workflow "w" with the param "head"
    Then it refuses, of no document and no chain, with the problems: the
      request gives the param "base", which has no default; and the
      workflow declares the param "head"

  Scenario Outline: A step requested alone takes its process's params
    Given the process "p" declares the param "base", of no default
    When resolve is asked for the step of "p" on "a" <with>
    Then <outcome>

    Examples:
      | with                  | outcome                                                                                           |
      | with the param "base" | it resolves                                                                                       |
      | with no param         | it refuses, of no document and no chain: the request gives the param "base", which has no default |
