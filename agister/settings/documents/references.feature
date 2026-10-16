# settings/documents (docs/settings-implementation.md, "The composition"):
# a reference is typed whole, so the composition answers resolve's source
# with what it reads and parses no text (ADR-011, rules 3 and 4).

Feature: Documents types a reference whole

  Scenario Outline: A reference gives what it reads
    Given the workflow "w" has an output "o" that reads "<reads>"
    When documents gives the workflow "w"
    Then the output "o" reads the root "<root>", the name "<name>", and
      <what>

    Examples:
      | reads             | root   | name   | what                         |
      | params.base       | params | base   | nothing more                 |
      | inputs.base       | inputs | base   | nothing more                 |
      | state.review      | state  | review | nothing more                 |
      | steps.a.outputs   | steps  | a      | its outputs                  |
      | steps.a.outputs.v | steps  | a      | the field "v" of its outputs |
      | steps.a.session   | steps  | a      | its session                  |

  Scenario Outline: A reference to a step that reads no part of it is a problem
    Given the workflow "w" has an output "o" that reads "<reads>"
    When documents gives the workflow "w"
    Then it has the problem at "outputs.o": it reads
      steps.<name>.outputs, a field of them, or steps.<name>.session

    Examples:
      | reads               |
      | steps.a             |
      | steps.a.other       |
      | steps.a.session.x   |
      | steps.a.outputs.v.w |

  Scenario: The item of a query is read inside the query
    Given the workflow "w" has a repeat until all of "state.findings"
      where "item.fixed" is present
    When documents gives the workflow "w"
    Then the condition's query reads the item's field "fixed"

  Scenario: The item read outside any query is a problem
    Given the workflow "w" has a branch arm if "item.fixed" is present
    When documents gives the workflow "w"
    Then it has the problem at the arm's condition: item is read inside
      all or any
