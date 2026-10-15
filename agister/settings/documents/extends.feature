# settings/documents (docs/settings-implementation.md, steps 2 to 5;
# ADR-002, rules 1, 3 and 4) is pure (ADR-001): given a snapshot, each
# document's sources by kind and name, one slot per layer, and the
# problems of its files, it gives one document: a definition, or its
# problems.
# This file: extends, a base's tree under the extending document's.

Feature: Documents applies extends

  Scenario: An extending document is its base's tree with its own over it
    Given the process "base" has a home source "{x: 1, y: 1}"
    And the process "a" has a home source "{extends: base, y: 2}"
    When documents is asked for the process "a"
    Then its tree is:
      | field   | value | origin                             |
      | extends | base  | /home/.agister/processes/a.yaml    |
      | x       | 1     | /home/.agister/processes/base.yaml |
      | y       | 2     | /home/.agister/processes/a.yaml    |

  Scenario: The base is composed from its layers first
    Given the process "base" has a home source "{x: 1}" and a repository
      source "{x: 2}"
    And the process "a" has a home source "{extends: base}"
    When documents is asked for the process "a"
    Then its tree holds x 2 from the repository's base file

  Scenario: Extends is read after the extending document's layers merge
    Given the process "a" has a home source "{extends: b}" and a project
      source "{extends: c}"
    And the processes "b" and "c" have home sources
    When documents is asked for the process "a"
    Then its base is the process "c"

  Scenario: A base may extend a base
    Given the process "c" has a home source "{x: 1, y: 1, z: 1}"
    And the process "b" has a home source "{extends: c, y: 2, z: 2}"
    And the process "a" has a home source "{extends: b, z: 3}"
    When documents is asked for the process "a"
    Then its tree holds x 1 from c, y 2 from b and z 3 from a

  Scenario: A base of another kind is not reached
    Given the agent "base" has a home source
    And the process "a" has a home source "{extends: base}"
    And the snapshot holds no process "base"
    When documents is asked for the process "a"
    Then it has a problem at "extends": no layer holds the process "base"

  Scenario: A base with a problem is a problem of the extending document
    Given the process "base" has a home source "x: [1"
    And the process "a" has a home source "{extends: base}"
    When documents is asked for the process "a"
    Then there is no definition
    And it has a problem at "extends" naming the process "base" and its
      problem

  Scenario: Extends that comes back to the document is a problem
    Given the process "a" has a home source "{extends: b}"
    And the process "b" has a home source "{extends: a}"
    When documents is asked for the process "a"
    Then there is no definition
    And it has a problem at "extends": "a" extends "b" extends "a"

  Scenario: Extends that is no string is a problem
    Given the process "a" has a home source "{extends: [b]}"
    When documents is asked for the process "a"
    Then there is no definition
    And it has a problem at "extends": it is the name of a process

  # A base is a document of the extending document's kind (ADR-002, rule
  # 4): its name may be given bare, or with that kind before it, as the
  # shipped settings write it.
  Scenario Outline: Extends names the base, with its kind or without
    Given the process "review" has a home source "{x: 1}"
    And the process "a" has a home source "{extends: <extends>}"
    When documents is asked for the process "a"
    Then its tree holds x 1 from the process "review"
    And it has no problem

    Examples:
      | extends        |
      | review         |
      | process:review |

  Scenario: Extends that names another kind is a problem
    Given the process "a" has a home source "{extends: 'agent:x'}"
    When documents is asked for the process "a"
    Then there is no definition
