# The behaviours of settings/layout, before its code: what it cannot read or list.
# See reading.feature for what layout is given and what it gives.

Feature: What layout cannot read or list is a problem of its document or layer

  # Problems

  Scenario: A file that cannot be read is a problem of its document
    Given the home folder "/home/.agister" holds "processes/a.yaml" and
      "processes/b.yaml"
    And "processes/a.yaml" cannot be read
    When layout reads
    Then the snapshot holds process "a"
    And process "a" has a problem naming "/home/.agister/processes/a.yaml"
      and the read's error
    And process "a" has no bytes from that file
    And process "b" has a home source with its bytes

  Scenario: A nearer layer's file that cannot be read is no fall back
    Given the home folder "/home/.agister" holds "processes/review.yaml"
    And the repository folder "/repo/.agister" holds
      "processes/review.yaml", which cannot be read
    When layout reads
    Then process "review" has a home source with its bytes
    And process "review" has a problem naming
      "/repo/.agister/processes/review.yaml" and the read's error

  Scenario: A layer folder that cannot be listed is a problem of its layer
    Given the home folder "/home/.agister" holds "processes/a.yaml"
    And the repository folder "/repo/.agister" cannot be listed
    When layout reads
    Then the repository layer has a problem naming "/repo/.agister" and
      the error
    And process "a" has a home source

  Scenario: A kind's folder that cannot be listed is a problem of its layer
    Given the home folder "/home/.agister"
    And its folder "processes" cannot be listed
    And it holds "prompts/review.md"
    When layout reads
    Then the home layer has a problem naming "/home/.agister/processes"
      and the error
    And prompt "review" has a home source

  Scenario: A kind's folder a layer does not have is no problem
    Given the home folder "/home/.agister" holds "prompts/review.md"
    And it has no other kind's folder
    When layout reads
    Then prompt "review" has a home source
    And the snapshot has no problem

  Scenario: A layer folder given that does not exist is a problem
    Given the project folder "/repo/p/.agister", which does not exist
    When layout reads
    Then the project layer has a problem: its folder does not exist
