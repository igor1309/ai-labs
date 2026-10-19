# cmd/agister, a binding continuing a session (docs/run-implementation.md,
# "A binding continuing a session"; ADR-004, rule 5): a step of a run
# continuing an earlier step's session, with spies in place of the
# wrappers (ADR-009, rule 4). Settings as record.feature gives them, with
# a workflow "talk": the step "first", then "second", continuing
# "first"'s session, each of the process "ask" on "claude-opus" given the
# param q. The run's id is "R"; git gives "/r" HEAD "c1" and its content
# "t1" until a turn writes "t2"; claude-code reports the session "s1".

Feature: The composition continues a session inside a run

  Scenario: A step resumes the session of the step it names
    When "agister run talk --param q=why" runs in "/r"
    Then claude-code's turn for "first" is given no session, and for
      "second" the session "s1" and the message "## q", "why", then
      "## continuation", home's prompt, then the process's prompt
    And the record's call "R/second" continues "R/first"

  Scenario: The session's latest call is the last that went on in it
    Given a third step "third", continuing "first"'s session
    When "agister run talk --param q=why" runs in "/r"
    Then "third" is given the session "s1", and its call continues
      "R/second"

  Scenario: The worktree is checked against what the latest call left
    Given "first"'s turn writes "t2", and the process "ask" asks a clean
      worktree, which "/r" then is not
    When "agister run talk --param q=why" runs in "/r"
    Then "second" is admitted, and given the session "s1"

  Scenario: A worktree changed since the latest call refuses the step
    Given git gives "/r" the content "t1" when "first" ends, and "t2"
      when "second" is admitted
    When "agister run talk --param q=why" runs in "/r"
    Then "second" is refused, its turn not made: the worktree is not as
      the session's latest call left it

  Scenario: A session's steps are not taken by a reuse
    Given runstore keeps the run "R1" of "talk" in "/r", q "why", both
      completed, their root "/r", HEAD "c1" and content "t1"
    When "agister run talk --param q=why --reuse R1" runs in "/r"
    Then "first" and "second" are made, neither reused, and "second"
      continues "R/first"

  Scenario: A run whose prompt "continuation" does not resolve is refused
    Given home holds no prompt "continuation"
    When "agister run talk --param q=why" runs in "/r"
    Then it prints to stderr that the prompt "continuation" does not
      resolve, nothing runs, no record is written, and it exits 1
