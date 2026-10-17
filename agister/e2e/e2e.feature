# The end-to-end check (docs/run-implementation.md, "A step on a model
# runtime" and "Continuation"): the built agister on real programs, claude-
# code and codex on the owner's logins. Opt-in: run only with AGISTER_E2E=1,
# by scripts/e2e.sh; skipped otherwise, saying so. A scratch git repository
# holds a process "ask", its input "q" from the param "q", its output schema
# an object of a string "answer"; AGISTER_HOME is a copy of home with the
# agents "e2e-haiku", claude-code's model "haiku", and "e2e-codex", codex at
# the effort "low", the least its models take.

Feature: agister runs a step on the real model runtimes

  Scenario Outline: A step on a real runtime completes
    When "agister run --process ask --agent <agent> --param q=hi" runs in
      the scratch repository
    Then it exits 0, the result completed, its output's "answer" a
      string, its usage's input and output tokens more than 0, and its
      session for "ask" not empty

    Examples:
      | agent     |
      | e2e-haiku |
      | e2e-codex |

  Scenario: Without AGISTER_E2E nothing runs
    When the end-to-end tests run without AGISTER_E2E
    Then each is skipped, saying AGISTER_E2E=1 runs it

  Scenario Outline: A run on a real runtime is continued
    Given "agister run --process ask --agent <agent> --param q=..." ran
      in the scratch repository, q asking to remember the word "kiwi"
    When "agister run --process ask --agent <agent> --param q=..."
      runs there with --continue and that run's id, q asking for the
      word
    Then it exits 0, its "answer" holding "kiwi", its session that of
      the first

    Examples:
      | agent     |
      | e2e-haiku |
      | e2e-codex |
