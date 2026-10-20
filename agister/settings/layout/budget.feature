# settings/layout (docs/run-implementation.md, "A daily budget"): home's
# budget file. See reading.feature for what layout is given and what it
# gives.

Feature: Layout reads home's budget

  Scenario: The home folder holds a budget
    Given the home folder "/home/.agister"
    And it holds "budget.yaml" with the bytes "daily: {cost: 20}"
    When layout reads
    Then the snapshot's budget has the path "/home/.agister/budget.yaml"
      and the bytes "daily: {cost: 20}"

  Scenario: No budget file gives no budget
    Given the home folder holds no "budget.yaml"
    When layout reads
    Then the snapshot has no budget, and no problem

  Scenario Outline: A budget outside the home folder is a problem
    Given the <layer> folder holds "budget.yaml"
    When layout reads
    Then the snapshot has no budget
    And it has a problem of the file "<layer folder>/budget.yaml": a
      budget belongs to the home folder alone

    Examples:
      | layer      | layer folder     |
      | repository | /repo/.agister   |
      | project    | /repo/p/.agister |

  Scenario: A budget that cannot be read is a problem of the home layer
    Given the home folder "/home/.agister" holds "budget.yaml"
    And "budget.yaml" cannot be read
    When layout reads
    Then the snapshot has no budget
    And the home layer has a problem naming "/home/.agister/budget.yaml"
      and the read's error
