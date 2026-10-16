# The bash wrapper's turn (docs/run-implementation.md, "The first run";
# ADR-012, rule 2): a script run by bash, through the supervisor. A spy
# answers in place of the supervisor (ADR-009, rule 3).

Feature: The bash wrapper runs a script in one turn

  Scenario: A turn asks the supervisor for bash -c and the script
    When bash runs the script "echo hi" in "/r" with goal=g
    Then the supervisor is asked to run "bash", "-c", "echo hi" in "/r"
      with goal=g

  Scenario: What the supervisor gives is the turn's
    Given the supervisor gives the exit code 4, stdout "o" and stderr "e"
    When bash runs a script
    Then the turn gives the exit code 4, stdout "o" and stderr "e", each
      its head, tail, size and digest as given

  Scenario: A program that could not start is the turn's
    Given the supervisor gives that the program could not start
    When bash runs a script
    Then the turn gives that its program could not start
