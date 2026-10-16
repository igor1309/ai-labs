# The bash wrapper's turn (docs/run-implementation.md, "The first run";
# ADR-012, rule 2): a script run by bash, through the supervisor.
# Contract tests against the real bash (ADR-009, rule 3).

Feature: The bash wrapper runs a script in one turn

  Scenario: A script runs in its directory with its environment
    Given a temporary directory "d"
    When bash runs the script "pwd; echo \"$goal\"" in "d" with goal=g
    Then stdout is the path of "d", then "g", and the exit code 0

  Scenario: The script's exit code and stderr are given
    When bash runs the script "echo e >&2; exit 4"
    Then the exit code is 4, and stderr "e"

  Scenario: Bash that cannot start is an error that says so
    Given the program "no-such-bash-xyz" in place of bash
    When it runs the script "true"
    Then it gives an error that the program could not start
