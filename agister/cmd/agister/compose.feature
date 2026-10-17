# cmd/agister, the composition (docs/settings-implementation.md, "The
# composition"; ADR-001, rule 3; ADR-009, rule 4): the parts, and cli,
# integrated with spies in place of the wrappers: a filesystem holding
# home's files as Agister ships them, at "/u/.agister"; a git, whose
# worktree root of "/r" and below is "/r"; and the runtime facts, each
# wrapper's as runtime/<name> gives them.

Feature: The composition checks and inspects settings

  Scenario: Shipped settings check clean
    When "agister check" runs in "/r", which has no .agister
    Then it prints no fault, every name resolves, and it exits 0

  Scenario: A missing runtime is reported with what it refuses
    Given "/r/.agister/agents/claude-opus.toml" names the runtime "gone"
    When "agister check" runs in "/r"
    Then it prints the runtime "gone", which no layer holds, refusing the
      agent "claude-opus" and the workflows "adr_review" and
      "code_review"
    And it exits 1

  Scenario: A blocked document is reported with what it refuses
    Given "/r/.agister/blocks.yaml" blocks the process "review_judge", for
      "not here"
    When "agister check" runs in "/r"
    Then it prints the process "review_judge", blocked on line 1: not
      here, refusing the process "review_judge" and the workflows
      "adr_review" and "code_review"
    And it exits 1

  Scenario: A field is shown with its layer
    Given "/r/.agister/processes/review.yaml", over home's, gives its own
      "instruction"
    When "agister inspect process review" runs in "/r"
    Then it shows "instruction" from "/r/.agister/processes/review.yaml",
      in the repository, and "schema" from home's file, in home

  Scenario: A step's plan comes through the source and the facts
    When "agister inspect workflow code_review" runs in "/r"
    Then it shows the plans of the five reviews, each taking codex's
      option "read-only", and of the judge, taking none
    And no fault: codex and claude-code take the agents' effort "high"

  Scenario: The command runs over every runtime wrapper and the user's home
    Given the program is built as main builds it, the user's home "/u"
    When "agister check" runs
    Then the port reads home at "/u/.agister", and the facts of
      claude-code/3, codex/2, pi/1 and bash/1

  Scenario: A launch through a link reads the settings where it leads
    Given the link "/o/x" to "/r/a", and "/o/.agister" holding a process
      "stray"
    When "agister inspect processes" runs in "/o/x"
    Then it lists home's processes, and not "stray"

  Scenario: AGISTER_HOME names home's folder
    Given the program is built as main builds it, the user's home "/u",
      and AGISTER_HOME "/h"
    When "agister check" runs
    Then the port reads home at "/h"
