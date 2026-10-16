# cmd/agister, the adapters (docs/settings-implementation.md, "The
# composition"; ADR-009, rule 4): each over spies on the ports it joins.

Feature: The adapters map one part's words to another's

  Scenario Outline: A reference is given to resolve as what it reads
    Given documents types a binding that reads <reads>
    When the source gives resolve the binding
    Then it reads <read>

    Examples:
      | reads                                                                 | read                                                                |
      | the param "base"                                                      | the root param, the name "base"                                     |
      | the input "base"                                                      | the root input, the name "base"                                     |
      | the state "review"                                                    | the root state, the name "review"                                   |
      | the outputs of the item "a"                                           | the root outputs, the name "a"                                      |
      | the field "v" of the outputs of the item "a"                          | the root outputs, the name "a", the field "v"                       |
      | the field "head" of the field "stdout" of the outputs of the item "a" | the root outputs, the name "a", the field "stdout"                  |
      | the session of the item "a"                                           | the root session, the name "a"                                      |
      | the field "x" of the state "review"                                   | the root state, the name "review", the field "x"                    |
      | the item                                                              | the root item                                                       |
      | the field "fixed" of the item                                         | the root item, the field "fixed"                                    |

  Scenario: A value's origin carries its place
    Given documents types the workflow "w", whose first step names the
      agent "a" on line 4 of "/r/.agister/workflows/w.yaml"
    When the source gives resolve the workflow "w"
    Then the agent's name has the origin "/r/.agister/workflows/w.yaml",
      line 4, "steps[0].agent"

  Scenario: Check's resolve gives a workflow every param it declares
    Given the workflow "w" declares the params "base", with no default,
      and "goal"
    When check asks its resolve for the workflow "w"
    Then resolve is asked for the workflow "w", giving "base" and "goal"

  Scenario: A field's layer comes from its file
    Given home's folder "/u/.agister" and the repository's "/r/.agister"
    And documents' tree gives "instruction" from
      "/r/.agister/processes/p.yaml", line 2
    When check asks its fields of the process "p"
    Then it gives "instruction" from that file, line 2, in the repository

  Scenario: One command reads the settings once
    When "agister check" runs over a filesystem spy
    Then layout read each file once

  Scenario: The problems of no document are layout's and the blocks file's
    Given layout's snapshot has a problem of no document, and the blocks
      file one of its own
    When the source gives resolve the problems of no document
    Then it gives both, each at its file

  Scenario Outline: The facts by contract
    When resolve asks the facts of "<contract>"
    Then it gives <facts>

    Examples:
      | contract      | facts                           |
      | claude-code/3 | the claude-code wrapper's facts |
      | bash/1        | the bash wrapper's facts        |
      | other/9       | none: no wrapper takes it       |

  Scenario: Check's names come from the snapshot, with their layers
    Given the snapshot holds the process "p" in home and the repository
    When check asks its names
    Then it gives the process "p", in home and the repository

  Scenario: A problem's and a link's layer come from their file
    Given resolve refuses with a problem at "/r/.agister/agents/a.toml",
      reached through a link at "/u/.agister/workflows/w.yaml"
    When check asks its resolve
    Then the problem is in the repository, and the link in home

  Scenario: Layout's filesystem comes from files
    Given files gives the folder "/u/.agister" the entries "agents", a
      folder, and "x", neither
    When layout asks the entries of "/u/.agister"
    Then it gives "agents", a folder, and "x", other

  Scenario Outline: Layout's worktree root comes from git
    Given git gives <git>
    When layout asks the root of "/r/a"
    Then it gives <layout>

    Examples:
      | git           | layout             |
      | the root "/r" | "/r"               |
      | none          | ""                 |
      | an error      | the error, wrapped |

  Scenario: A folder files does not find is one layout does not find
    Given files gives an error that is fs.ErrNotExist for "/r/.agister"
    When layout asks the entries of "/r/.agister"
    Then it gives an error that is, or wraps, fs.ErrNotExist
