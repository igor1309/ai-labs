# The behaviours of settings/layout, before its code: the repository's blocks.
# See reading.feature for what layout is given and what it gives.

Feature: Layout reads the repository's blocks

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

  Scenario: Blocks that cannot be read are a problem of the repository layer
    Given the repository folder "/repo/.agister" holds "blocks.yaml"
    And "blocks.yaml" cannot be read
    When layout reads
    Then the snapshot has no blocks
    And the repository layer has a problem naming
      "/repo/.agister/blocks.yaml" and the read's error
