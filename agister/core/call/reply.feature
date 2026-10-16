# core/call, what a call keeps of its reply (docs/run-implementation.md,
# "A step on a model runtime"; ADR-001, invariant 3; ADR-012, rule 5):
# usage, session, cost and reason. A spy answers the runtime protocol and
# a validator spy the schema (ADR-009, rule 1).

Feature: A call keeps its reply's usage, session, cost and reason

  Scenario: Usage, session and cost are as the runtime reported them
    Given a model step, and the turn's reply of the session "s1", the
      cost 0.25, and the usage of 10 input and 3 output tokens
    When the call is made
    Then its session is "s1", its cost 0.25, and its usage 10 input and
      3 output tokens, cache read, cache write and reasoning unknown,
      printed as null

  Scenario: A bash call has no usage
    Given a bash step whose script exits 0
    When the call is made
    Then it has no usage, printed as null

  Scenario: A failed call keeps the runtime's reason
    Given a model step, and the turn's reply of the failure class "auth"
      and the reason "not logged in"
    When the call is made
    Then it ends failed, class "auth", its reason "not logged in"

  Scenario: A reason is cut to 1 KiB
    Given a model step, and the turn's reply of the failure class
      "runtime_error" and a reason of 2 KiB
    When the call is made
    Then its reason is the first KiB of it

