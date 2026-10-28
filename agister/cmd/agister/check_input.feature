# Composed settings and a supplied file checked without a run.

Feature: The composition checks one input of a process

  Scenario Outline: A brief that takes a form of its input passes
    Given the file "<path>" holds a brief of home's form "step" whose
      goal names "g.md", and "<goal>" exists
    When "agister check-input implement brief=<file> <dir>" runs in "/r/a"
    Then it prints "<file> takes the form \"step\"" and exits 0

    Examples:
      | file    | dir      | path      | goal      |
      | b.md    |          | /r/a/b.md | /r/a/g.md |
      | b.md    | --dir /r | /r/b.md   | /r/g.md   |
      | /t/b.md |          | /t/b.md   | /r/a/g.md |

  Scenario: Only the named input is read, and no agent is needed
    Given the file "/r/b.md" holds a brief of home's form "goal"
    When "agister check-input implement brief=b.md" runs in "/r"
    Then it exits 0, git is asked no commit and no changed files, and
      no param is needed

  Scenario: The same validator as run refuses the same text
    Given the repository's bash process "say" with the input "what" from
      the source "file", path "b.md", forms "step" and "goal", and the
      file "/r/b.md" holds "## Covers\n\n- 1\n"
    When "agister check-input say what=b.md" runs in "/r", and "agister
      run --process say --agent bash" runs in "/r"
    Then the check's error, after "input \"what\" of the process
      \"say\": ", is the run's reason after "input \"what\": "

  Scenario: A brief that takes no form names the closest
    Given the file "/r/b.md" holds "## Covers\n\n- 1\n"
    When "agister check-input implement brief=b.md" runs in "/r"
    Then its error reads: input "brief" of the process "implement": it
      takes none of its forms; closest "step": part "## Goal" is
      missing, part "## Open" is missing; other forms: "goal" 4 faults

  Scenario Outline: What cannot be checked is an error
    Given <state>
    When "agister check-input <process> <input>=b.md" runs in "/r"
    Then it exits 1, its error <names>

    Examples:
      | state                                                         | process   | input | names                                                                 |
      | the file "/r/b.md" holds a brief                              | nope      | brief | that no layer holds the process "nope"                                |
      | the file "/r/b.md" holds a brief                              | implement | goal  | "implement" has no input "goal"; it has "candidate_revision", "brief" |
      | no file "/r/b.md"                                             | implement | brief | that the file "/r/b.md" does not exist                                |
      | the file "/r/b.md" cannot be read                             | implement | brief | the file "/r/b.md" and the read's error                               |
      | the repository's brief form "step" has a part with no heading | implement | brief | the form's file, line and problem                                     |
      | the repository's process "say" of no forms                    | say       | what  | that the input "what" of the process "say" names no brief form        |

  Scenario: Checking leaves no run behind
    Given the file "/r/b.md" holds a brief of home's form "step", or
      "x", in turn
    When "agister check-input implement brief=b.md" runs in "/r" each time
    Then the record store is never asked to write, no run id is drawn,
      no worktree is held or admitted, no runtime takes a turn, and no
      signal is watched

  Scenario: A launch directory in no git worktree is checked with home's
    settings
    Given the file "/o/b.md" holds a brief of home's form "goal", no git
      worktree holds "/o", and "/o/.agister" holds a brief form "goal"
      requiring "## Ask"
    When "agister check-input implement brief=b.md" runs in "/o"
    Then it prints "b.md takes the form \"goal\"" and exits 0, the
      local ".agister" never read
