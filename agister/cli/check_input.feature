# One named input checked through the command line port, nothing run.

Feature: The command line checks one input against its brief forms

  Scenario Outline: A check names a process, an input and a file
    When "agister <args>" runs in "/work"
    Then it asks the port to check the input "brief" of the process
      "implement" with the file "<file>", at the launch directory
      "<launch>"

    Examples:
      | args                                       | file    | launch  |
      | check-input implement brief=b.md           | b.md    | /work   |
      | check-input implement brief=/t/b.md        | /t/b.md | /work   |
      | check-input implement brief=b.md --dir /d  | b.md    | /d      |
      | check-input --dir=d implement brief=x=y.md | x=y.md  | /work/d |

  Scenario: A text that takes a form prints it and exits 0
    Given the port's check gives the form "step"
    When "agister check-input implement brief=b.md" runs
    Then it prints "b.md takes the form \"step\"" on stdout and exits 0

  Scenario: A check the port refuses is an error
    Given the port's check fails "it takes none of its forms; closest
      \"step\": part \"## Open\" is missing; other forms: \"goal\" 4
      faults"
    When "agister check-input implement brief=b.md" runs
    Then it prints "agister: " and the port's words to stderr, nothing
      to stdout, and exits 1

  Scenario Outline: A bad command prints its usage and exits 2
    When "agister <args>" runs
    Then it prints its usage to stderr and exits 2, asking the port nothing

    Examples:
      | args                                          |
      | check-input                                   |
      | check-input implement                         |
      | check-input implement b.md                    |
      | check-input implement =b.md                   |
      | check-input implement brief=                  |
      | check-input implement brief=b.md goal=g.md    |
      | check-input implement brief=b.md --agent bash |
      | check-input implement brief=b.md --param a=1  |

  Scenario: The usage names check-input
    When "agister frobnicate" runs
    Then its usage holds the line "agister check-input <process>
      <input>=<file> [--dir <directory>]"

  Scenario: Output that cannot be written is an error
    Given stdout fails its first write, and the port's check gives the
      form "step"
    When "agister check-input implement brief=b.md" runs
    Then it gives the write's error, and no exit 0
