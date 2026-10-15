# settings/documents (docs/settings-implementation.md, steps 2 to 5;
# ADR-002, rules 1, 3 and 4) is pure (ADR-001): given a snapshot, each
# document's sources by kind and name, one slot per layer, and the
# problems of its files, it gives one document: a definition, or its
# problems.
# This file: the agent.

Feature: Documents gives an agent

  Scenario: An agent's fields
    Given the agent "a" has a home source:
      """
      schema = "agister.agent/v1alpha1"
      runtime = "claude-code"
      model = "opus"
      model_family = "anthropic"
      effort = "high"
      command = "/usr/local/bin/claude"
      """
    When documents is asked for the agent "a"
    Then it gives the agent "a" with:
      | field        | value                 |
      | runtime      | claude-code           |
      | model        | opus                  |
      | model family | anthropic             |
      | effort       | high                  |
      | command      | /usr/local/bin/claude |
    And each field's origin is "/home/.agister/agents/a.toml"
    And it has no problem

  Scenario: An agent needs only its runtime
    Given the agent "a" has a home source of its schema and
      "runtime = 'codex'"
    When documents is asked for the agent "a"
    Then it gives the agent "a" with the runtime "codex" and no model,
      model family, effort or command
    And it has no problem

  Scenario: An agent with no runtime is a problem
    Given the agent "a" has a home source of its schema alone
    When documents is asked for the agent "a"
    Then there is no definition
    And it has a problem at "runtime": it is missing

  # An agent names its runtime mapping (ADR-002, rule 5): a reference,
  # whose name is given bare or with its kind before it.
  Scenario Outline: An agent names its runtime, with its kind or without
    Given the agent "a" has a home source of its schema and
      "runtime = '<runtime>'"
    When documents is asked for the agent "a"
    Then <outcome>

    Examples:
      | runtime       | outcome                                               |
      | codex         | it gives the agent "a" with the runtime "codex"       |
      | runtime:codex | it gives the agent "a" with the runtime "codex"       |
      | prompt:codex  | it has a problem at "runtime": it names a runtime     |
