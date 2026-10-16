# git, a wrapper (ADR-001; docs/settings-implementation.md, "The
# composition"): the root of the git worktree that holds a directory.
# Contract tests against git itself, in a temporary folder (ADR-009,
# rule 3).

Feature: git gives the root of a directory's worktree

  Scenario: A directory inside a worktree
    Given a git repository at "r", with the folder "r/a/b"
    When git is asked the root of "r/a/b"
    Then it gives "r"

  Scenario: A directory in a linked worktree
    Given a git repository at "r", and its linked worktree at "w"
    When git is asked the root of "w"
    Then it gives "w"

  Scenario: A directory outside any worktree
    Given the folder "o", in no git repository
    When git is asked the root of "o"
    Then it gives none, and no error
