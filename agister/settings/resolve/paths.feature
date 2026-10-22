# settings/resolve, a path read from a param (docs/settings-implementation.md,
# "6. Resolve"; ADR-011, rule 3): a process that reads a file at a param's
# value is given a path, not a file's text.

Feature: Resolve checks that a path is given where a file is read

  Background:
    Given the process "p" declares the param "brief", and its input
      "brief" reads a file at "params.brief"
    And the workflow "f" declares the param "brief" and the input
      "text", which reads a file at "params.brief"

  Scenario Outline: A file's text is not given where a path is read
    Given the step "build" of "p" gives "brief" from "<reads>"
    When resolve is asked for the workflow "f"
    Then <outcome>

    Examples:
      | reads        | outcome                                                                                                                                                   |
      | params.brief | it resolves                                                                                                                                               |
      | inputs.text  | it refuses: the workflow "f", and the problem at "steps[0].inputs.brief": it gives a file's text where the process "p" reads a path, at its input "brief" |
