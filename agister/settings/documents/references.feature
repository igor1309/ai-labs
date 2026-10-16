# settings/documents (docs/settings-implementation.md, "The composition"):
# a reference is typed whole, in a workflow and a process alike, so the
# composition answers resolve's source with what it reads and parses no
# text (ADR-011, rules 3 and 4).

Feature: Documents types a reference whole

  Scenario Outline: A reference gives what it reads
    Given the workflow "w" has an output "o" that reads "<reads>"
    When documents gives the workflow "w"
    Then the output "o" reads <what>

    Examples:
      | reads             | what                                         |
      | params.base       | the param "base"                             |
      | inputs.base       | the input "base"                             |
      | state.review      | the state "review"                           |
      | state.review.x    | the field "x" of the state "review"          |
      | steps.a.outputs   | the outputs of the step "a"                  |
      | steps.a.outputs.v | the field "v" of the outputs of the step "a" |
      | steps.a.session   | the session of the step "a"                  |

  Scenario Outline: A reference that reads none of these is a problem
    Given the <document> has <field> that reads "<reads>"
    When documents gives it
    Then it has the problem at "<place>": it reads <roots>

    Examples:
      | document     | field                  | reads               | place            | roots                                                                       |
      | workflow "w" | an output "o"          | params.base.x       | outputs.o        | params.<name>, inputs.<name>, state.<name>[.<field>] or steps.<name>.<part> |
      | workflow "w" | an output "o"          | state.review.x.y    | outputs.o        | params.<name>, inputs.<name>, state.<name>[.<field>] or steps.<name>.<part> |
      | workflow "w" | an output "o"          | steps.a             | outputs.o        | params.<name>, inputs.<name>, state.<name>[.<field>] or steps.<name>.<part> |
      | workflow "w" | an output "o"          | steps.a.outputs.v.w | outputs.o        | params.<name>, inputs.<name>, state.<name>[.<field>] or steps.<name>.<part> |
      | process "p"  | its environment's HEAD | state.review        | environment.HEAD | params.<name> or inputs.<name>                                              |
      | process "p"  | its environment's HEAD | params.base.x       | environment.HEAD | params.<name> or inputs.<name>                                              |

  Scenario Outline: The item of a query is read in the query's where
    Given the workflow "w" has a repeat until all of "state.findings"
      where "<reads>" is present
    When documents gives the workflow "w"
    Then <what>

    Examples:
      | reads      | what                                                                              |
      | item       | the query reads the item                                                          |
      | item.fixed | the query reads the field "fixed" of the item                                     |
      | item.a.b   | it has a problem at the where: it reads item[.<field>] or what its workflow reads |

  Scenario Outline: The item read outside a query's where is a problem
    Given the workflow "w"'s first step is a branch whose first arm's
      condition is <condition>
    When documents gives the workflow "w"
    Then it has the problem at "<place>": item is read in the where of
      all or any

    Examples:
      | condition                                                   | place                         |
      | {present: {from: item.fixed}}                               | steps[0].branch[0].if.present |
      | {all: {in: {from: item.x}, where: {present: {from: item}}}} | steps[0].branch[0].if.all.in  |
