# cli (docs/settings-implementation.md, "The composition"; ADR-001): turns
# a command into a request on the port it declares, and prints what the
# port gives. It is given its arguments, its working directory, the
# user's home directory and its output streams (ADR-009, rule 2); a spy
# answers the port in every test.

Feature: The command line checks settings

  Scenario: check prints every fault, every warning and the count
    Given the port's check gives the process "p" at fault, with the problem
      "prompt is missing" at "/h/processes/p.yaml", line 2, refusing the
      workflow "w" and the process "p"; one warning; and three names, one
      resolving
    When "agister check" runs
    Then it prints the process "p", its problem with its file and line,
      and the names it refuses; then the warning; then "1 resolves, 2
      refused"
    And it exits 1, all of it on stdout

  Scenario: check with a problem of no document and no name exits 1
    Given the port's check gives, of no document, "home cannot be read",
      and no name
    When "agister check" runs
    Then it prints the problem, refusing every request, then "0 resolve,
      0 refused"
    And it exits 1

  Scenario: check with no fault exits 0
    Given the port's check gives no fault, and two names, both resolving
    When "agister check" runs
    Then it prints "2 resolve, 0 refused" and exits 0

  Scenario Outline: The launch directory and home
    When "agister <command> <flags>" runs in "/work", the user's home
      directory "/u"
    Then it asks the port with the launch directory "<launch>" and home
      "/u/.agister"

    Examples:
      | command           | flags    | launch |
      | check             |          | /work  |
      | check             | --dir /d | /d     |
      | inspect processes | --dir /d | /d     |

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
