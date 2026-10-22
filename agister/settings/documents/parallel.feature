# settings/documents (docs/settings-implementation.md, steps 2 to 5;
# ADR-002, rules 1, 3 and 4) is pure (ADR-001): given a snapshot, each
# document's sources by kind and name, one slot per layer, and the
# problems of its files, it gives one document: a definition, or its
# problems.
# This file: a workflow's parallel, a list of its items, or a map of its
# items and the most of them that run at once (ADR-012, rule 8).

Feature: Documents gives a parallel and its max

  Scenario: A parallel of a map gives its items and its max
    Given the workflow "a" has a home source:
      """
      schema: agister.workflow/v1alpha1
      steps:
        - name: reviews
          parallel:
            max: 1
            steps:
              - {name: tests, process: tests_review, agent: codex}
              - {name: intent, process: intent_review, agent: codex}
      """
    When documents is asked for the workflow "a"
    Then it gives the parallel "reviews" of "tests", at
      "steps[0].parallel.steps[0]", and "intent", at
      "steps[0].parallel.steps[1]", its max 1, at "steps[0].parallel.max"
    And it has no problem

  Scenario Outline: A parallel's max is given only where its map gives it
    Given the workflow "a" has a home source whose parallel "reviews" is
      <parallel>
    When documents is asked for the workflow "a"
    Then it gives the parallel "reviews" of its items, and no max

    Examples:
      | parallel                                    |
      | a list of its items                         |
      | a map of its items, under steps, and no max |

  Scenario Outline: A parallel's map holds its items and a max of 1 or more
    Given the workflow "a" has a home source whose parallel "reviews"
      <fault>
    When documents is asked for the workflow "a"
    Then there is no definition
    And it has a problem at "<field>": <message>

    Examples:
      | fault                          | field                    | message                        |
      | is a map of max 0              | steps[0].parallel.max    | it is at least 1               |
      | is a map of max "one"          | steps[0].parallel.max    | it is an integer, not a string |
      | is a map with no steps         | steps[0].parallel.steps  | it is missing                  |
      | is a map with the key "colour" | steps[0].parallel.colour | the field is not known         |
      | is a list beside the max 1     | steps[0].max             | the field is not known         |
