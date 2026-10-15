# settings/documents (docs/settings-implementation.md, steps 2 to 5;
# ADR-002, rules 1, 3 and 4) is pure (ADR-001): given a snapshot, each
# document's sources by kind and name, one slot per layer, and the
# problems of its files, it gives one document: a definition, or its
# problems.
# This file: blobs, taken whole from the nearest layer.

Feature: Documents gives a blob whole

  Scenario Outline: A blob is the nearest layer's bytes, whole
    Given the <kind> "a" has the sources:
      | source     | path                           | bytes |
      | home       | /home/.agister/<folder>/a<ext> | far   |
      | repository | /repo/.agister/<folder>/a<ext> | near  |
    When documents is asked for the <kind> "a"
    Then it gives the bytes "near", the path
      "/repo/.agister/<folder>/a<ext>" and the bytes' SHA-256 digest
    And it has no problem

    Examples:
      | kind   | folder  | ext   |
      | prompt | prompts | .md   |
      | schema | schemas | .json |

  Scenario: A blob is not decoded
    Given the prompt "a" has a home source "x: [1"
    When documents is asked for the prompt "a"
    Then it gives the bytes "x: [1"
    And it has no problem

  Scenario: An empty nearer file is the blob
    Given the prompt "a" has a home source "far" and a repository source
      at "/repo/.agister/prompts/a.md", a file with no bytes
    When documents is asked for the prompt "a"
    Then it gives no bytes, the path "/repo/.agister/prompts/a.md" and the
      SHA-256 digest of no bytes
    And it has no problem

  Scenario: A blob no layer holds is a problem
    Given the snapshot holds no prompt "a"
    When documents is asked for the prompt "a"
    Then there is no blob
    And it has a problem: no layer holds the prompt "a"

  Scenario: A blob's file problem is no fall back
    Given the prompt "a" has a home source "far"
    And the snapshot gives the prompt "a" the file problem
      "/repo/.agister/prompts/a.md: permission denied"
    When documents is asked for the prompt "a"
    Then there is no blob
    And it has that problem
