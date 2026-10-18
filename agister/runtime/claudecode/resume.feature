# runtime/claudecode, a resumed turn (docs/run-implementation.md,
# "Continuation" and "Recovery"; ADR-004, rule 5; ADR-006, rule 3). A spy
# answers in place of the supervisor (ADR-009, rule 3).

Feature: The claude-code wrapper resumes a session

  Scenario: A turn given a session resumes it
    When claude-code runs the message "m" with the session "s1"
    Then the supervisor is given the text "m", and the arguments those
      of a turn given nothing else, then "--resume", "s1"

  Scenario: A turn a signal ended gives the session it read
    Given claude's stream gives a first line naming the session "s1"
    When the program is ended by SIGTERM
    Then the turn gives no reply, and the session "s1"
