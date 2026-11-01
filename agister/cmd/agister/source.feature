# cmd/agister, the source adapter (docs/settings-implementation.md, "The
# composition"; ADR-009, rule 4): resolve's source answered from
# documents, over a documents spy. Its references are adapters.feature's.

Feature: The source gives resolve each document in resolve's types

  Scenario Outline: The source gives resolve what decides a refusal
    Given documents types <given>
    When the source gives resolve <what>
    Then it gives <gives>

    Examples:
      | given                                                                  | what                                | gives                                                               |
      | the agent "a", model "opus", effort "high", runtime "r", fallback "b"  | the agent "a"                       | its model, effort, runtime and fallback, each with its origin       |
      | the runtime "r", contract "c/1", select one, options x and y           | the runtime "r"                     | its contract, its grants, select one, and x and y with their grants |
      | the process "p", require read, allow write, recovery, stale tool calls | the process "p"                     | its require, its allow, recovery, and stale tool calls              |
      | the process "p", its worktree at "inputs.base"                         | the process "p"                     | its revision, reading the input "base"                              |
      | the blocks file's block of the process "p", on line 2                  | the blocks                          | the process "p", its reason, at the file's line 2                   |
      | the workflow "w", params "base", no default, and "goal", "x"           | the workflow "w"                    | the params "base", with no default, and "goal", with one            |
      | the workflow "w", a step "s" continuing the session of "a"             | the workflow "w"                    | the item "s", its session reading the session of "a"                |
      | the workflow "w", a workflow item, a parallel and a branch             | the workflow "w"                    | each item, of its kind, with its items                              |
      | the workflow "w", a parallel "p" with max 1                            | the workflow "w"                    | the item "p", its items and max 1                                   |
      | the workflow "w", a repeat "r" with max 3                              | the workflow "w"                    | the item "r", its state, steps, next, until and max 3               |
      | the workflow "w", the output "o" reading "steps.s.outputs"             | the workflow "w"                    | the output "o", reading the outputs of "s"                          |
      | the process "p", prompt "pr", guidance "g", schema "sc"                | the process "p"                     | the names "pr", "g" and "sc", each with its origin                  |
      | the prompt "pr", with a problem                                        | the other document, prompt "pr"     | its problem                                                         |
      | no layer holding the agent "z"                                         | whether a layer holds the agent "z" | that none does                                                      |

  Scenario: A condition gives every reference it reads, however nested
    Given documents types the workflow "w", an arm's condition: not and of
      equals "params.a" and all in "state.f" where present "item.x"
    When the source gives resolve the workflow "w"
    Then the arm's condition reads "params.a", "state.f" and "item.x"
