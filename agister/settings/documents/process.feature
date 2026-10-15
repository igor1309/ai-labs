# settings/documents (docs/settings-implementation.md, steps 2 to 5;
# ADR-002, rules 1, 3 and 4) is pure (ADR-001): given a snapshot, each
# document's sources by kind and name, one slot per layer, and the
# problems of its files, it gives one document: a definition, or its
# problems.
  # The process (ADR-012, terms): what a step does. Its permissions
  # (ADR-003, rule 2), workspace and limits (ADR-004, rules 2, 3 and 7),
  # recovery (ADR-006, rule 3) and inputs (ADR-010, rule 1). A reference
  # is {from: <what it reads>}; a process reads its params and inputs.

Feature: Documents gives a process

  Scenario: A process's fields
    Given the process "a" has a home source:
      """
      schema: agister.process/v1alpha1
      prompt: review
      instruction: Review the change.
      guidance: [go-architecture]
      skills: [skill:go]
      params:
        base: {default: origin/trunk}
        goal: {}
      inputs:
        base: {source: git.revision, rev: {from: params.base}, remote: origin}
        goal: {source: file, path: {from: params.goal}, form: [goal]}
      environment:
        MODE: strict
        BASE: {from: inputs.base}
      permissions: {require: [repository.read], allow: [repository.read, network]}
      workspace: {access: read-only, revision: {from: inputs.base}, clean: true}
      limits:
        time: 20m
        cost: 2.5
        stale: {repeated_tool_calls: 5, tool_command: 8m, no_event: 10m}
      recovery: {resumes: 1, instruction: Go on.}
      output: {schema: review-result}
      """
    When documents is asked for the process "a"
    Then it gives the process "a" with each of those fields, a name the
      name alone, and a reference what it reads
    And each field's origin is "/home/.agister/processes/a.yaml"
    And it has no problem

  Scenario: A process needs only its schema
    Given the process "a" has a home source of its schema alone
    When documents is asked for the process "a"
    Then it gives the process "a" with no field

  Scenario Outline: A process's fields each hold what they name
    Given the process "a" has a home source of a valid process but for
      <fault>
    When documents is asked for the process "a"
    Then there is no definition
    And it has a problem at "<field>": <message>

    Examples:
      | fault                               | field                            | message                                  |
      | the prompt "agent:x"                | prompt                           | it names a prompt                        |
      | the input "x: {path: a}"            | inputs.x.source                  | it is missing                            |
      | the form [brief:goal, agent:x]      | inputs.goal.form[1]              | it names a brief                         |
      | the rev {from: steps.x.outputs.y}   | inputs.base.rev                  | it reads params.<name> or inputs.<name>  |
      | the variable "MODE: [a]"            | environment.MODE                 | it is a string, or a reference           |
      | the access "write"                  | workspace.access                 | it is "read-only" or "read-write"        |
      | the revision {from: params.base}    | workspace.revision               | it reads inputs.<name>                   |
      | the time "soon"                     | limits.time                      | it is a duration, as "5m"                |
      | the time "0s"                       | limits.time                      | it is more than zero                     |
      | the cost 0                          | limits.cost                      | it is more than zero                     |
      | 0 repeated tool calls               | limits.stale.repeated_tool_calls | it is at least 1                         |
      | a recovery of 0 resumes             | recovery.resumes                 | it is at least 1                         |
      | a recovery with no instruction      | recovery.instruction             | it is missing                            |
      | an output with no schema            | output.schema                    | it is missing                            |
