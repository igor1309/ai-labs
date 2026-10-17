# git, a wrapper (docs/run-implementation.md, "Inputs and progress"): a
# revision's commit and the files a change touched. Contract tests
# against git itself, in a temporary folder (ADR-009, rule 3).

Feature: git gives a revision's commit and the files changed

  Scenario: A revision names its commit
    Given a git repository at "r" with the commit "c1" on "main"
    When git is asked the commit of "main" in "r"
    Then it gives the full id of "c1"

  Scenario: A revision that names no commit is an error
    Given a git repository at "r" with one commit
    When git is asked the commit of "nope" in "r"
    Then it gives an error naming "nope", with git's words

  Scenario: The files changed from the merge base to the second revision
    Given a git repository at "r", "main" at "c1"; the branch "b" from
      "c1", adding "a b.txt" and "x/y.go"; and "main" then adding "m.txt"
    When git is asked the files changed between "main" and "b" in "r"
    Then it gives "a b.txt" and "x/y.go", as git lists them, not
      "m.txt"
