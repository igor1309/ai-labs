# files, a wrapper (docs/settings-implementation.md, "The composition"):
# the operating system's filesystem, in its own types: a folder's
# entries, a file's bytes, a folder's path with its links resolved,
# and a lock file held shared or alone (docs/run-implementation.md).
# Contract tests against real files, in a temporary folder (ADR-009,
# rule 3).

Feature: files reads the operating system's filesystem

  Scenario: A folder's entries, with what each is
    Given the folder "d" holds the file "f", the folder "s" and a link "l"
    When files is asked the entries of "d"
    Then it gives "f", a regular file; "l", neither; and "s", a folder

  Scenario: A folder that does not exist
    When files is asked the entries of "missing"
    Then it gives an error that is, or wraps, fs.ErrNotExist

  Scenario: A file's bytes
    Given the file "f" holds "abc"
    When files is asked the bytes of "f"
    Then it gives "abc"

  Scenario: A folder's path, with its links resolved
    Given the folder "r/a", and the link "o/x" to "r/a"
    When files is asked the resolved path of "o/x"
    Then it gives the path of "r/a"

  Scenario Outline: Locks on one file share or exclude
    Given the file "k.lock" locked <first>
    When files is asked to lock "k.lock" <second>, without waiting
    Then the lock is <given>

    Examples:
      | first  | second | given   |
      | shared | shared | taken   |
      | shared | alone  | refused |
      | alone  | shared | refused |
      | alone  | alone  | refused |

  Scenario: A lock released can be taken again, its folder made
    Given the folder "l" does not exist
    When files locks "l/k.lock" alone, releases it, and locks it again
    Then both locks are taken
