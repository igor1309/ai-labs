# The behaviours of settings/resolve, before its code: the repository's
# blocks (ADR-002, rule 7; ADR-013, rule 2). See request.feature for what
# resolve is given and what it gives. The source gives the blocks, each a
# document by kind and name, with its reason and origin, and whether a
# layer holds a document. A block is not a problem.

Feature: Resolve refuses what depends on a blocked document

  Scenario: A request that reaches a blocked document is refused, naming the block
    Given the workflow "w" has the step "s", the process "p" on the agent "a"
    And the process "p" names the prompt "pr"
    And line 1 of the repository's blocks blocks the process "p", for
      "it writes to main"
    When resolve is asked for the workflow "w"
    Then it refuses: the process "p", reached by the workflow "w" at
      "steps[0].process", blocked by the blocks' file, on line 1: it
      writes to main
    And it did not ask for the process "p", nor reach the prompt "pr"

  Scenario Outline: A block on any document the request reaches refuses it
    Given the workflow "w" has the step "s", the process "p" on the agent "a"
    And the process "p" names the prompt "pr", and the agent "a" the
      runtime "r"
    And the repository's blocks block the <kind> "<name>"
    When resolve is asked for <request>
    Then it refuses: the <kind> "<name>", blocked

    Examples:
      | request                                      | kind     | name |
      | the workflow "w"                             | workflow | w    |
      | the step of the process "p" on the agent "a" | process  | p    |
      | the step of the process "p" on the agent "a" | agent    | a    |
      | the step of the process "p" on the agent "a" | runtime  | r    |
      | the step of the process "p" on the agent "a" | prompt   | pr   |
      | the agent "a"                                | agent    | a    |

  Scenario: A block on a document the request does not reach refuses nothing
    Given the workflow "w" has the step "s", the process "p" on the agent "a"
    And the repository's blocks block the process "other", which a layer
      holds
    When resolve is asked for the workflow "w"
    Then it resolves, with no warning

  Scenario: A block naming no document is a warning
    Given the workflow "w" has the step "s", the process "p" on the agent "a"
    And line 2 of the repository's blocks blocks the agent "gone", which
      no layer holds
    When resolve is asked for the workflow "w"
    Then it resolves, with the warning of the blocks' file, on line 2: it
      blocks the agent "gone", which no layer holds

  Scenario: A refusal gives no warning
    Given the step "s" of "w" has a plan granting "net" beyond what its
      process allows
    And line 2 of the repository's blocks blocks the agent "gone", which
      no layer holds
    And the workflow "w" reads a param it does not declare, a problem
      resolve finds, so the step is still planned
    When resolve is asked for the workflow "w"
    Then it refuses, giving no plan and no warning
