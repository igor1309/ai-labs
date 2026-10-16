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
