# The behaviours of settings/resolve, before its code: what a reference
# reads (ADR-011, rules 3 and 6). See request.feature for what resolve is
# given and what it gives. A reference's problem is its document's, at
# the reference's place and origin.

Feature: Resolve checks that every reference reads what is there

  Scenario Outline: A reference reads what its workflow declares
    Given the workflow "w" declares the param "base" and the input "goal"
    And its step "s" binds "x" from "<reads>"
    When resolve is asked for the workflow "w"
    Then it refuses: the workflow "w", and the problem at
      "steps[0].inputs.x": <problem>

    Examples:
      | reads        | problem                                   |
      | params.head  | its workflow declares the param "head"    |
      | inputs.brief | its workflow declares the input "brief"   |
      | state.review | a repeat it is in declares the state "review" |

  Scenario: An item reads the items that ended before it
    Given the workflow "w" has the steps "a", then "b", then "c"
    And "b" reads "steps.a.outputs" and "steps.c.outputs"
    When resolve is asked for the workflow "w"
    Then it refuses: the workflow "w", and the problem at "b"'s binding
      of "steps.c.outputs": the item "c" has ended before it

  Scenario: Concurrent items cannot read each other
    Given the workflow "w" has a parallel of "a" and "b"
    And "b" reads "steps.a.outputs"
    When resolve is asked for the workflow "w"
    Then it refuses: the item "a" has ended before it

  Scenario: An item inside another is read through the item holding it
    Given the workflow "w" has the parallel "reviews" of "a", then "judge"
    And "judge" reads "steps.reviews.outputs" and "steps.a.outputs"
    When resolve is asked for the workflow "w"
    Then it refuses only "steps.a.outputs": the item "a" is read through
      the item holding it

  Scenario: Inside a repeat, its body, next and until read its state
    Given the workflow "w" has a repeat of the state "review" and the
      body "repair", reading "state.review"
    And its next reads "steps.repair.outputs", and its until reads
      "state.review.findings"
    When resolve is asked for the workflow "w"
    Then it resolves

  Scenario: A session is a step's
    Given the workflow "w" has the workflow item "c", then the step "s"
    And "s" continues the session "steps.c.session"
    When resolve is asked for the workflow "w"
    Then it refuses: the item "c" is a step, with a session

  Scenario: A process's references read its own params and inputs
    Given the process "p" declares the param "base"
    And its environment binds "HEAD" from "params.head"
    When resolve is asked for a workflow with a step of "p"
    Then it refuses: the process "p", and the problem at
      "environment.HEAD": its process declares the param "head"
