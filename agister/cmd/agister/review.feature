# cmd/agister, home's code_review (docs/run-implementation.md, "Parallel
# steps and a join"; ADR-011, rule 2): a parallel of steps, then a join,
# with spies in place of the wrappers (ADR-009, rule 4). Settings: home's
# as shipped; git gives "/r" HEAD "c1", clean, names "origin/trunk" and
# "c0" the commit "c0", "HEAD" and "c1" the commit "c1", and gives "a.go"
# changed from "c0" to "c1"; the file "/r/g.md" holds a goal.

Feature: The composition runs home's code_review

  Scenario: Five reviews side by side, then the judge
    Given codex completes each review with a review result naming its
      process, each turn ending only once all five have started
    And claude-code completes the judge with a judgement
    When "agister run code_review --param goal=g.md" runs in "/r"
    Then codex runs the turns of architecture_review, tests_review,
      adversarial_review, clarity_review and intent_review, each in
      "/r" held shared
    And claude-code then runs the judge's turn, its input "reviews" the
      five results in declaration order, each completed
    And it prints the result, completed, its output "judgement" the
      judge's

  Scenario: A review that fails still reaches the judge
    Given codex fails the tests review, class "rate_limited", and
      completes the other four
    When "agister run code_review --param goal=g.md" runs in "/r"
    Then the judge's input "reviews" holds the tests review failed,
      class "rate_limited", its output null, in its place
    And it prints the result as the judge's call ended

  Scenario: Progress lines of reviews side by side are each whole
    Given the five reviews each report the tool call "Bash" with "ls"
    When "agister run code_review --param goal=g.md" runs in "/r"
    Then stderr holds, for each review, its start, its tool call and its
      end, each a line of its own
