# cmd/agister, the composition (docs/settings-implementation.md, "The
# composition"; ADR-001, rule 3): the parts connected on real files, in a
# temporary folder: home's, and a git repository's.

Feature: The composition checks and inspects settings on files

  Scenario: Shipped settings check clean
    Given home's folder holds agister/home
    When "agister check" runs in a git repository with no .agister
    Then it prints no fault, and every name resolves

  Scenario: A broken document is reported with what it refuses
    Given home's folder holds agister/home
    And the repository's .agister holds "agents/claude-opus.toml" with
      a runtime no layer holds
    When "agister check" runs in the repository
    Then it prints the agent "claude-opus", with its problem at its file
      in the repository, refusing each workflow that names it
    And it exits 1

  Scenario: A blocked document is reported with its block
    Given home's folder holds agister/home
    And the repository's .agister holds "blocks.yaml" blocking the process
      "implement", for "not here"
    When "agister check" runs in the repository
    Then it prints the process "implement", blocked on line 1: not here

  Scenario: A field is shown with its layer
    Given home's folder holds agister/home
    And the repository's .agister holds "processes/review.yaml" extending
      home's, with its own "limits.time"
    When "agister inspect process review" runs in the repository
    Then it shows "limits.time" from the repository's file, and "prompt"
      from home's

  Scenario: A step's plan is reached through the source and the facts
    Given home's folder holds agister/home
    When "agister inspect workflow code_review" runs
    Then it shows the plan of each step, its runtime's options among it
