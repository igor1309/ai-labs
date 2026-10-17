# cmd/agister, the hold and the chain (docs/run-implementation.md, "A step
# in a held worktree"; ADR-004, rule 3): the hold a lock file under home's
# locks, run against the real filesystem in a temporary folder (ADR-009,
# rule 3); the rest with spies in place of the wrappers.

Feature: The composition holds a worktree for each call

  Scenario Outline: Holds on one worktree share or exclude
    Given the worktree "/r" held <first>
    When a hold <second> is asked of "/r"
    Then it is <given>

    Examples:
      | first  | second | given   |
      | shared | shared | taken   |
      | shared | alone  | refused |
      | alone  | shared | refused |
      | alone  | alone  | refused |

  Scenario: The lock file is the archive's
    When a hold is taken of "/r"
    Then it is the file named by the SHA-256 of "/r", links resolved,
      with ".lock", under home's "locks"

  Scenario: A hold released can be taken again
    Given the worktree "/r" held alone, then released
    When a hold alone is asked of "/r"
    Then it is taken

  Scenario: home's implement runs on claude-code, admitted and held
    Given git gives "/r" HEAD "c1", clean, and names "HEAD" the commit
      "c1"; the file "/r/s.md" holds a brief of home's form "step" whose
      goal names a file "/r" holds
    When "agister run --process implement --agent claude-opus --param
      brief=s.md" runs in "/r"
    Then claude-code runs the turn, the worktree held alone while it
      runs and released after, and it prints the result
