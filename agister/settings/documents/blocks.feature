# settings/documents (docs/settings-implementation.md, "The composition";
# ADR-002, rule 7): the repository's blocks file, which layout gives as
# bytes, typed. Its problems are problems of no document.

Feature: Documents types the repository's blocks

  Scenario: Each block is a document by kind and name, with its reason
    Given the blocks file "/repo/.agister/blocks.yaml":
      """
      - {process: review, reason: it writes to main}
      - {agent: codex, reason: no network here}
      """
    When documents gives the blocks
    Then they are the process "review", on line 1, for "it writes to
      main", and the agent "codex", on line 2, for "no network here"

  Scenario: No blocks file gives no blocks
    Given no blocks file
    When documents gives the blocks
    Then there are none, and no problem

  Scenario Outline: A block that is not a kind, a name and a reason is a problem
    Given the blocks file holds "<block>"
    When documents gives the blocks
    Then there are no blocks, and the problem at "<place>": <problem>

    Examples:
      | block                               | place       | problem                      |
      | {process: review}                   | [0].reason  | it is required               |
      | {reason: why}                       | [0]         | it names one kind and a name |
      | {process: a, agent: b, reason: why} | [0]         | it names one kind and a name |
      | {pages: a, reason: why}             | [0].pages   | the field is not known       |
      | {process: Bad Name, reason: why}    | [0].process | "Bad Name" is no name        |

  Scenario: A blocks file that is not a list is a problem
    Given the blocks file holds "process: review"
    When documents gives the blocks
    Then there are no blocks, and a problem of the file: it is a list
