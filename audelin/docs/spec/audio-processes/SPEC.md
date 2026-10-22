# Audio processes

Observer: the client that asks, through an interface it owns, which
processes have audio open now. The answer is an adapter over Core Audio's
process list.

## Decided

- The answer is every process Core Audio knows, playing or not: a call
  app's helper is often silent when asked and plays a moment later (Amanu
  `AudioProcesses.swift:58`).
- Each process comes with its bundle id, its name, and Core Audio's own
  flags for whether it is playing and recording now (Amanu
  `AudioProcesses.swift:46-47`). Without a bundle id, the name is its
  executable's: a command-line tool has no other.
- Audelin's own process is marked, not dropped: dropping it would be a
  choice, and choosing belongs to a Core (ARCHITECTURE.md rule 2).
- Each ask reads the list afresh and the adapter keeps nothing: when to ask
  is the client's.

```gherkin
Feature: Processes with audio open

  Scenario: S-1 A process with audio open is listed
    Given a process has audio open
    When I ask which processes have audio open
    Then I can find it with its bundle id and name

  Scenario: S-2 A playing process is shown as playing
    Given a process is playing audio
    When I ask which processes have audio open
    Then I can tell it is playing

  Scenario: S-3 A recording process is shown as recording
    Given a process is recording audio
    When I ask which processes have audio open
    Then I can tell it is recording

  Scenario: S-4 A process with no bundle id is listed by name
    Given a process without a bundle id has audio open
    When I ask which processes have audio open
    Then I can find it by its executable's name

  Scenario: S-5 Audelin is marked as itself
    Given Audelin has audio open
    When I ask which processes have audio open
    Then I can tell which one is Audelin

  Scenario: S-6 A process that quit is gone
    Given a process that had audio open has quit
    When I ask which processes have audio open
    Then I cannot find it

  Scenario: S-7 A list the system refuses fails
    Given the system will not give the process list
    When I ask which processes have audio open
    Then I can tell the ask failed

  Scenario: S-8 A silent process is listed
    Given a process has audio open and plays nothing
    When I ask which processes have audio open
    Then I can find it, shown as not playing
```

Not audio processes': choosing which to hear (call app processes), and
deciding a call is on (call watch), which the root wires to the same
answer.
