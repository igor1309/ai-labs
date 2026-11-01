# settings/documents (docs/run-implementation.md, "A daily budget"):
# home's budget file, which layout gives as bytes, typed. Its problems
# are problems of no document.

Feature: Documents types home's budget

  Scenario: A daily budget is a cost in US dollars
    Given the budget file "/home/.agister/budget.yaml":
      """
      daily:
        cost: 20
      """
    When documents gives the budget
    Then its daily cost is 20, on line 2, and there is no problem

  Scenario Outline: No budget file, or an empty one, gives no budget
    Given <file>
    When documents gives the budget
    Then there is none, and no problem

    Examples:
      | file                           |
      | no budget file                 |
      | the budget file holds no bytes |

  Scenario Outline: A budget that is not a daily cost is a problem
    Given the budget file holds "<budget>"
    When documents gives the budget
    Then there is no budget, and the problem <problem>

    Examples:
      | budget                    | problem                                                        |
      | daily: {cost: 0}          | at "daily.cost": it is more than zero                          |
      | daily: {cost: -1}         | at "daily.cost": it is more than zero                          |
      | daily: {cost: lots}       | at "daily.cost": it is a number, not a string                  |
      | daily: {}                 | at "daily.cost": it is missing                                 |
      | daily: {cost: 1, time: 1} | at "daily.time": the field is not known                        |
      | weekly: {cost: 1}         | at "weekly": the field is not known; at "daily": it is missing |
      | - daily                   | of the file: it is a map                                       |
