# The behaviours of tree, before its code: what its tests prove.
# Tree is a library: a value type whose every node keeps its origin; decode,
# bytes in a format and the path they came from → a tree; and merge, one
# tree over another. It reads no file and knows no word of the module that
# imports it: no kind, no layer, no precedence. Which tree is over is the
# caller's. Decode and merge are pure.

Feature: Tree decodes bytes into a value tree with origins and merges trees

  Background:
    Given decode knows the formats YAML and TOML
    And a value is a map, a list, a string, an integer, a number or a
      boolean, and a map's keys are strings
    And a node's origin is the path it was decoded from and, for YAML,
      its line; the line is optional, and a TOML node has none
    And a YAML node's line is its key's line, a list item's the line of
      its item, and the top's line 1

  # Decode: values

  Scenario Outline: A scalar decodes to its value
    Given the <format> bytes "<bytes>"
    When tree decodes them
    Then the tree is a map with "a" holding <value>
    And it has no problem

    Examples:
      | format | bytes      | value             |
      | YAML   | a: text    | the string "text" |
      | YAML   | a: "3"     | the string "3"    |
      | YAML   | a: 20m     | the string "20m"  |
      | YAML   | a: 3       | the integer 3     |
      | YAML   | a: 2.5     | the number 2.5    |
      | YAML   | a: true    | the boolean true  |
      | TOML   | a = "text" | the string "text" |
      | TOML   | a = "3"    | the string "3"    |
      | TOML   | a = 3      | the integer 3     |
      | TOML   | a = 2.5    | the number 2.5    |
      | TOML   | a = true   | the boolean true  |

  Scenario: Maps and lists nest
    Given the YAML bytes:
      """
      a:
        b: [x, y]
        c:
          d: 2
        e:
          - f: 1
        g: []
        h: {}
      """
    When tree decodes them
    Then the tree has the values:
      | node     | value          |
      | a.b[0]   | the string "x" |
      | a.b[1]   | the string "y" |
      | a.c.d    | the integer 2  |
      | a.e[0].f | the integer 1  |
      | a.g      | an empty list  |
      | a.h      | an empty map   |

  Scenario: TOML and YAML of the same values decode to the same values
    Given the YAML bytes:
      """
      a: x
      b: [y, z]
      c:
        d: 2
      """
    And the TOML bytes:
      """
      a = "x"
      b = ["y", "z"]
      [c]
      d = 2
      """
    When tree decodes each
    Then each tree has the values:
      | node | value          |
      | a    | the string "x" |
      | b[0] | the string "y" |
      | b[1] | the string "z" |
      | c.d  | the integer 2  |

  Scenario Outline: A tree's top is any value
    Given the YAML bytes "<bytes>"
    When tree decodes them
    Then the tree is <value>
    And it has no problem

    Examples:
      | bytes  | value                                 |
      | - a: x | a list holding a map with "a"         |
      | text   | the string "text"                     |

  Scenario Outline: Bytes that hold no value are an empty tree
    Given the <format> bytes "<bytes>", from "/a/empty.<extension>"
    When tree decodes them
    Then the tree is empty: it holds no value
    And it has no problem

    Examples:
      | format | extension | bytes       |
      | YAML   | yaml      |             |
      | YAML   | yaml      | # a comment |
      | TOML   | toml      |             |
      | TOML   | toml      | # a comment |

  # Decode: origins

  Scenario: Every YAML node keeps its path and line
    Given the YAML bytes, from "/a/v.yaml":
      """
      size: 20m
      items:
        - name: a
        - name: b
      """
    When tree decodes them
    Then the nodes have the origins:
      | node          | path      | line |
      | the top       | /a/v.yaml | 1    |
      | size          | /a/v.yaml | 1    |
      | items         | /a/v.yaml | 2    |
      | items[0]      | /a/v.yaml | 3    |
      | items[0].name | /a/v.yaml | 3    |
      | items[1]      | /a/v.yaml | 4    |
      | items[1].name | /a/v.yaml | 4    |

  Scenario: Every TOML node keeps its path, and has no line
    Given the TOML bytes, from "/a/v.toml":
      """
      size = "20m"

      [shape]
      width = 2
      """
    When tree decodes them
    Then the nodes have the origins:
      | node        | path      | line |
      | the top     | /a/v.toml | none |
      | size        | /a/v.toml | none |
      | shape       | /a/v.toml | none |
      | shape.width | /a/v.toml | none |

  Scenario: Decode keeps the path it is given and reads nothing from it
    Given the YAML bytes "a: [x]", from "/a/v.toml"
    When tree decodes them as YAML
    Then the tree, "a" and "a[0]" have the path "/a/v.toml"
    And it has no problem

  # Decode: problems

  Scenario Outline: Bytes that cannot be parsed are a problem
    Given the <format> bytes "<bytes>", from "/a/bad.<extension>"
    When tree decodes them
    Then there is no tree
    And it has a problem naming "/a/bad.<extension>" and the parser's
      error

    Examples:
      | format | extension | bytes     |
      | YAML   | yaml      | a: [b     |
      | TOML   | toml      | a = [ "b" |

  Scenario: A second YAML document is a problem
    Given the YAML bytes, from "/a/two.yaml":
      """
      a: 1
      ---
      b: 2
      """
    When tree decodes them
    Then there is no tree
    And it has a problem naming "/a/two.yaml": the bytes hold more than
      one document

  # A null over a value would unset it, and nothing unsets.
  Scenario Outline: A key with no value is a problem
    Given the YAML bytes "<bytes>", from "/a/v.yaml"
    When tree decodes them
    Then there is no tree
    And it has a problem at "a.b", "/a/v.yaml" line 1: the key has no
      value

    Examples:
      | bytes         |
      | a: {b: }      |
      | a: {b: null}  |
      | a: {b: ~}     |

  Scenario: A TOML date is a problem
    Given the TOML bytes "a = 2026-10-14", from "/a/v.toml"
    When tree decodes them
    Then there is no tree
    And it has a problem at "a", "/a/v.toml": a date is no value of a
      tree

  Scenario: Every bad value of parsed bytes is reported
    Given the YAML bytes:
      """
      a:
      b:
      """
    When tree decodes them
    Then there is no tree
    And it has exactly two problems: at "a", line 1, and at "b", line 2

  # Merge: maps

  Scenario: A tree over an empty map is that tree
    Given the under tree is an empty map
    And the over tree is "a: 1"
    When tree merges the over tree over the under tree
    Then the tree is a map with "a" holding the integer 1

  Scenario: An empty map over a map leaves its values
    Given the under tree is "a: 1"
    And the over tree is an empty map
    When tree merges the over tree over the under tree
    Then the tree is a map with "a" holding the integer 1

  Scenario: Maps merge by key, the over tree's value winning
    Given the under tree is "a: 1\nb: 1"
    And the over tree is "a: 2\nc: 2"
    When tree merges the over tree over the under tree
    Then the tree has the values:
      | node | value         |
      | a    | the integer 2 |
      | b    | the integer 1 |
      | c    | the integer 2 |

  Scenario: Maps merge by key at every depth
    Given the under tree:
      """
      a:
        name: x
        limits:
          tries: 2
          minutes: 20
      """
    And the over tree:
      """
      a:
        limits:
          minutes: 40
      """
    When tree merges the over tree over the under tree
    Then the tree has the values:
      | node             | value          |
      | a.name           | the string "x" |
      | a.limits.tries   | the integer 2  |
      | a.limits.minutes | the integer 40 |

  Scenario: Nothing unsets: an empty map over a map at depth leaves it
    Given the under tree is "a:\n  x: 1"
    And the over tree is "a: {}"
    When tree merges the over tree over the under tree
    Then "a" is a map with "x" holding the integer 1

  # Merge: lists and scalars

  Scenario Outline: A list replaces a list whole
    Given the under tree is "items: [a, b, c]"
    And the over tree is "items: <over>"
    When tree merges the over tree over the under tree
    Then "items" is <merged>

    Examples:
      | over | merged                     |
      | [d]  | a list holding "d" alone   |
      | []   | an empty list              |

  Scenario: A list of maps replaces whole: its items are not merged
    Given the under tree:
      """
      items:
        - name: a
          size: 20m
      """
    And the over tree:
      """
      items:
        - name: b
      """
    When tree merges the over tree over the under tree
    Then "items" is a list of one map, holding "name" alone

  Scenario Outline: Lists and scalars replace whole
    Given the under tree is "a: <under>"
    And the over tree is "a: <over>"
    When tree merges the over tree over the under tree
    Then "a" is the over tree's <over>

    Examples:
      | under  | over   |
      | 1      | 2      |
      | "1"    | 1      |
      | 1      | true   |
      | text   | ""     |
      | 1      | [1, 2] |
      | [1, 2] | 1      |
      | 1      | {b: 2} |
      | {b: 2} | 1      |
      | [1, 2] | {b: 2} |
      | {b: 2} | [1, 2] |

  Scenario Outline: A tree that is no map at the top replaces whole
    Given the under tree is "<under>"
    And the over tree is "<over>"
    When tree merges the over tree over the under tree
    Then the tree is the over tree's <over>
    And there is no problem

    Examples:
      | under | over |
      | a: 1  | [b]  |
      | [a]   | b: 1 |
      | [a]   | [b]  |
      | a     | b    |

  Scenario Outline: An empty tree is passed over
    Given the under tree is <under>
    And the over tree is <over>
    When tree merges the over tree over the under tree
    Then the tree is <merged>

    Examples:
      | under          | over           | merged          |
      | an empty tree  | "a: 1"         | "a: 1"          |
      | "a: 1"         | an empty tree  | "a: 1"          |
      | an empty tree  | an empty tree  | an empty tree   |

  # Merge: origins

  Scenario: Every node keeps the origin of the tree it came from
    Given the under tree, from "/u.yaml":
      """
      a:
        name: x
        limits:
          tries: 2
        size: 20m
      items:
        - p
        - q
      """
    And the over tree, from "/o.yaml":
      """
      a:
        size: 40m
      items:
        - r
      b: 1
      """
    When tree merges the over tree over the under tree
    Then the nodes have the origins:
      | node           | path    | line |
      | the top        | /o.yaml | 1    |
      | a              | /o.yaml | 1    |
      | a.name         | /u.yaml | 2    |
      | a.limits       | /u.yaml | 3    |
      | a.limits.tries | /u.yaml | 4    |
      | a.size         | /o.yaml | 2    |
      | items          | /o.yaml | 3    |
      | items[0]       | /o.yaml | 4    |
      | b              | /o.yaml | 5    |

  Scenario: A merge over a merged tree keeps each node's own origin
    Given the first tree, from "/1.yaml", is "a: 1\nb: 1\nc: 1"
    And the second tree, from "/2.yaml", is "b: 2\nc: 2"
    And the third tree, from "/3.yaml", is "c: 3"
    When tree merges the second over the first, then the third over that
    Then the nodes have the values and paths:
      | node | value         | path    |
      | a    | the integer 1 | /1.yaml |
      | b    | the integer 2 | /2.yaml |
      | c    | the integer 3 | /3.yaml |

  Scenario: The order of merges is the caller's, and it tells
    Given the first tree is "a:\n  x: 1"
    And the second tree is "a: 0"
    And the third tree is "a:\n  y: 2"
    When tree merges the second over the first, then the third over that
    Then "a" is a map with "y" holding the integer 2 alone
    But when tree merges the third over the second, then that over the
      first
    Then "a" is a map with "x" holding the integer 1 and "y" the integer 2

  # Merge: purity

  Scenario: Merging changes neither tree
    Given the under tree and the over tree of the scenario "Every node
      keeps the origin of the tree it came from"
    When tree merges the over tree over the under tree
    Then the under tree and the over tree have the values and origins
      they had
