# cli (docs/settings-implementation.md, "The composition"; ADR-001): turns
# a command into a request on the port it declares, and prints what the
# port gives. A spy answers the port in every test (ADR-009).

Feature: The command line checks and inspects settings

  Scenario: check prints every fault, every warning and the count
    Given the port's check gives the process "p" at fault, with the problem
      "prompt is required" at "/h/processes/p.yaml", line 2, refusing the
      workflow "w" and the process "p"; one warning; and three names, one
      resolving
    When "agister check" runs
    Then it prints the process "p", its problem with its file and line,
      and the names it refuses; then the warning; then "1 resolves, 2
      refused"
    And it exits 1

  Scenario: check with nothing refused exits 0
    Given the port's check gives no fault, and two names, both resolving
    When "agister check" runs
    Then it prints "2 resolve, 0 refused" and exits 0

  Scenario Outline: inspect lists a kind, or shows one
    When "agister inspect <args>" runs
    Then it asks the port to <request>

    Examples:
      | args       | request               |
      | processes  | list the processes    |
      | workflows  | list the workflows    |
      | agents     | list the agents       |
      | process p  | show the process "p"  |
      | workflow w | show the workflow "w" |
      | agent a    | show the agent "a"    |

  Scenario Outline: The launch directory and home
    Given the environment's AGISTER_HOME is "<env>"
    When "agister check <flags>" runs in "/work"
    Then it asks the port with the launch directory "<launch>" and home
      "<home>"

    Examples:
      | env | flags              | launch | home       |
      |     |                    | /work  | ~/.agister |
      | /e  |                    | /work  | /e         |
      | /e  | --home /h --dir /d | /d     | /h         |

  Scenario Outline: A bad command prints its usage and exits 2
    When "agister <args>" runs
    Then it prints its usage to stderr and exits 2, asking the port nothing

    Examples:
      | args             |
      | inspect          |
      | inspect runtimes |
      | inspect process  |
      | check extra      |
      | frobnicate       |
