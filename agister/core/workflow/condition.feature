# core/workflow, a condition: pure, over params, inputs, state and the
# outputs of items that have ended. Spies answer its ports.

Feature: A condition holds or does not

  Scenario Outline: A condition over a step's output
    Given the step "t" completes with the output <output>
    When the condition <condition> is read
    Then it <holds>

    Examples:
      | output                               | condition                                                      | holds         |
      | {"code": 0}                          | steps.t.outputs.code equals 0                                  | holds         |
      | {"code": 0}                          | steps.t.outputs.code equals "0"                                | does not hold |
      | {"ok": true}                         | steps.t.outputs.ok equals true                                 | holds         |
      | {"v": "a"}                           | steps.t.outputs.v equals "a"                                   | holds         |
      | {"v": "a"}                           | steps.t.outputs.w is present                                   | does not hold |
      | {"v": "a"}                           | steps.t.outputs.w equals "a"                                   | does not hold |
      | {"fs": [{"fixed": 1}, {"fixed": 2}]} | all of steps.t.outputs.fs where item.fixed is present          | holds         |
      | {"fs": [{"fixed": 1}, {}]}           | all of steps.t.outputs.fs where item.fixed is present          | does not hold |
      | {"fs": [{"fixed": 1}, {}]}           | any of steps.t.outputs.fs where item.fixed is present          | holds         |
      | {"fs": []}                           | all of steps.t.outputs.fs where item.fixed is present          | holds         |
      | {"fs": []}                           | any of steps.t.outputs.fs where item.fixed is present          | does not hold |
      | {"fs": "x"}                          | all of steps.t.outputs.fs where item.fixed is present          | does not hold |
      | {"code": 1}                          | not steps.t.outputs.code equals 0                              | holds         |
      | {"code": 1, "v": "a"}                | steps.t.outputs.code equals 1 and steps.t.outputs.v equals "b" | does not hold |
      | {"code": 1, "v": "a"}                | steps.t.outputs.code equals 0 or steps.t.outputs.v equals "a"  | holds         |

  Scenario: A param or an input is text
    Given the param "p" given "0"
    When the condition params.p equals "0" is read, then params.p equals 0
    Then the first holds, and the second does not
