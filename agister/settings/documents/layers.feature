# settings/documents (docs/settings-implementation.md, steps 2 to 5;
# ADR-002, rules 1, 3 and 4) is pure (ADR-001): given a snapshot, each
# document's sources by kind and name, one slot per layer, and the
# problems of its files, it gives one document: a definition, or its
# problems.
# This file: how a document's layers compose.

Feature: Documents composes a tree document's layers

  Background:
    Given each kind is a tree in its format, or a blob:
      | kind     | is a | format |
      | agent    | tree | TOML   |
      | process  | tree | YAML   |
      | workflow | tree | YAML   |
      | runtime  | tree | YAML   |
      | verify   | tree | YAML   |
      | brief    | tree | YAML   |
      | schema   | blob |        |
      | prompt   | blob |        |

  Scenario Outline: A tree document is decoded in its kind's format
    Given the home source of the <kind> "a" holds <kind> bytes in <format>
    When documents is asked for the <kind> "a"
    Then its tree is the one those bytes decode to in <format>

    Examples:
      | kind     | format |
      | agent    | TOML   |
      | process  | YAML   |
      | workflow | YAML   |
      | runtime  | YAML   |
      | verify   | YAML   |
      | brief    | YAML   |

  Scenario: The nearer layer wins, field by field
    Given the process "a" has the sources:
      | source     | path                              | bytes                  |
      | home       | /home/.agister/processes/a.yaml   | {x: 1, y: 1, z: 1}     |
      | repository | /repo/.agister/processes/a.yaml   | {y: 2, z: 2}           |
      | project    | /repo/p/.agister/processes/a.yaml | {z: 3}                 |
    When documents is asked for the process "a"
    Then its tree is:
      | field | value | origin                            |
      | x     | 1     | /home/.agister/processes/a.yaml   |
      | y     | 2     | /repo/.agister/processes/a.yaml   |
      | z     | 3     | /repo/p/.agister/processes/a.yaml |

  Scenario Outline: A layer that does not hold the document is passed over
    Given the process "a" has a home source "{x: 1}"
    And its <layer> source is <slot>
    When documents is asked for the process "a"
    Then its tree holds x 1 from home
    And it has no problem

    Examples:
      | layer      | slot   |
      | repository | absent |
      | project    | absent |

  # An empty file is a source with no bytes (layout.feature), which
  # decodes to the empty tree (tree.feature): its layer holds the
  # document, and adds nothing to it.
  Scenario: An empty file holds the document and adds nothing to it
    Given the process "a" has a home source "{x: 1}"
    And its repository source is a file with no bytes
    When documents is asked for the process "a"
    Then its tree holds x 1 from home
    And it has no problem

  Scenario: A document whose only file is empty is the empty tree
    Given the process "a" has only a home source, a file with no bytes
    When documents is asked for the process "a"
