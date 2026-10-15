# settings/documents (docs/settings-implementation.md, steps 2 to 5;
# ADR-002, rules 1, 3 and 4) is pure (ADR-001): given a snapshot, each
# document's sources by kind and name, one slot per layer, and the
# problems of its files, it gives one document: a definition, or its
# problems.
  # The runtime (ADR-003, rule 3; ADR-012, rule 4): a runtime mapping, for
  # one runtime wrapper, of what it grants with no option, and of the
  # options it offers, one or any of them, with what each grants.

Feature: Documents gives a runtime

  Scenario: A runtime's fields
    Given the runtime "a" has a home source:
      """
      schema: agister.runtime/v1alpha1
      name: a
      adapter: codex
      contract: codex/2
      efforts: [low, high]
      grants: [host.read]
      select: one
      options:
        read-only: {grants: [repository.read], verified: ["0.161."]}
        workspace-write: {grants: [repository.read, repository.write]}
      """
    When documents is asked for the runtime "a"
    Then it gives the runtime "a" with the adapter "codex", the contract
      "codex/2", the efforts "low" and "high", the grants "host.read",
      and the select "one"
    And its options, by name:
      | option          | grants                            | verified |
      | read-only       | repository.read                   | 0.161.   |
      | workspace-write | repository.read, repository.write |          |
    And each field's origin is "/home/.agister/runtimes/a.yaml"
    And it has no problem

  Scenario: A runtime may offer no option
    Given the runtime "a" has a home source of its schema, its name, its
      adapter, its contract and "grants: [process.execute]"
    When documents is asked for the runtime "a"
    Then it gives the runtime "a" with the grants "process.execute", no
      select and no option

  Scenario: A nearer layer drops what the runtime grants with no option
    Given the runtime "a" has a home source of a valid runtime
    And a repository source "grants: []"
    When documents is asked for the runtime "a"
    Then it gives the runtime "a" with no grant, its other fields the
      home source's

  Scenario: A runtime needs its adapter and its contract
    Given the runtime "a" has a home source of its schema and its name
    When documents is asked for the runtime "a"
    Then there is no definition
    And it has exactly two problems: at "adapter" and "contract", each
      "it is missing"

  Scenario Outline: A runtime's options are chosen one or any, and each
    grants something
    Given the runtime "a" has a home source of a valid runtime but for
      <fault>
    When documents is asked for the runtime "a"
    Then there is no definition
    And it has a problem at "<field>": <message>

    Examples:
      | fault                             | field            | message                |
      | the select "some"                 | select           | it is "any" or "one"   |
      | options with no select            | select           | it is missing          |
      | a select with no options          | options          | it is missing          |
      | the options {}                    | options          | it names an option     |
      | the option "x: {verified: [0.1]}" | options.x.grants | it is missing          |
      | the option "x: {grants: []}"      | options.x.grants | it grants a permission |
