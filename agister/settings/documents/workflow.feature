# settings/documents (docs/settings-implementation.md, steps 2 to 5;
# ADR-002, rules 1, 3 and 4) is pure (ADR-001): given a snapshot, each
# document's sources by kind and name, one slot per layer, and the
# problems of its files, it gives one document: a definition, or its
# problems.
  # The workflow (ADR-011): its params and inputs, as a process's; its
  # steps, a sequence; and its outputs, its contract and mapping. An item
  # is a step, binding a process to an agent, and continuing an earlier
  # call's session where it names one (rule 3); a workflow, by name; or
  # a parallel, a branch or a repetition of items (rule 2). Bindings,
  # conditions (rule 4) and outputs read params, inputs, state and steps.

Feature: Documents gives a workflow

  Scenario: A workflow's fields
    Given the workflow "a" has a home source:
      """
      schema: agister.workflow/v1alpha1
      params:
        base: {default: origin/trunk}
      inputs:
        base: {source: git.revision, rev: {from: params.base}}
      steps:
        - name: reviews
          parallel:
            - {name: tests, process: tests_review, agent: codex, inputs: {base: {from: inputs.base}}}
            - {name: intent, workflow: intent, inputs: {base: {from: inputs.base}}}
        - name: judge
          process: review_judge
          agent: claude-opus
          inputs: {reviews: {from: steps.reviews.outputs}}
        - name: decide
          branch:
            - name: fix
              if: {not: {equals: [{from: steps.judge.outputs.verdict}, approve]}}
              repeat:
                state: {review: {from: steps.judge.outputs}}
                steps:
                  - {name: repair, process: implement, agent: codex, inputs: {review: {from: state.review}}}
                next: {review: {from: steps.repair.outputs}}
                until: {all: {in: {from: state.review.findings}, where: {present: {from: item.fixed}}}}
                max: 3
              outputs: {summary: {from: steps.fix.outputs.review}}
            - name: done
              process: summarize
              agent: claude-opus
              session: {from: steps.judge.session}
              outputs: {summary: {from: steps.done.outputs.summary}}
      outputs:
        summary: {from: steps.decide.outputs.summary}
      """
    When documents is asked for the workflow "a"
    Then it gives the workflow "a" with each of those fields, a name the
      name alone, a reference what it reads, and its items in order
    And each field's origin is "/home/.agister/workflows/a.yaml"
    And it has no problem

  Scenario: A workflow needs its steps
    Given the workflow "a" has a home source of its schema alone
    When documents is asked for the workflow "a"
    Then there is no definition
    And it has a problem at "steps": it is missing

  Scenario Outline: A workflow's items each hold what they name
    Given the workflow "a" has a home source of a valid workflow but for
      <fault>
    When documents is asked for the workflow "a"
    Then there is no definition
    And it has a problem at "<field>": <message>

    Examples:
      | fault                                 | field                           | message                                                                              |
      | the steps []                          | steps                           | it has an item                                                                       |
      | an item with no name                  | steps[1].name                   | it is missing                                                                        |
      | a second item named judge             | steps[2].name                   | no other item of its workflow has it                                                 |
      | an item with a process and a workflow | steps[1]                        | it is a step, a workflow, a parallel, a branch or a repeat                           |
      | an item of its name alone             | steps[1]                        | it is a step, a workflow, a parallel, a branch or a repeat                           |
      | a step with no agent                  | steps[1].agent                  | it is missing                                                                        |
      | the process "agent:x"                 | steps[1].process                | it names a process                                                                   |
      | the binding {from: outputs.x}         | steps[1].inputs.reviews         | it reads params.<name>, inputs.<name>, state.<name>[.<field>] or steps.<name>.<part> |
      | a last arm with an if                 | steps[2].branch[1].if           | the last arm is the default, with no if                                              |
      | an arm with no outputs                | steps[2].branch[1].outputs      | it is missing                                                                        |
      | the condition {same: [a, b]}          | steps[2].branch[0].if           | it has one operator of equals, present, all, any, and, or, not                       |
      | the condition {equals: [a]}           | steps[2].branch[0].if.equals    | it is a reference and a value                                                        |
      | the condition {and: []}               | steps[2].branch[0].if.and       | it is a list of conditions, one or more                                              |
      | a repeat of max 0                     | steps[2].branch[0].repeat.max   | it is at least 1                                                                     |
      | a repeat with no until                | steps[2].branch[0].repeat.until | it is missing                                                                        |
