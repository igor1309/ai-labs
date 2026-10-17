# runtime/claudecode, a resumed turn (docs/run-implementation.md,
# "Continuation"; ADR-004, rule 5). A spy answers in place of the
# supervisor (ADR-009, rule 3).

Feature: The claude-code wrapper resumes a session

  Scenario: A turn given a session resumes it
    When claude-code runs the message "m" with the session "s1"
    Then the supervisor is given the text "m", and the arguments those
      of a turn given nothing else, then "--resume", "s1"
