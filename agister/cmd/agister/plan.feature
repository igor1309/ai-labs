# cmd/agister, a call's plan (docs/run-implementation.md, "A call's
# plan"; ADR-001, invariant 6; ADR-003, rule 4), with spies in place of
# the wrappers (ADR-009, rule 4). Settings as record.feature gives them:
# the repository's process "ask", its environment A=1 and its
# permissions requiring repository.read, as model.feature gives it. The
# run's id is "R"; git gives "/r" HEAD "c1" and the content "t1".

Feature: The composition records a call's plan

  Scenario: A call records its permission plan and its environment
    When "agister run --process ask --agent claude-opus --param q=why"
      runs in "/r"
    Then the record's call holds the permissions "agister settings show
      --process ask --agent claude-opus" prints for its step, and the
      environment [{"name": "A", "value": "1"}]

  Scenario: A call whose inputs were refused records its plan alone
    Given the param q's source cannot give its value
    When "agister run --process ask --agent claude-opus --param q=why"
      runs in "/r"
    Then the record's call is refused, holds its permissions, and the
      environment []

  Scenario: A call taken by a reuse keeps the earlier entry's
    Given runstore keeps the run "R1" of "ask" in "/r", q "why", its
      call "R1/ask" completed at HEAD "c1" and content "t1", its
      definitions this call's, its permissions and environment those of
      the first scenario
    When "agister run --process ask --agent claude-opus --param q=why
      --reuse R1" runs in "/r"
    Then "ask" reuses "R1/ask", and the record's call holds R1/ask's
      permissions and environment
