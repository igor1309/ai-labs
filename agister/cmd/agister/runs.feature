# cmd/agister, runs (docs/run-implementation.md, "Runs"; ADR-001,
# invariant 6 and "Runs"; ADR-010, rule 4): what a run's calls were given,
# recorded, and a run exported, with spies in place of the wrappers but
# runstore (ADR-009, rule 4). Settings and facts as record.feature gives
# them.

Feature: The composition records what a run was given, and exports it

  Scenario: The workflow's inputs and each call's are recorded
    Given home's code_review as review.feature gives it
    When "agister run code_review --param goal=g.md" runs in "/r"
    Then the record's inputs are "base", the commit "c0" its value and
      identity; "candidate", "c1" both; and "goal", the text of
      "/r/g.md" its value, its SHA-256 its identity
    And each review's call has those three inputs, in its process's
      order, and the judge's call the input "reviews", the reviews'
      outputs as it was given them

  Scenario: A request naming a step records its call's inputs alone
    When "agister run --process ask --agent claude-opus --param q=why"
      runs in "/r"
    Then the record's inputs are none, and its call's are "q", "why"
      its value

  Scenario: A call whose inputs are refused records none
    When "agister run --process implement --agent claude-opus --param
      brief=missing.md" runs in "/r"
    Then the record holds the call refused, its inputs none

  Scenario: A run is exported from home's runs
    Given a run of "pair" recorded under home's "runs"
    When "agister runs export <its id> --to /out" runs
    Then "/out/<its id>" holds its "record.json" and "events.jsonl"

  Scenario: A run not kept is not exported
    When "agister runs export 20261017T071618Z-55fd36 --to /out" runs
    Then it prints to stderr that no such run is kept, exits 1, and
      "/out" holds nothing
