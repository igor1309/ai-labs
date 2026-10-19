# settings/resolve, a step continuing a session (docs/run-implementation.md,
# "A binding continuing a session"; ADR-011, rule 3): what resolve checks
# of the step a session is read from, beyond what bindings.feature gives.

Feature: Resolve checks the session a step continues

  Scenario: A session stays on its agent
    Given the workflow "c" has the step "d" on the agent "a2", then the
      step "s" on "a1", continuing "steps.d.session"
    When resolve is asked for the workflow "c"
    Then it refuses: the problem at "steps[1].session": the step "d"
      runs on another agent, "a2"

  Scenario Outline: Two steps of a parallel do not continue one session
    Given the workflow "c" has the step "d", then the step "e"
      continuing "steps.d.session", then the parallel "p" of "x",
      continuing "steps.d.session", and "y", continuing "<reads>"
    When resolve is asked for the workflow "c"
    Then it refuses: the problem at "steps[2].parallel[1].session": the
      step "x" beside it continues the session of "d"

    Examples:
      | reads           |
      | steps.d.session |
      | steps.e.session |
