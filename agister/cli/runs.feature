# cli's runs (docs/run-implementation.md, "Runs"; ADR-001, "Runs"): a
# command on runs turned into a request on the port. A spy answers the
# port in every test.

Feature: The command line exports a run

  Scenario Outline: A run is exported to the folder given
    When "agister runs export R1 --to <to>" runs in "/work"
    Then it asks the port to export the run "R1" to "<folder>"
    And it prints nothing and exits 0

    Examples:
      | to   | folder    |
      | /out | /out      |
      | out  | /work/out |

  Scenario: An export that fails is printed to stderr and exits 1
    Given the port's export fails: "no run \"R1\""
    When "agister runs export R1 --to /out" runs
    Then it prints the failure to stderr, nothing to stdout, and exits 1

  Scenario Outline: A bad runs command prints its usage and exits 2
    When "agister <args>" runs
    Then it prints its usage to stderr and exits 2, asking the port nothing

    Examples:
      | args                        |
      | runs                        |
      | runs export                 |
      | runs export R1              |
      | runs export --to /out       |
      | runs export R1 R2 --to /out |
      | runs show R1                |
