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
      | verify    | verifies   | .yaml     |
      | brief     | briefs     | .yaml     |
      | schema    | schemas    | .json     |
      | prompt    | prompts    | .md       |
    And a name is a lowercase letter or digit, then lowercase letters,
      digits, "_" and "-"

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
    Given the home, repository and project folders
    And each holds "processes/review.yaml" with bytes of its own
    When layout reads
    Then the document process "review" has a home, a repository and a
      project source, each with its own folder's path and bytes

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
      | verify   | verifies  | .yaml     |
      | brief    | briefs    | .yaml     |
      | schema   | schemas   | .json     |
      | prompt   | prompts   | .md       |

  Scenario: An empty file is a source with no bytes
    Given the home folder holds "processes/review.yaml" with no bytes
    When layout reads
    Then the document process "review" has a home source with no bytes
    And it has no problem

  # Blocks

  Scenario: The repository folder holds blocks
    Given the repository folder "/repo/.agister"
    And it holds "blocks.yaml" with the bytes "- process: review"
    When layout reads
    Then the snapshot's blocks have the path "/repo/.agister/blocks.yaml"
      and the bytes "- process: review"

  Scenario Outline: Blocks outside the repository folder are a problem
    Given the <layer> folder holds "blocks.yaml"
    When layout reads
    Then the snapshot has no blocks
    And it has a problem of the file "<layer folder>/blocks.yaml":
      blocks belong to the repository folder alone

    Examples:
      | layer   | layer folder    |
      | home    | /home/.agister  |
      | project | /repo/p/.agister |

  # Problems

  Scenario: A file that cannot be read is a problem of its document
    Given the home folder holds "processes/a.yaml" and "processes/b.yaml"
    And "processes/a.yaml" cannot be read
    When layout reads
    Then process "a" has a problem naming its path and the read's error
    And process "b" has a home source with its bytes

  Scenario: A layer folder that cannot be listed is a problem of its layer
    Given the home and repository folders
    And the repository folder cannot be listed
    When layout reads
    Then the repository layer has a problem naming its folder and the error
    And the home folder's documents are read

  Scenario: A kind's folder that cannot be listed is a problem of its layer
    Given the home folder's "processes" folder cannot be listed
    And the home folder holds "prompts/review.md"
    When layout reads
    Then the home layer has a problem naming "processes" and the error
    And prompt "review" has a home source

  Scenario: A layer folder given that does not exist is a problem
    Given the project folder "/repo/p/.agister", which does not exist
    When layout reads
    Then the project layer has a problem: its folder does not exist

  Scenario: A file with another extension in a kind's folder is a problem
    Given the home folder holds "processes/review.toml"
    When layout reads
    Then process "review" has a problem naming the path: a process is a
      ".yaml" file
    And the file is not read

  Scenario: A file whose name is no name is a problem
    Given the home folder holds "processes/Bad Name.yaml"
    When layout reads
    Then the file "processes/Bad Name.yaml" has a problem: "Bad Name" is
      no name
    And the file is not read

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
