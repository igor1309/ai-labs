# supervisor, a wrapper (docs/run-implementation.md, "The first run" and
# "A step on a model runtime"; ADR-012, rule 6): starts a program and its
# group, gives it its stdin, streams its stdout's lines, keeps the ends of
# its output, and ends all it started. Contract tests against real programs
# (ADR-009, rule 3); a timer spy keeps the grace (rule 5).

Feature: The supervisor runs a program and ends all it started

  Scenario: A program runs in its directory with its environment
    Given a temporary directory "d"
    When the supervisor runs "sh -c 'pwd; echo $X'" in "d" with X=1
    Then stdout is the path of "d", its links resolved, then "1"
    And the program exited with code 0

  Scenario: The exit code is kept
    When the supervisor runs "sh -c 'exit 3'"
    Then the program exited with code 3

  Scenario: Each stream keeps its first and last 16 KiB, size and digest
    When the supervisor runs a program printing 100 KiB to stdout and
      "e" to stderr
    Then stdout's head is its first 16 KiB and its tail its last 16 KiB,
      its size 102400 and its digest the SHA-256 of all of it
    And stderr's head and tail are both "e"

  Scenario: A program that cannot start is an error that says so
    When the supervisor runs "no-such-program-xyz"
    Then it gives an error that the program could not start

  Scenario: An ended context ends the program and all it started
    Given a program that starts a child sleeping 60 seconds, then sleeps
    When its context ends after the child has started
    Then the program and the child are sent SIGTERM, and are gone when
      the supervisor returns, the grace timer not passed
    And it gives that the program was ended by a signal

  Scenario: A program that ignores SIGTERM is killed when the grace passes
    Given a program that traps SIGTERM and sleeps on, ready once trapped
    When its context ends, and the grace timer passes 2s
    Then it is sent SIGKILL, and is gone when the supervisor returns

  Scenario: What a program leaves running is ended when it exits
    Given a program that starts a child sleeping 60 seconds, then exits 0
    When the supervisor runs it
    Then the program exited with code 0, and the child is gone

  Scenario: Output held open by what left the group is not waited on
    Given a program that starts a child in a session of its own, holding
      stdout, then exits 0
    When the supervisor runs it, and the grace timer passes 2s
    Then it gives that the program exited with code 0, its streams kept
      so far and marked incomplete

  Scenario: Where a program's exit cannot be observed, nothing starts
    Given a platform where the supervisor cannot observe a program's
      exit before reaping it
    When the supervisor runs "sh -c 'exit 0'"
    Then it gives an error that the program could not start, and
      nothing was started

  Scenario: A signal from elsewhere is given by name
    Given a program that kills itself with SIGKILL
    When the supervisor runs it
    Then it gives that the program was ended by the signal "killed"

  Scenario: The text given is the program's stdin, written as stdout is
    read
    When the supervisor runs "cat" given 1 MiB of text
    Then stdout's size is 1 MiB, its digest that of the text, and the
      program exited with code 0

  Scenario: Each line of stdout is given as it is read
    Given a program that prints "a", then waits until "a" is given, then
      prints "b" and a last line with no newline "c"
    When the supervisor runs it with a line function
    Then the function is given "a", then "b", then "c", and the program
      exited with code 0

  Scenario: Stdin a program does not read does not hold the supervisor
    When the supervisor runs "sh -c 'exit 2'" given 1 MiB of text
    Then the program exited with code 2, and no error is given
