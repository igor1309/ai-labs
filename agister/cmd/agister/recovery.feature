# cmd/agister, recovery (docs/run-implementation.md, "Recovery";
# ADR-006, rule 3): a process's recovery reaching core, and a stale
# turn reported, with spies in place of the wrappers (ADR-009, rule 4).
# Settings as progress.feature gives them, the process "ask" given the
# staleness limit no_event 1m and a recovery of 1 resume, "Go on.".

Feature: The composition recovers a stale turn

  Scenario: A process's recovery reaches core's step
    When the run of "ask" on "claude-opus" is built
    Then core's step has the recovery of 1 resume, "Go on."

  Scenario: A recovered turn is a progress line and an event
    Given claude-code reports the session "s1", then nothing for 1m;
      then, resumed, completes
    When "agister run --process ask --agent claude-opus --param q=why"
      runs in "/r"
    Then stderr has the line "· ask: stale: no event for 1m;
      recovering"
    And runstore is given the event "stale" of "ask", its what "no
      event for 1m", recovering
    And it prints the result completed

  Scenario: home's implement recovers once
    When home's process "implement" is read, as shipped
    Then its recovery is 1 resume, its instruction "Your last turn was
      ended: it stopped making progress, as said below. Its work is in
      the worktree. Go on with the task another way."
