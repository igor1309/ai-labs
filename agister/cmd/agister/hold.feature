# cmd/agister, the hold and the chain (docs/run-implementation.md, "A step
# in a held worktree", "Retiring the archive"; ADR-004, rule 3): admit's
# hold port answered by files' lock, with spies in place of the wrappers
# (ADR-009, rule 1).

Feature: The composition holds a worktree for each call

  Scenario: The lock file is the user's, whatever home is
    Given AGISTER_HOME "/h" and the user's home "/u"
    When a hold alone is taken of "/r"
    Then files is asked to lock, alone, the file named by the SHA-256
      of "/r", links resolved, with ".lock", under "/u/.agister/locks/in-place"

  Scenario: home's implement runs on claude-code, admitted and held
    Given git gives "/r" HEAD "c1", clean, and names "HEAD" the commit
      "c1"; the file "/r/s.md" holds a brief of home's form "step" whose
      goal names a file "/r" holds
    When "agister run --process implement --agent claude-opus --param
      brief=s.md" runs in "/r"
    Then claude-code runs the turn, the worktree held alone while it
      runs and released after, and it prints the result
