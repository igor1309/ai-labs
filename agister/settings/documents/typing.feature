# settings/documents (docs/settings-implementation.md, steps 2 to 5;
# ADR-002, rules 1, 3 and 4) is pure (ADR-001): given a snapshot, each
# document's sources by kind and name, one slot per layer, and the
# problems of its files, it gives one document: a definition, or its
# problems.
# This file: the typing every kind shares.

Feature: Documents types a tree document

  Scenario Outline: Every tree document names its schema and its name
    Given the <kind> "a" has a home source whose fields are valid but for
      <fault>
    When documents is asked for the <kind> "a"
    Then there is no definition
    And it has a problem at "<field>": <message>

    Examples:
      | kind  | fault                               | field  | message                                        |
      | agent | no schema                           | schema | it is missing                                  |
      | agent | the schema agister.agent/v2         | schema | the schema "agister.agent/v2" is not known     |
      | agent | the schema agister.process/v1alpha1 | schema | an agent's schema is "agister.agent/v1alpha1"  |
      | agent | no name                             | name   | it is missing                                  |
      | agent | the name "b"                        | name   | it is "a", the document's name                 |

  # The composed document is what is checked (ADR-002, rule 3): a document
  # whose only file is empty is the empty tree, and every field it needs
  # is missing. A missing field is in no file.
  Scenario: A document whose only file is empty misses every field it needs
    Given the agent "a" has only a home source, a file with no bytes
    When documents is asked for the agent "a"
    Then there is no definition
    And it has exactly three problems: at "schema", "name" and "runtime",
      each "it is missing" and naming no file

  Scenario: A field no kind knows is a problem
    Given the agent "a" has a home source of a valid agent and the field
      "colour = 'red'"
    When documents is asked for the agent "a"
    Then there is no definition
    And it has a problem at "colour": the field is not known

  Scenario: A field of the wrong type is a problem
    Given the agent "a" has a home source of a valid agent with
      "model = 3"
    When documents is asked for the agent "a"
    Then there is no definition
    And it has a problem at "model": it is a string, not an integer

  Scenario: Every field problem is reported
    Given the agent "a" has a home source with no runtime, "model = 3" and
      "colour = 'red'"
    When documents is asked for the agent "a"
    Then it has exactly three problems: at "runtime", "model" and "colour"

  Scenario: A field problem names the file that gave the field
    Given the agent "a" has a valid home source
    And a repository source at "/repo/.agister/agents/a.toml" with
      "model = 3"
    When documents is asked for the agent "a"
    Then it has a problem at "model" naming
      "/repo/.agister/agents/a.toml"

  Scenario: A field the extending document leaves to its base is typed
    from the base
    Given the agent "base" has a valid home source with runtime "codex"
    And the agent "a" has a home source naming only its schema, its name
      and "extends = 'base'"
    When documents is asked for the agent "a"
    Then it gives the agent "a" with the runtime "codex"
