# The behaviours of settings/layout, before its code: names, and what is skipped.
# See reading.feature for what layout is given and what it gives.

Feature: Layout reads names, and skips what is not settings

  Background:
    Given a name is a lowercase letter, then lowercase letters, digits, "_"
      and "-", as the archive's names are

  Scenario: A file with another extension in a kind's folder is a problem
    Given the home folder holds "processes/review.toml"
    When layout reads
    Then process "review" has a problem naming the path: a process is a
      ".yaml" file
    And the file is not read

  Scenario Outline: A file whose name is no name is a problem
    Given the home folder holds "processes/<file>"
    When layout reads
    Then the file "processes/<file>" has a problem: "<name>" is no name
    And the file is not read

    Examples:
      | file          | name     |
      | Bad Name.yaml | Bad Name |
      | Review.yaml   | Review   |
      | aZ.yaml       | aZ       |
      | 0a.yaml       | 0a       |
      | -a.yaml       | -a       |
      | _a.yaml       | _a       |
      | a.b.yaml      | a.b      |

  Scenario Outline: A name of letters, digits, "_" and "-" is a name
    Given the home folder holds "processes/<file>"
    When layout reads
    Then the snapshot holds process "<name>"
    And it has no problem

    Examples:
      | file         | name   |
      | a.yaml       | a      |
      | a-b_c.yaml   | a-b_c  |
      | a0.yaml      | a0     |

  Scenario: A folder inside a kind's folder is a problem
    Given the home folder holds "processes/team/review.yaml"
    When layout reads
    Then the folder "processes/team" has a problem: a kind's folder holds
      files alone
    And nothing in it is read

  # What layout skips

  Scenario Outline: What is not settings is skipped
    Given the home folder holds "<path>"
    When layout reads
    Then the snapshot holds no document
    And it has no problem
    And "<path>" is not read

    Examples:
      | path                    | why                                     |
      | .DS_Store               | a hidden file                           |
      | processes/.DS_Store     | a hidden file in a kind's folder        |
      | .git/config             | a hidden folder                         |
      | service.toml            | a file outside the kinds' folders       |
      | notes/todo.md           | a folder that is no kind's              |
      | skills/review/SKILL.md  | skills, left out for now (backlog)      |
