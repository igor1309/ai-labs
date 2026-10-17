# cmd/agister, a continuation (docs/run-implementation.md,
# "Continuation"; ADR-004, rule 5): a run continuing an earlier run's
# call, with spies in place of the wrappers (ADR-009, rule 4). Settings
# as record.feature gives them; runstore keeps the run "R1", one call,
# "R1/ask", of the process "ask" on "claude-opus", its root "/r", HEAD
# "c1", content "t1" and session "s1"; git gives "/r" HEAD "c1" and its
# content "t1".

Feature: The composition continues an earlier run's call

  Scenario: A continuation resumes its call's session
    When "agister run --process ask --agent claude-opus --param q=more
      --continue R1" runs in "/r"
    Then claude-code's turn is given the session "s1"
    And the record's request continues "R1", and its call continues
      "R1/ask"

  Scenario: A continuation resumes from the session's latest call
    Given runstore keeps, after "R1", the run "R2" whose call "R2/ask"
      continued "R1/ask", its session "s1", HEAD "c1" and content "t2";
      and git gives "/r" the content "t2"
    When "agister run --process ask --agent claude-opus --param q=more
      --continue R1" runs in "/r"
    Then claude-code's turn is given the session "s1", and the call
      continues "R2/ask"

  Scenario: A continuation is not asked a clean worktree
    Given the process "ask" asks a clean worktree, and git gives "/r"
      not clean
    When "agister run --process ask --agent claude-opus --param q=more
      --continue R1" runs in "/r"
    Then claude-code's turn is given the session "s1"

  Scenario Outline: A continuation that does not hold is refused
    Given <given>
    When "agister run <request> --continue <run>" runs in "<dir>"
    Then it prints to stderr <what>, nothing runs, no record is
      written, and it exits 1

    Examples:
      | given                           | request                            | run | dir | what                                         |
      | nothing more                    | pair                               | R1  | /r  | that a continuation runs one step            |
      | nothing more                    | --process ask --agent claude-opus  | R9  | /r  | that no run "R9" is kept                     |
      | "R1" holds a second call        | --process ask --agent claude-opus  | R1  | /r  | that "R1" is not a run of one call           |
      | "R1/ask" has no session         | --process ask --agent claude-opus  | R1  | /r  | that "R1/ask" has no session                 |
      | nothing more                    | --process ask --agent codex-sol-61 | R1  | /r  | that "R1/ask" ran on "claude-opus"           |
      | git gives "/s" the root "/s"    | --process ask --agent claude-opus  | R1  | /s  | that "R1/ask" worked in "/r"                 |
      | git gives "/r" HEAD "c2"        | --process ask --agent claude-opus  | R1  | /r  | that HEAD is "c2", not "R1/ask"'s "c1"       |
      | git gives "/r" the content "t2" | --process ask --agent claude-opus  | R1  | /r  | that the worktree is not as "R1/ask" left it |
      | "R1/ask"'s content is empty     | --process ask --agent claude-opus  | R1  | /r  | that the worktree is not as "R1/ask" left it |
