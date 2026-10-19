# cmd/agister, a call's plan (docs/run-implementation.md, "A call's
# plan"; ADR-001, invariant 6; ADR-003, rule 4), with spies in place of
# the wrappers (ADR-009, rule 4). Settings as record.feature gives them:
# the repository's process "ask", its permissions requiring
# repository.read, as model.feature gives it, but its environment B=2
# then A from the param a. The run's id is "R"; git gives "/r" HEAD "c1"
# and the content "t1".

Feature: The composition records a call's plan

  Scenario: A call records its permission plan and its environment
    When "agister run --process ask --agent claude-opus --param q=why
      --param a=1" runs in "/r"
    Then the record's call holds the permissions, the six lists resolve
      plans for its step, required ["repository.read"], and the
      environment [{"name": "B", "value": "2"}, {"name": "A", "value":
      "1"}]

  Scenario: A call whose inputs were refused records its plan alone
    Given the param q's source cannot give its value
    When "agister run --process ask --agent claude-opus --param q=why
      --param a=1" runs in "/r"
    Then the record's call is refused, holds its permissions, and the
      environment []

  Scenario Outline: A reuse takes a call only under the same environment
    Given runstore keeps the run "R1" of "ask" in "/r", q "why", its
      call "R1/ask" completed at HEAD "c1" and content "t1", its
      definitions this call's, the permissions [] each, <environment>
    When "agister run --process ask --agent claude-opus --param q=why
      --param a=1 --reuse R1" runs in "/r"
    Then "ask" <taken>

    Examples:
      | environment              | taken                                                        |
      | the environment B=2, A=1 | reuses "R1/ask", its permissions and environment this call's |
      | the environment B=2, A=9 | is made                                                      |
      | no field environment     | is made                                                      |
