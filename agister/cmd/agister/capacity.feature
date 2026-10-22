# cmd/agister, capacity (docs/run-implementation.md, "Capacity"; ADR-004,
# rule 8): a turn at capacity reported, with spies in place of the
# wrappers (ADR-009, rule 4). Settings as progress.feature gives them.

Feature: The composition reports a turn at capacity

  Scenario: A retried turn is a progress line and an event
    Given claude-code fails at capacity, "Overloaded", then, retried,
      completes
    When "agister run --process ask --agent claude-opus --param q=why"
      runs in "/r"
    Then stderr has the line "· ask: at capacity; retrying in 30s"
    And runstore is given the event "capacity" of "ask", its reason
      "Overloaded", retrying
    And it prints the result completed

  Scenario: A fallback is reported and recorded
    Given codex's four turns fail at capacity, each reporting its session
    And its fallback claude-opus completes in a fresh session
    When the call runs
    Then the fallback receives the same work and inputs under the same hold
    And the result names claude-opus, its session and output
    And the record keeps both agents' plans and definitions, the primary's
      failure, and the four capacity events followed by the fallback event

  Scenario: A fallback at capacity never follows its own fallback
    Given codex's four turns and claude-opus's four turns fail at capacity
    And claude-opus names another fallback
    When the call runs
    Then it ends failed, class "capacity", after one fallback only

  Scenario Outline: Check refuses bad fallback settings
    Given an agent file whose fallback <fault>
    When "agister check" runs
    Then it exits 1, naming the agent file and the bad fallback

    Examples:
      | fault                                  |
      | names an absent agent                  |
      | names itself                           |
      | cannot run the process's output schema  |

  Scenario: A reuse takes reviews that fell back
    Given a run of a review whose reviews, at capacity on codex,
      completed on claude-opus, and whose judge failed
    When the review runs again, reusing that run
    Then the judge alone runs, and each review is taken, recorded on
      claude-opus with its plan, its primary and its result as kept

  Scenario: A continuation goes on from a call that fell back
    Given R1 ran on codex in the session "S", and R2, continuing R1, fell
      back from "S" to claude-opus, which left the content "t2"
    When R1 is continued on codex with the content "t2"
    Then the call resumes "S" and continues R2's call
