# files, a wrapper (docs/settings-implementation.md, "The composition"):
# the operating system's filesystem, as layout's port asks it: a folder's
# entries, and a file's bytes. Contract tests against real files, in a
# temporary folder (ADR-009, rule 3).

Feature: files answers layout's filesystem port from the operating system

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
