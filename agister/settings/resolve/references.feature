# The behaviours of settings/resolve, before its code: following
# references (ADR-002, rules 5 and 6; ADR-011, rules 2 and 6). See
# request.feature for what resolve is given and what it gives.

Feature: Resolve follows every name from the request

  Scenario: Every name a document gives is followed
    Given the workflow "w" has an input of the form "wb", and the step
      "s", the process "p" on the agent "a"
    And the process "p" names the prompt "pr", the guidance "g", the
      skill "k", an input of the form "b", and the output schema "sc"
    And the agent "a" names the runtime "r"
    When resolve is asked for the workflow "w"
    Then it reached, in this order, the workflow "w", the brief "wb", the
      process "p", the prompt "pr", the prompt "g", the skill "k", the brief "b", the
      schema "sc", the agent "a" and the runtime "r"

  Scenario: Every item is followed, in branches a run may not take too
    Given the workflow "w" has a parallel, a branch and a repeat
    And each holds a step, and the branch's default names the workflow "c"
    When resolve is asked for the workflow "w"
    Then it reached every step's process and agent, and the workflow "c"
      and all it reaches

  Scenario: A problem refuses with the chain that reached it
    Given the workflow "w" has the step "s", the process "p" on the agent "a"
    And the process "p" names the prompt "pr", on line 3 of its file
    And the prompt "pr" has the problem "no layer holds it"
    When resolve is asked for the workflow "w"
    Then it refuses: the prompt "pr", reached by the workflow "w", the
      process "p" at "steps[0].process" and the prompt "pr" at "prompt",
      line 3, and the problem "no layer holds it"

  Scenario: Every document at fault is given once, with its first chain
    Given the processes "p" and "q" both name the prompt "pr"
    And the process "q" names the schema "sc"
    And the workflow "w" has the steps "s" of "p" and "t" of "q", in order
    And the prompt "pr" and the schema "sc" each have a problem
    When resolve is asked for the workflow "w"
    Then it refuses: the prompt "pr", by its chain through "p", and the
      schema "sc", by its chain through "q", in that order

  Scenario: A document with a problem is not followed
    Given the process "p" has a problem
    When resolve is asked for the workflow "w" with a step of "p"
    Then it refuses: the process "p" alone

  Scenario: A problem nothing in the request reaches refuses nothing
    Given the process "q" has a problem, and no step of "w" names it
    When resolve is asked for the workflow "w"
    Then it gives the workflow "w"

  Scenario: A workflow that reaches itself is refused
    Given the workflow "w" names the workflow "c", which names "w"
    When resolve is asked for the workflow "w"
    Then it refuses: the workflow "w", reached by "w", "c" and "w", and
      the problem "it reaches itself"
