# cli's run (docs/run-implementation.md, "The first run"; ADR-013): a
# command turned into a request on the port, the result printed as JSON.
# A spy answers the port in every test.

Feature: The command line runs a request

  Scenario Outline: A request names a workflow or a step, with its params
    When "agister <args>" runs in "/work"
    Then it asks the port to run <request> with the params <params>, at
      the launch directory "<launch>"

    Examples:
      | args                               | request                    | params     | launch |
      | run w                              | the workflow "w"           | none       | /work  |
      | run w --param a=1 --param b=x=y    | the workflow "w"           | a=1, b=x=y | /work  |
      | run --process p --agent a --dir /d | the process "p", agent "a" | none       | /d     |

  Scenario Outline: The result is printed as JSON, and the exit code says
    whether the run completed
    Given the port's run ends <status>, class "<class>"
    When "agister run w" runs
    Then it prints the result as JSON on stdout: status, class, output,
      timing, cost, usage, reason and warnings
    And it exits <code>
    And an unknown cost, each unknown count of usage, and no reason are
      printed as null

    Examples:
      | status      | class   | code |
      | completed   |         | 0    |
      | failed      | killed  | 1    |
      | interrupted | timeout | 1    |

  Scenario: A refusal is printed to stderr and exits 1
    Given the port refuses the run: "the process \"p\" is blocked"
    When "agister run w" runs
    Then it prints the refusal to stderr, nothing to stdout, and exits 1

  Scenario Outline: A bad run command prints its usage and exits 2
    When "agister <args>" runs
    Then it prints its usage to stderr and exits 2, asking the port nothing

    Examples:
      | args              |
      | run               |
      | run w --process p |
      | run --process p   |
      | run w --param a   |
      | run w x           |
