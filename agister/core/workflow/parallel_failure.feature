# A join needs at least one completed node (ADR-012, rule 8).

Feature: A parallel with no completed node ends before its join

  Scenario Outline: No completed node means no join
    Given a parallel "p", max <max>, whose first node fails at capacity,
      reason "busy", and whose second is interrupted by a timeout
    And each costs 1 and reports its own warning
    When the workflow runs
    Then both nodes end, and no join starts
    And the run fails, class "capacity", naming "p" and "busy"
    And the run counts both costs and warnings in declaration order

    Examples:
      | max     |
      | omitted |
      | 1       |
      | 2       |
