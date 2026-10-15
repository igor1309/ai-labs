# The behaviours of settings/resolve, before its code: what a reference
# reads (ADR-011, rules 3, 4 and 6). See request.feature for what resolve
# is given and what it gives. A reference's problem is its document's, at
# the reference's place and origin.

Feature: Resolve checks that every reference reads what is there

  Background:
    Given the workflow "w" declares the param "base" and the input "goal"
    And its steps are the step "a"; the branch "pick", of the arm "one",
      on a condition, and the default "other"; and the repeat "loop", of
      the state "review" and the body "fix"

  Scenario: What is declared, and has ended, is read
    Given the step reads "params.base", and the input goal's path too
    And the arm's condition reads "item.fixed" of all items in
      "steps.a.outputs.findings", and each arm's output its own outputs
    And the repeat's state reads "steps.a.outputs", its body and until
      "state.review", and its next "steps.fix.outputs"
    And the workflow's output reads "inputs.goal"
    When resolve is asked for the workflow "w"
    Then it resolves

  Scenario Outline: A reference reads what is there, wherever it is
    Given <where> reads "<reads>"
    When resolve is asked for the workflow "w"
    Then it refuses: the workflow "w", and the problem at "<place>":
      <problem>

    Examples:
      | where                     | reads            | place                        | problem                                   |
      | the step's input x        | params.head      | steps[0].inputs.x            | its workflow declares the param "head"    |
      | the step's input x        | inputs.brief     | steps[0].inputs.x            | its workflow declares the input "brief"   |
      | the step's input x        | state.review     | steps[0].inputs.x            | it is in no repeat of the state "review"  |
      | the step's input x        | steps.no.outputs | steps[0].inputs.x            | its workflow has the item "no"            |
      | the arm's condition       | params.head      | steps[1].branch[0].if        | its workflow declares the param "head"    |
      | the arm's output x        | params.head      | steps[1].branch[0].outputs.x | its workflow declares the param "head"    |
      | the repeat's state review | state.review     | steps[2].repeat.state.review | it is in no repeat of the state "review"  |
      | the repeat's next x       | params.head      | steps[2].repeat.next.x       | its workflow declares the param "head"    |
      | the repeat's until        | params.head      | steps[2].repeat.until        | its workflow declares the param "head"    |
      | the workflow's output x   | params.head      | outputs.x                    | its workflow declares the param "head"    |
      | the input goal's path     | params.head      | inputs.goal.path             | its workflow declares the param "head"    |
      | the workflow's output x   | steps.a.output   | outputs.x                    | it reads an item's outputs or its session |

  Scenario Outline: Items that may run together, or not both, cannot read each other
    Given the workflow "c" has a <operator> of "a" and "b"
    And "b" reads "steps.a.outputs"
    When resolve is asked for the workflow "c"
    Then it refuses: the item "a" <problem>

    Examples:
      | operator | problem                      |
      | parallel | runs beside it               |
      | branch   | is another arm of its branch |

  Scenario: An item reads the items that ended before it
    Given the step "a" reads "steps.pick.outputs"
    When resolve is asked for the workflow "w"
    Then it refuses: the item "pick" has ended before it

  Scenario: An item inside another is read through the item holding it
    Given the workflow's output "x" reads "steps.one.outputs"
    When resolve is asked for the workflow "w"
    Then it refuses: the item "one" is read through the item holding it

  Scenario: A session is a step's
    Given the workflow "c" has the workflow item "d", then the step "s"
    And "s" continues the session "steps.d.session"
    When resolve is asked for the workflow "c"
    Then it refuses: the item "d" is no step, and has no session

  Scenario Outline: A process's references read its own params and inputs
    Given the process "p" declares the param "base" and the input "rev"
    And its <where> reads "<reads>"
    When resolve is asked for a workflow with a step of "p"
    Then it refuses: the process "p", and the problem at "<place>":
      <problem>

    Examples:
      | where              | reads       | place              | problem                               |
      | environment's HEAD | params.head | environment.HEAD   | its process declares the param "head" |
      | input rev's rev    | params.head | inputs.rev.rev     | its process declares the param "head" |
      | revision           | inputs.head | workspace.revision | its process declares the input "head" |
