# cmd/agister, a definition's bytes (docs/run-implementation.md, "A
# definition's bytes"; ADR-001, invariant 6), with spies in place of the
# wrappers (ADR-009, rule 4). Settings as definitions.feature gives
# them. The run's id is "R"; git gives "/r" HEAD "c1" and the content
# "t1".

Feature: The composition keeps the bytes of a run's definitions

  Scenario: A call's definition files are written by their digest
    When "agister run --process ask --agent claude-opus --param q=why"
      runs in "/r"
    Then runstore is given, under "R", the bytes of each file the call's
      definitions name, by its digest, before the entry that names them

  Scenario: A digest read by two steps is written once
    When "agister run pair" runs in "/r"
    Then runstore is given the bytes of each digest once, the process
      "say", the agent and its runtime among them, and of the workflow
      "pair" before the record is first written

  Scenario: A call taken by a reuse has its bytes written under this run
    Given runstore keeps the run "R1" of "ask" in "/r", q "why", its
      call "R1/ask" completed at HEAD "c1" and content "t1", its
      definitions this call's
    When "agister run --process ask --agent claude-opus --param q=why
      --reuse R1" runs in "/r"
    Then "ask" reuses "R1/ask", and runstore is given under "R" the
      bytes of each file of its definitions

  Scenario: Bytes not written are a warning, the call kept
    Given runstore cannot write the bytes of the prompt "g"
    When "agister run --process ask --agent claude-opus --param q=why"
      runs in "/r"
    Then the run completes with a warning naming
      "/r/.agister/prompts/g.md", and the record's call holds its
      definitions
