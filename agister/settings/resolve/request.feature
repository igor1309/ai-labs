# The behaviours of settings/resolve, before its code: the request
# (ADR-002, rule 6; ADR-013). Resolve is given a source, a spy in every
# test (ADR-009): each document by kind and name, in resolve's types,
# holding only what resolve reads, or its problems; and the problems of
# no document. It gives what it checked: the workflow, every document it
# reached, by kind and name; or a refusal: every document at fault, each
# with its problems and the first chain that reached it; and the
# problems of no document, the request's among them.

Feature: Resolve takes a request naming a document or a step

  Scenario: A workflow requested resolves with what it reaches
    Given the workflow "w" has the step "s", the process "p" on the agent "a"
    And the agent "a" names the runtime "r"
    When resolve is asked for the workflow "w"
    Then it gives the workflow "w"
    And it reached the workflow "w", the process "p", the agent "a" and
      the runtime "r"

  # The made workflow has the process's inputs (ADR-013, rule 1) as a
  # caller can give them, by the params they are resolved from (ADR-010,
  # rule 1); each param keeps its default.

  Scenario: A step requested alone is a workflow of that one step
    Given the process "p" has the params "base" and "goal"
    And the agent "a" names the runtime "r"
    When resolve is asked for the step of the process "p" on the agent "a"
    Then it gives a workflow of no name, with the params "base" and "goal"
    And its one step "p" binds the process "p" to the agent "a", each
      param given from the workflow's of its name
    And its output "output" reads "steps.p.outputs"
    And it reached the process "p", the agent "a" and the runtime "r"

  Scenario: A step requested alone resolves as its parts
    Given the process "p" has a problem
    When resolve is asked for the step of the process "p" on the agent "a"
    Then it refuses: the process "p", reached by the request, and its
      problem

  Scenario: A document of another kind resolves, and is no workflow
    Given the agent "a" names the runtime "r"
    When resolve is asked for the agent "a"
    Then it gives no workflow
    And it reached the agent "a" and the runtime "r"

  Scenario Outline: A problem of no document refuses every request
    Given the source has a problem of no document
    And <request> resolves on its own
    When resolve is asked for <request>
    Then it refuses: the problem, of no document and no chain

    Examples:
      | request                                      |
      | the workflow "w"                             |
      | the step of the process "p" on the agent "a" |
      | the agent "a"                                |
