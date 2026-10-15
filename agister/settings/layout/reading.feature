# The behaviours of settings/layout, before its code: what its tests prove.
# See docs/settings-implementation.md, step 1. Layout is given a filesystem,
# a spy in every test (ADR-009), and the three layers' folders, home's, the
# repository's and the project's, each of them or none. It gives a
# snapshot: each document's sources by kind and name, the repository's
# blocks, and problems.

Feature: Layout reads the settings files of the layer folders it is given

  Background:
    Given each kind has its folder and its file extension:
      | kind      | folder     | extension |
      | agent     | agents     | .toml     |
      | process   | processes  | .yaml     |
      | workflow  | workflows  | .yaml     |
      | runtime   | runtimes   | .yaml     |
      | brief     | briefs     | .yaml     |
      | schema    | schemas    | .json     |
      | prompt    | prompts    | .md       |
    And a name is a lowercase letter, then lowercase letters, digits, "_"
      and "-", as the archive's names are

  # Reading what is there

  Scenario: No layer folder is given
    Given no home, repository or project folder
    When layout reads
    Then the snapshot holds no document and no blocks
    And it has no problem

  Scenario: One layer holds a document
    Given the home folder "/home/.agister"
    And it holds "processes/review.yaml" with the bytes "timeout: 20m"
    When layout reads
    Then the document process "review" has a home source
      with the path "/home/.agister/processes/review.yaml"
      and the bytes "timeout: 20m"
    And it has no repository source and no project source

  Scenario: Every layer holds the same document
    Given the home folder "/home/.agister" holds "processes/review.yaml"
      with the bytes "timeout: 20m"
    And the repository folder "/repo/.agister" holds
      "processes/review.yaml" with the bytes "timeout: 30m"
    And the project folder "/repo/p/.agister" holds
      "processes/review.yaml" with the bytes "timeout: 40m"
    When layout reads
    Then the document process "review" has the sources:
      | source     | path                                     | bytes        |
      | home       | /home/.agister/processes/review.yaml     | timeout: 20m |
      | repository | /repo/.agister/processes/review.yaml     | timeout: 30m |
      | project    | /repo/p/.agister/processes/review.yaml   | timeout: 40m |

  Scenario: Layers hold different documents
    Given the home folder holds "processes/a.yaml"
    And the repository folder holds "processes/b.yaml"
    When layout reads
    Then the snapshot holds process "a", with a home source alone
    And it holds process "b", with a repository source alone

  Scenario Outline: A kind's folder and extension give its documents
    Given the home folder holds "<folder>/review<extension>"
    When layout reads
    Then the snapshot holds the <kind> "review", with a home source

    Examples:
      | kind     | folder    | extension |
      | agent    | agents    | .toml     |
      | process  | processes | .yaml     |
      | workflow | workflows | .yaml     |
      | runtime  | runtimes  | .yaml     |
      | brief    | briefs    | .yaml     |
      | schema   | schemas   | .json     |
      | prompt   | prompts   | .md       |

  Scenario: An empty file is a source with no bytes
    Given the home folder holds "processes/review.yaml" with no bytes
    When layout reads
    Then the document process "review" has a home source with no bytes
    And it has no problem
