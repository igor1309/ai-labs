# The behaviours of settings/check, before its code: check (ADR-002,
# rule 8). Check is given three ports, spies in every test (ADR-009): its
# names, each document a layer holds, by kind and name, with the layers
# that hold it; its resolve, a document by kind and name, a workflow as a
# caller giving every param it declares, to what resolves, with its
# warnings, or a refusal: every document at fault, with its problems, or
# the block that refuses it, and the chain that reached it, and the
# problems of no document; and its fields. A source
# is a file, a line and its layer. Check gives data, and gates nothing.

Feature: Check resolves every document and reports every problem once

  Scenario: Every name is asked for alone, kind by kind, by name
    Given the layers hold the agent "b", the process "q", the process "p"
      and the workflow "w"
    When check runs
    Then it asked resolve for the workflow "w", the process "p", the
      process "q" and the agent "b", in that order

  Scenario: A document nothing uses is checked
    Given the layers hold the workflow "w" and the process "unused"
    And resolve refuses the process "unused": the process "unused", with
      the problem "prompt is missing"
    When check runs
    Then it reports the process "unused", with the problem "prompt is
      missing", refusing the process "unused"

  Scenario: A fault met by many names is reported once, with each
    Given the layers hold the workflows "w1" and "w2", and the agent "a"
    And resolve refuses each of them: the agent "a", with the problem
      "runtime is missing"
    When check runs
    Then it reports the agent "a" once, with the problem "runtime is
      missing", refusing the workflow "w1", the workflow "w2" and the
      agent "a"

  Scenario: A blocked document is reported with its block
    Given the layers hold the workflow "w" and the process "p"
    And resolve refuses each of them: the process "p", blocked by the
      blocks' file, on line 3: "it writes to main"
    When check runs
    Then it reports the process "p", blocked on line 3: "it writes to
      main", refusing the workflow "w" and the process "p"

  Scenario: The problems of no document come first, refusing every request
    Given the layers hold the workflow "w" and the process "p"
    And resolve refuses each of them: the process "p", with the problem
      "prompt is missing"; and, of no document, "the project's layer
      cannot be read"
    When check runs
    Then it reports first, of no document, "the project's layer cannot be
      read", refusing every request
    And then the process "p", with the problem "prompt is missing"

  Scenario: Faults are in the order first met
    Given the layers hold the workflow "w" and the process "p"
    And resolve refuses the workflow "w": the agent "a", then the process
      "p"
    And resolve refuses the process "p": the process "p"
    When check runs
    Then it reports the agent "a", then the process "p"

  Scenario: A warning is reported once, with every name it came with
    Given the layers hold the workflows "w1" and "w2"
    And each resolves with the warning, at "steps[0]" of the workflow
      "w", "the runtime grants beyond the allowed: net"
    When check runs
    Then it reports the warning once, with the workflow "w1" and the
      workflow "w2"

  Scenario: Every name is listed, resolving or refused
    Given the layers hold the workflow "w" and the process "p"
    And resolve refuses the workflow "w", and resolves the process "p"
    When check runs
    Then it lists the workflow "w", refused, and the process "p",
      resolving

  Scenario: Settings with no fault report none
    Given the layers hold the workflow "w"
    And resolve resolves the workflow "w"
    When check runs
    Then it reports no fault and no warning, and lists the workflow "w",
      resolving
