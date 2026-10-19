# cmd/agister, a call's definitions (docs/run-implementation.md,
# "Definitions"; ADR-001, invariant 6), with spies in place of the
# wrappers (ADR-009, rule 4). Settings as record.feature gives them:
# home's agent "claude-opus" on its runtime "claude-code", and the
# repository's process "ask", its prompts "ask" and "g" and its schema
# "answer", as model.feature gives them. The run's id is "R"; git gives
# "/r" HEAD "c1" and the content "t1".

Feature: The composition records the definitions a call ran under

  Scenario: A call names each document its plan read
    When "agister run --process ask --agent claude-opus --param q=why"
      runs in "/r"
    Then the record's call holds the definitions, each file's layer,
      path and digest, and its request none:
      | kind    | name        | layer      |
      | agent   | claude-opus | home       |
      | process | ask         | repository |
      | prompt  | ask         | repository |
      | prompt  | g           | repository |
      | runtime | claude-code | home       |
      | schema  | answer      | repository |

  Scenario: A workflow's files are the request's
    When "agister run pair" runs in "/r"
    Then the record's request holds the definitions of the workflow
      "pair", and each call its own

  Scenario: A call refused names its definitions
    Given git gives "/r" not clean, and the process "ask" asks a clean
      worktree
    When "agister run --process ask --agent claude-opus --param q=why"
      runs in "/r"
    Then the record's call is refused and holds the definitions of the
      first scenario

  Scenario: A continuation names the prompt continuation
    Given runstore keeps the run "R1", its call "R1/ask" with the
      session "s1", left at HEAD "c1" and the content "t1"
    When "agister run --process ask --agent claude-opus --param q=more
      --continue R1" runs in "/r"
    Then the record's call holds the definitions, among them home's
      prompt "continuation"

  Scenario Outline: A reuse takes a call only under the same definitions
    Given runstore keeps the run "R1" of "ask" in "/r", q "why", its
      call "R1/ask" completed at HEAD "c1" and content "t1", <kept>
    When "agister run --process ask --agent claude-opus --param q=why
      --reuse R1" runs in "/r"
    Then "ask" <taken>

    Examples:
      | kept                                           | taken                                     |
      | its definitions this call's                    | reuses "R1/ask", its definitions R1/ask's |
      | the prompt "ask" of another digest             | is made                                   |
      | the prompt "ask" from home                     | is made                                   |
      | no field definitions                           | is made                                   |
      | its definitions this call's and the prompt "x" | is made                                   |
