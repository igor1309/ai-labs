# cmd/agister, capacity (docs/run-implementation.md, "Capacity"; ADR-004,
# rule 8): a turn at capacity reported, with spies in place of the
# wrappers (ADR-009, rule 4). Settings as progress.feature gives them.

Feature: The composition reports a turn at capacity

  Scenario: A retried turn is a progress line and an event
    Given claude-code fails at capacity, "Overloaded", then, retried,
      completes
    When "agister run --process ask --agent claude-opus --param q=why"
      runs in "/r"
    Then stderr has the line "· ask: at capacity; retrying in 30s"
    And runstore is given the event "capacity" of "ask", its reason
      "Overloaded", retrying
    And it prints the result completed
