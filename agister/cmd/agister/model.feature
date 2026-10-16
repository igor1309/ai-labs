# cmd/agister, a step on a model runtime (docs/run-implementation.md, "A
# step on a model runtime"; ADR-003, rule 6): the composition builds a
# model's turn from the resolved settings and the snapshot's documents,
# with spies in place of the wrappers (ADR-009, rule 4): the settings,
# home's as shipped with the repository's process "ask", its prompt "ask"
# of the text "p", its guidance "g" of the text "rules", its instruction
# "i", its input "q" from the param "q", its environment A=1, its output
# schema "answer", its permissions requiring repository.read; a git, whose
# worktree root of "/r" is "/r"; the claude-code and codex wrappers; and
# the validator.

Feature: The composition runs a step on a model runtime

  Scenario: A step on claude-code is given its message, instruction,
    model, effort, options and schema
    When "agister run --process ask --agent claude-opus --param q=why"
      runs in "/r"
    Then claude-code runs the message of the sections "q" of "why",
      "prompt" of "p" and "g" of "rules", in that order, in "/r", its
      environment Agister's and A=1, the instruction "i", the model
      "opus", the effort "high", the options its plan gives, "Read", and
      the bytes of the schema "answer"

  Scenario: A step on codex is given its plan's one option
    When "agister run --process ask --agent codex-sol-61 --param q=why"
      runs in "/r"
    Then codex runs the message with the model "gpt-6.1-sol", the effort
      "high" and the option "read-only", its schema folder the system's
      temporary folder

  Scenario: A completed step prints its reply's output and usage
    Given claude-code replies with the structured output {"ok":true}, the
      cost 0.25 and the usage of 10 input and 3 output tokens, and the
      validator accepts it
    When "agister run --process ask --agent claude-opus --param q=why"
      runs in "/r"
    Then it prints the result, completed, its output {"ok":true}, its
      cost 0.25, its usage 10 input and 3 output tokens, the rest null,
      and its reason null, and exits 0

  Scenario: Each step runs on its own agent's runtime
    Given the repository's workflow "mixed" of a step "say" on bash, then
      a step "ask" on codex-sol-61
    When "agister run mixed --param what=hi --param q=why" runs in "/r"
    Then bash runs the script of "say", then codex the message of "ask",
      and claude-code runs nothing

  Scenario: Output the schema rejects fails the step
    Given claude-code replies with the structured output {"ok":1}, and
      the validator rejects it
    When "agister run --process ask --agent claude-opus --param q=why"
      runs in "/r"
    Then it prints the result, failed, class "invalid_output", the
      validator's reason, and exits 1

  Scenario: The validator is the schema's own
    Given the schema "answer" requires the field "ok" a boolean
    Then the composition's validator accepts {"ok":true}, and rejects
      {"ok":1} and {}, saying why

  Scenario: A schema that does not compile refuses the request
    Given the schema "answer" is {"type": 5}
    When "agister run --process ask --agent claude-opus --param q=why"
      runs in "/r"
    Then it prints to stderr that the schema "answer" does not compile,
      and why; nothing runs, and it exits 1

  Scenario: A step given a session is not run yet
    Given a workflow whose second step on claude-opus is given the
      session of its first
    When the workflow runs
    Then it prints to stderr that the session is not run yet, nothing
      runs, and it exits 1
