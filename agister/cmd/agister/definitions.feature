# cmd/agister, a call's definitions (docs/run-implementation.md,
# "Definitions"; ADR-001, invariant 6), with spies in place of the
# wrappers (ADR-009, rule 4). Settings as record.feature gives them: the
# process "ask" on "claude-opus", its prompt "ask", in home's settings.
# The run's id is "R"; git gives "/r" HEAD "c1" and the content "t1".

Feature: The composition records the definitions a call ran under

  Scenario: A call names each document its plan read
    When "agister run --process ask --agent claude-opus --param q=why"
      runs in "/r"
    Then the record's call holds the definitions, each file's layer,
      path and digest:
      | kind    | name        |
      | agent   | claude-opus |
      | process | ask         |
      | prompt  | ask         |
      | runtime | claude-code |

  Scenario: A call refused names its definitions
    Given the param q is not given
    When "agister run --process ask --agent claude-opus" runs in "/r"
    Then the record's call is refused and holds the definitions of
      "ask"

  Scenario: A continuation names the prompt continuation
    Given runstore keeps the run "R1", its call "R1/ask" with the
      session "s1", left at HEAD "c1" and the content "t1"
    When "agister run --process ask --agent claude-opus --param q=more
      --continue R1" runs in "/r"
    Then the record's call holds the definitions, among them the
      prompt "continuation"

  Scenario Outline: A reuse takes a call only under the same definitions
    Given runstore keeps the run "R1" of "ask" in "/r", q "why", its
      call "R1/ask" completed at HEAD "c1" and content "t1", <kept>
    When "agister run --process ask --agent claude-opus --param q=why
      --reuse R1" runs in "/r"
    Then "ask" <taken>

    Examples:
      | kept                                      | taken           |
      | its definitions this call's               | reuses "R1/ask" |
      | the prompt "ask" of another digest        | is made         |
      | the prompt "ask" from the repository      | is made         |
      | no field definitions                      | is made         |
      | its definitions this call's and "a" extra | is made         |
