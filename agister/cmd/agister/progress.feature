# cmd/agister, progress (docs/run-implementation.md, "Inputs and
# progress"): what core reports of a run, printed to stderr as it comes,
# with spies in place of the wrappers and the clock (ADR-009, rule 4).
# Settings: home's as shipped, with the repository's process "ask" on a
# model, as model.feature gives it, and the bash process "say".

Feature: The composition prints a run's progress to stderr

  Scenario: A model step's start, tool calls and end
    Given claude-code reports the tool calls "Bash" given
      {"command":"go test"} and "Read" given {"file_path":"a.go"}, then
      replies, and the clock gives the step 3m2s
    When "agister run --process ask --agent claude-opus --param q=why"
      runs in "/r"
    Then stderr is, in order:
      """
      · ask: started on claude-opus
      · ask: Bash {"command":"go test"}
      · ask: Read {"file_path":"a.go"}
      · ask: ended completed in 3m2s
      """
    And stdout holds only the result

  Scenario: A failed step's end names its class
    Given codex's turn fails, class "rate_limited", in 4s
    When "agister run --process ask --agent codex-sol-61 --param q=why"
      runs in "/r"
    Then stderr ends with "· ask: ended failed rate_limited in 4s"

  Scenario: A tool call's line is one line, cut to 200 bytes
    Given codex reports the tool call "shell" with a command of 300
      bytes, a newline among them, and the clock gives the step 1.6s
    When "agister run --process ask --agent codex-sol-61 --param q=why"
      runs in "/r"
    Then its line on stderr is "· ask: shell " and the command, its
      newline a space, cut so the line is 200 bytes
    And the step's last line ends "in 2s"

  Scenario: A bash step prints its start and end
    When "agister run --process say --agent bash --param what=hi" runs
      in "/r"
    Then stderr is "· say: started on bash" and "· say: ended completed
      in" its time
