# The behaviours of settings/resolve, before its code: planning each step
# and the facts of its runtime (ADR-003; ADR-012, rules 3 and 4). See
# request.feature for what resolve is given and what it gives. Resolve
# asks the runtime wrappers' facts through a port, by the contract of a
# runtime mapping. What a process requires it allows. A plan grants what
# its runtime grants with no option, and the options it takes.

Feature: Resolve plans every step on its runtime

  Scenario Outline: A step is planned from its permissions and its mapping
    Given the process "p" requires <required> and allows <allowed>
    And the runtime "r" grants <base> with no option, and offers <offers>
    When resolve is asked for the step of "p" on the agent "a" of "r"
    Then its plan takes the options <options>, and records the granted
      <granted>, the extra <extra> and the withheld <withheld>

    Examples:
      | required | allowed | base      | offers                                           | options | granted     | extra | withheld |
      | read     | read    | read, net | no options                                       | none    | read, net   | net   | none     |
      | read     | read    | nothing   | any of "all" (read, write, net) or "look" (read) | look    | read        | none  | none     |
      | read     | read    | nothing   | any of "see" (read, host) or "look" (read, host) | see     | read, host  | host  | none     |
      | read     | write   | nothing   | any of "look" (read) or "edit" (write)           | look    | read        | none  | write    |
      | read     | write   | nothing   | one of "ro" (read) or "rw" (read, write)         | ro      | read        | none  | write    |
      | write    | write   | nothing   | one of "ro" (read) or "rw" (read, write)         | rw      | read, write | read  | none     |

  Scenario Outline: A required permission no plan gives refuses the step
    Given the process "p" requires "write" and "net"
    And the runtime "r" offers <offers>
    And the step "s" of "w" binds "p" to the agent "a" of "r"
    When resolve is asked for the workflow "w"
    Then it refuses: the workflow "w", and the problem at "steps[0]": its
      runtime "r" grants the permission "net", as its process "p" requires

    Examples:
      | offers                                 |
      | any of "edit" (write)                  |
      | one of "edit" (write) or "fetch" (net) |

  Scenario: Every step is planned, in branches a run may not take too
    Given the workflow "w" has a parallel, a branch and a repeat, each of
      a step, and the branch's default names the workflow "c" of one step
    When resolve is asked for the workflow "w"
    Then it gives a plan for each step, by its workflow and place, in the
      order reached

  Scenario Outline: A step needs what its runtime can do
    Given the step "s" of "w" binds the process "p" to the agent "a" of "r"
    And <need>
    And the facts of the runtime "r" say it <cannot>
    When resolve is asked for the workflow "w"
    Then it refuses: the workflow "w", and the problem at "steps[0]": its
      runtime "r" <can>, as <who> needs

    Examples:
      | need                                        | cannot                       | can                            | who             |
      | "p" names the output schema "sc"            | checks no output against one | checks output against a schema | its process "p" |
      | "p" recovers a stale turn                   | resumes no session           | resumes a session              | its process "p" |
      | "s" continues the session of a step         | resumes no session           | resumes a session              | it              |
      | "p" names the skill "k"                     | takes no skills              | takes skills                   | its process "p" |
      | "p" limits the same tool call made in a row | reports no tool calls        | reports tool calls             | its process "p" |
      | "p" limits how long a tool command runs     | reports no tool commands     | reports tool commands          | its process "p" |

  Scenario Outline: An agent gives what its runtime takes
    Given the agent "a" of the runtime "r" gives <gives>
    And <runtime>
    When resolve is asked for the agent "a"
    Then it refuses: the agent "a", and the problem at "<place>": its
      runtime "r" <takes>

    Examples:
      | gives                | runtime                                | place  | takes                      |
      | the model "m"        | the facts of "r" say it takes no model | model  | takes a model              |
      | the effort "highest" | "r" lists the efforts "low" and "high" | effort | takes the effort "highest" |

  Scenario: A runtime is of a contract a wrapper takes
    Given the runtime "r" is of the contract "nobody/1", which no wrapper
      has facts for
    When resolve is asked for the runtime "r"
    Then it refuses: the runtime "r", and the problem at "contract": a
      runtime wrapper takes the contract "nobody/1"

  Scenario: A step requested alone its runtime cannot do refuses the request
    Given the process "p" names the output schema "sc"
    And the facts of the runtime "r" say it checks no output against one
    When resolve is asked for the step of "p" on the agent "a" of "r"
    Then it refuses, of no document and no chain, with the problem at
      "steps[0]": its runtime "r" checks output against a schema, as its
      process "p" needs
