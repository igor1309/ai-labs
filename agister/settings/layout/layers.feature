# The behaviours of settings/layout, before its code: how it finds the
# layers (ADR-002, rule 2; ADR-001, settings). Layout is given home's
# folder and the launch directory, and asks its worktree-root port, a spy
# in every test (ADR-009), for the root of the git worktree holding the
# launch directory, or none. reading.feature is what it reads there.

Feature: Layout finds the layers from home's folder and the launch directory

  Background:
    Given home's folder "/home/.agister"

  Scenario: Outside a git worktree only home is read
    Given the launch directory "/tmp/work" is in no git worktree
    When layout reads
    Then the layers are home's folder alone

  Scenario: The repository layer is .agister at the worktree root
    Given the launch directory "/repo" is the root of a git worktree
    And "/repo/.agister" is a folder
    When layout reads
    Then the layers are home's folder and the repository's "/repo/.agister"
    And there is no project layer

  Scenario: A worktree root with no .agister has no repository layer
    Given the launch directory "/repo/p" is in the git worktree "/repo"
    And "/repo" holds no ".agister"
    When layout reads
    Then there is no repository layer
    And it has no problem

  Scenario: The project layer is the nearest .agister below the root
    Given the launch directory "/repo/p/q" is in the git worktree "/repo"
    And "/repo/.agister", "/repo/p/.agister" and "/repo/p/q/.agister" are
      folders
    When layout reads
    Then the project layer is "/repo/p/q/.agister"

  Scenario: The project layer is found upward from the launch directory
    Given the launch directory "/repo/p/q" is in the git worktree "/repo"
    And "/repo/p/.agister" is a folder, and "/repo/p/q" holds none
    When layout reads
    Then the project layer is "/repo/p/.agister"

  Scenario: The root's .agister is the repository layer, not the project's
    Given the launch directory "/repo/p" is in the git worktree "/repo"
    And "/repo/.agister" is a folder, and "/repo/p" holds none
    When layout reads
    Then the repository layer is "/repo/.agister"
    And there is no project layer

  Scenario: An .agister that is not a folder is no layer
    Given the launch directory "/repo/p" is in the git worktree "/repo"
    And "/repo/p/.agister" is a file
    When layout reads
    Then there is no project layer

  Scenario: A worktree root that cannot be found is a problem of no layer
    Given the worktree-root port fails for the launch directory "/repo/p"
    When layout reads
    Then the snapshot has a problem naming "/repo/p" and the port's error
    And the layers are home's folder alone

  Scenario: A directory that cannot be listed on the way up is a problem
    Given the launch directory "/repo/p" is in the git worktree "/repo"
    And "/repo/p" cannot be listed
    When layout reads
    Then the snapshot has a problem naming "/repo/p" and the list's error
    And there is no project layer
