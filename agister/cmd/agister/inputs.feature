# cmd/agister, the sources (docs/run-implementation.md, "Inputs and
# progress"; ADR-010, rule 2): the composition plugs file, git.revision
# and git.changed_files into core, with spies in place of git and of the
# files (ADR-009, rule 4). Settings: home's as shipped, with the
# repository's bash process "say" of the script "echo \"$what\"" and the
# input named by each scenario; a git whose worktree root of "/r" and
# below is "/r".

Feature: The composition gives a step its file and git inputs

  Scenario Outline: Each source gives its value
    Given the process "say" has the input "what" <from>, and <spy>
    When "agister run --process say --agent bash" runs in "/r/a"
    Then bash runs with what=<value>

    Examples:
      | from                                                    | spy                                                         | value      |
      | from the source "file", path "b.md"                     | the file "/r/a/b.md" holds "hi"                             | hi         |
      | from the source "git.revision", rev "main"              | git names "main" in "/r" the commit "c1"                    | c1         |
      | from the source "git.changed_files", base "m", head "h" | git lists in "/r" "a.go" and "b.go" changed from "m" to "h" | a.go\nb.go |

  Scenario Outline: A source that cannot give its value refuses the run
    Given the process "say" has the input "what" <from>, and <spy>
    When "agister run --process say --agent bash" runs in "/r"
    Then it prints the result, failed, class "refused", its reason
      naming the input "what" and <why>, and bash runs nothing

    Examples:
      | from                                                    | spy                        | why                          |
      | from the source "file", path "b.md"                     | no file "/r/b.md"          | that the file does not exist |
      | from the source "git.revision", rev "nope"              | git names no commit "nope" | git's words                  |
      | from the source "git.changed_files", base "m", head "h" | git lists nothing changed  | that nothing changed         |

  Scenario: A brief form is the snapshot's brief document of its name
    Given the process "say" has the input "what" from the source "file",
      path "b.md", form "step", and the file "/r/a/b.md" holds a brief
      of home's form "step" whose goal names "g.md", which "/r/a" holds
    When "agister run --process say --agent bash" runs in "/r/a"
    Then bash runs with what the brief's text

  Scenario: A brief that takes no form refuses the run
    Given the process "say" has the input "what" from the source "file",
      path "b.md", form "step", and the file "/r/b.md" holds "x"
    When "agister run --process say --agent bash" runs in "/r"
    Then it prints the result, failed, class "refused", naming the parts
      of "step" missing, and bash runs nothing

  Scenario: The shipped implement process's inputs resolve
    Given the file "/r/s.md" holds a brief of home's form "step", git
      names "HEAD" the commit "c1"
    When the inputs of home's process "implement" are resolved with
      brief=s.md in "/r"
    Then "candidate_revision" is "c1" and "brief" the brief's text
