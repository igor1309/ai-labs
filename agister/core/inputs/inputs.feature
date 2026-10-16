# core/inputs (docs/run-implementation.md, "The first run"; ADR-010):
# a call's inputs resolved from their sources, before it starts, to a
# value and its identity.

Feature: Inputs are resolved from their sources

  Scenario: The param source gives the named param
    Given the input "goal" from the source "param", named "g", and the
      param "g" given "ship it"
    When the inputs are resolved
    Then "goal" is "ship it", its identity the SHA-256 of "ship it"

  Scenario: A source not known refuses the call before it starts
    Given the input "base" from the source "git.revision"
    When the inputs are resolved
    Then it refuses, failed, class "refused": the source "git.revision"
      is not known

  Scenario: A param not given takes its default
    Given the param "base" with the default "main", not given, and the
      input "b" from the source "param", named "base"
    When the inputs are resolved
    Then "b" is "main"

  Scenario: The environment's references are evaluated
    Given the params "p" given "1", the input "i" of value "2", and the
      environment A="x", B from params.p and C from inputs.i
    When the environment is resolved
    Then it is A=x, B=1 and C=2
