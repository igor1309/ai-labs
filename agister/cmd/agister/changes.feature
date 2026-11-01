# cmd/agister, a call's changes (docs/run-implementation.md, "A call's
# changes"; ADR-004, rule 4): the HEAD a call left and a pinned call's
# patch, with spies in place of the wrappers (ADR-009, rule 4). Settings
# as record.feature gives them, with the process "fix" on "claude-opus",
# read-write, its revision pinned to the input "base", a git.revision of
# the param base. The run's id is "R"; git names "main" in "/r" the
# commit "c1", gives "/r" HEAD "c1" and the content "t1" until a turn
# ends, then HEAD "c2" and the content "t2", and the changes from "c1" to
# "t2" the patch "d1".

Feature: The composition records a call's changes

  Scenario: A pinned call's patch is written, and named in its entry
    When "agister run --process fix --agent claude-opus --param
      base=main" runs in "/r"
    Then runstore is given the patch "d1" of the step "fix" of "R"
    And the record's call holds the head "c1", the end_head "c2", the
      content "t2" and the patch "R/patches/fix.patch"

  Scenario: An empty change is an empty patch
    Given git gives the changes from "c1" to "t2" empty
    When "agister run --process fix --agent claude-opus --param
      base=main" runs in "/r"
    Then runstore is given the empty patch of "fix" of "R", and the
      record's call holds the patch "R/patches/fix.patch"

  Scenario: An unpinned call keeps no patch
    When "agister run --process ask --agent claude-opus --param q=why"
      runs in "/r"
    Then git is asked no changes, and the record's call holds the
      end_head "c2" and the patch null

  Scenario Outline: A patch not made is a warning, the call kept
    Given <fault>
    When "agister run --process fix --agent claude-opus --param
      base=main" runs in "/r"
    Then the run completes with a warning naming the patch of "fix",
      and the record's call holds the patch null

    Examples:
      | fault                                         |
      | git cannot give the changes from "c1" to "t2" |
      | git cannot read the content at the call's end |
      | runstore cannot write the patch               |

  Scenario: A step that commits is continued
    Given the workflow "pair": the step "fix", of the process "fix",
      then "check", of the process "ask", continuing "fix"'s session,
      claude-code reporting the session "s1"
    When "agister run pair --param base=main --param q=why" runs in "/r"
    Then "check" is admitted against the HEAD "c2" and the content "t2"

  Scenario Outline: A continuation is checked against the HEAD left
    Given runstore keeps the run "R1", one call "R1/ask", its root "/r",
      its session "s1", the content "t2", <heads>; and git gives "/r"
      HEAD "c2" and the content "t2"
    When "agister run --process ask --agent claude-opus --param q=more
      --continue R1" runs in "/r"
    Then claude-code's turn is given the session "s1"

    Examples:
      | heads                               |
      | the head "c1" and the end_head "c2" |
      | the head "c2" and no field end_head |

  Scenario: A call taken by a reuse keeps its earlier patch, copied
    Given runstore keeps the run "R1" of "fix" in "/r", base "main", its
      call "R1/fix" completed, its root "/r", end_head "c2", content
      "t2", patch "R1/patches/fix.patch" and this call's definitions
      and environment;
      and git gives "/r" HEAD "c2"
      and the content "t2"
    When "agister run --process fix --agent claude-opus --param
      base=main --reuse R1" runs in "/r"
    Then "fix" is reused, git is asked no changes, runstore is given
      "R1/patches/fix.patch"'s bytes as the patch of "fix" of "R", and
      the record's call holds the patch "R/patches/fix.patch"
