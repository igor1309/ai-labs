# The behaviours of settings/resolve, before its code: an agent's
# fallback (ADR-004, rule 8), the agent a call that ended at capacity is
# made again on, fresh, with the same process and inputs. See
# request.feature for what resolve is given and what it gives, and
# planning.feature for a plan. A fallback is followed as any name is; it
# is another agent, which resolves; and each step on an agent that falls
# back is planned on the fallback's runtime too. The fallback's own
# fallback is never taken.

Feature: Resolve checks and plans an agent's fallback

  Scenario: A step's agent's fallback is followed and planned
    Given the step "s" of "w" binds "p" to the agent "a" of "r", which
      falls back to the agent "b" of "rb"
    When resolve is asked for the workflow "w"
    Then it reaches "w", "p", "a", "r", "b" and "rb"
    And it gives the plan of "s" on "a", then on "b", each at "steps[0]"

  Scenario Outline: A fallback is another agent, which resolves
    Given the step "s" of "w" binds "p" to the agent "a" of "r", which
      falls back to <fallback>
    When resolve is asked for the workflow "w"
    Then it refuses: <refusals>

    Examples:
      | fallback                     | refusals                                                                                                 |
      | "a", itself                  | the agent "a", and the problem at its fallback: it names another agent                                   |
      | "gone", which no layer holds | the agent "a", at its fallback: it names an agent that resolves; and the agent "gone": no layer holds it |
      | "b", which a block refuses   | the agent "a", at its fallback: it names an agent that resolves; and the block of the agent "b"          |

  Scenario Outline: A fallback's runtime runs the step's process
    Given the step "s" of "w" binds "p" to the agent "a" of "r", which
      falls back to the agent "b" of "rb"
    And <need>, which the runtime "r" can do and "rb" cannot
    When resolve is asked for the workflow "w"
    Then it refuses: the workflow "w", and the problem at the fallback of
      "a": the step "s" falls back to it: its runtime "rb" <can>, as <who>
      needs

    Examples:
      | need                                 | can                                | who             |
      | the process "p" has a schema         | checks output against a schema     | its process "p" |
      | the process "p" has an instruction   | takes an instruction               | its process "p" |
      | the process "p" has guidance         | takes guidance                     | its process "p" |
      | the process "p" has staleness limits | reports lines for staleness limits | its process "p" |
      | the process "p" recovers             | resumes a session                  | its process "p" |
      | the process "p" names a skill        | takes skills                       | its process "p" |

  Scenario: A fallback resumes no session
    Given the step "s" of "w" continues an earlier step's session, on the
      agent "a" of "r", which falls back to the agent "b" of "rb", which
      cannot resume a session
    When resolve is asked for the workflow "w"
    Then it resolves

  Scenario: A required permission the fallback's runtime does not grant
    Given the process "p" requires "net", which "r" grants and "rb" does
      not, and "a" falls back to "b" of "rb"
    When resolve is asked for the workflow "w"
    Then it refuses: the workflow "w", and the problem at the fallback of
      "a": the step "s" falls back to it: its runtime "rb" grants the
      permission "net", as its process "p" requires

  Scenario: A fallback's extra is a warning at the step's place
    Given "a" falls back to "b" of "rb", which grants "net" beyond what
      the process "p" allows
    When resolve is asked for the workflow "w"
    Then it warns at "steps[0]": its plan on its fallback "b" grants "net"
      beyond what its process "p" allows

  Scenario: A fallback's own fallback is never planned
    Given "a" falls back to "b", which falls back to "c"
    When resolve is asked for the workflow "w"
    Then it reaches "c", and gives the plans of "s" on "a" and "b" alone
