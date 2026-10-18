# cmd/agister, runs (docs/run-implementation.md, "Runs"; ADR-001,
# invariant 6 and "Runs"; ADR-010, rule 4): what a run's calls were given,
# recorded, and a run exported, with spies in place of the wrappers
# (ADR-009, rule 4). Settings and facts as record.feature gives them.

Feature: The composition records what a run was given, and exports it

  Scenario: The workflow's inputs and each call's are recorded
    Given home's code_review as review.feature gives it
    When "agister run code_review --param goal=g.md" runs in "/r"
    Then the record's inputs are "base", the commit "c0" its value and
      identity; "candidate", "c1" both; and "goal", the text of
      "/r/g.md" its value, its SHA-256 its identity
    And each review's call has the inputs "base_revision", "c0" its
      value and identity; "candidate_revision", "c1" both;
      "changed_files", "a.go"; and "goal", the text of "/r/g.md"; and
      the judge's call the input "reviews", the reviews' outputs as it
      was given them

  Scenario: A request naming a step records its call's inputs alone
    When "agister run --process ask --agent claude-opus --param q=why"
      runs in "/r"
    Then the record's inputs are [], and its call's are "q", "why" its
      value

  Scenario: A run whose workflow's inputs are refused records none
    Given the repository's workflow "w" of the step "say", its input
      "goal" from the source "file", path "g.md", and no file "/r/g.md",
      as inputs.feature gives it
    When "agister run w" runs in "/r"
    Then the record holds the run refused, its inputs [], and no call

  Scenario: A call whose inputs are refused records none
    Given git names "HEAD" the commit "c1"
    When "agister run --process implement --agent claude-opus --param
      brief=missing.md" runs in "/r"
    Then the record holds the call refused, its inputs []

  Scenario: A run is exported from home's runs
    When "agister runs export R1 --to /out" runs
    Then runstore, under home's "runs", is asked to export "R1" to
      "/out", and it exits 0

  Scenario: An export runstore fails is a failure
    Given runstore fails to export "R1"
    When "agister runs export R1 --to /out" runs
    Then it prints runstore's error to stderr and exits 1
