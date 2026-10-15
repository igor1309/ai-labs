# settings/documents (docs/settings-implementation.md, steps 2 to 5;
# ADR-002, rules 1, 3 and 4) is pure (ADR-001): given a snapshot, each
# document's sources by kind and name, one slot per layer, and the
# problems of its files, it gives one document: a definition, or its
# problems.
  # The runtime (ADR-003, rule 3): a runtime mapping, for one runtime
  # wrapper, of the options it offers and what each grants.

Feature: Documents gives a runtime

  Scenario: A runtime's fields
    Given the runtime "a" has a home source:
      """
      schema: agister.runtime/v1alpha1
      name: a
      adapter: codex
      contract: codex/2
      efforts: [low, high]
      primitives:
        select: one
        items:
          read-only: {grants: [repository.read], verified: ["0.161."]}
          workspace-write: {grants: [repository.read, repository.write]}
      """
    When documents is asked for the runtime "a"
    Then it gives the runtime "a" with the adapter "codex", the contract
      "codex/2", the efforts "low" and "high", and the select "one"
    And its primitives, by name:
      | primitive       | grants                            | verified |
      | read-only       | repository.read                   | 0.161.   |
      | workspace-write | repository.read, repository.write |          |
    And each field's origin is "/home/.agister/runtimes/a.yaml"
    And it has no problem

  Scenario: A runtime needs its adapter, its contract and its primitives
    Given the runtime "a" has a home source of its schema, its name and
      "efforts: [low]"
    When documents is asked for the runtime "a"
    Then there is no definition
    And it has exactly three problems: at "adapter", "contract" and
      "primitives", each "it is missing"

  Scenario Outline: A runtime's primitives are a choice of options, each
    granting something
    Given the runtime "a" has a home source of a valid runtime but for
      <fault>
    When documents is asked for the runtime "a"
    Then there is no definition
    And it has a problem at "<field>": <message>

    Examples:
      | fault                              | field                     | message                        |
      | the select "some"                  | primitives.select         | it is "any" or "one"           |
      | no select                          | primitives.select         | it is missing                  |
      | no items                           | primitives.items          | it is missing                  |
      | the items {}                       | primitives.items          | it names a primitive           |
      | the item "x: {verified: ['0.1.']}" | primitives.items.x.grants | it is missing                  |
      | the item "x: {grants: []}"         | primitives.items.x.grants | it grants a permission         |
      | the item "x: {grants: [a], y: 1}"  | primitives.items.x.y      | the field is not known         |
      | the efforts [1]                    | efforts[0]                | it is a string, not an integer |
