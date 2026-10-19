# git, a wrapper (docs/run-implementation.md, "A step in a held
# worktree", "Records" and "A call's changes"): a worktree's HEAD,
# whether its content is HEAD's, its content, and the changes from a
# commit to a tree.
# Contract tests against git itself, in a temporary folder (ADR-009,
# rule 3).

Feature: git gives a worktree's HEAD, whether it is clean, and its content

  Scenario: HEAD is its commit
    Given a git repository at "r" whose HEAD is the commit "c1"
    When git is asked the HEAD of "r"
    Then it gives the full id of "c1"

  Scenario Outline: A worktree is clean where nothing differs from HEAD
    Given a git repository at "r" with one commit, and <change>
    When git is asked whether "r" is clean
    Then it gives <clean>

    Examples:
      | change                 | clean |
      | nothing changed        | yes   |
      | a file staged          | no    |
      | a tracked file changed | no    |
      | an untracked file      | no    |

  Scenario Outline: A worktree's content is the tree its files make
    Given a git repository at "r" with one commit, its content read,
      then <change>
    When git is asked the content of "r" again
    Then it gives <same> tree, and "r"'s index is as it was

    Examples:
      | change                  | same     |
      | nothing changed         | the same |
      | an untracked file added | another  |
      | an ignored file added   | the same |
      | a tracked file changed  | another  |

  Scenario: The changes from a commit to a tree are a patch
    Given a git repository at "r" whose HEAD is the commit "c1", then a
      commit "c2" changing a tracked file, an untracked file added and a
      binary file changed, and the content of "r" read as "t"
    When git is asked the changes in "r" from "c1" to "t"
    Then it gives a patch that, applied to "c1" in a clone, gives the
      tree "t"
