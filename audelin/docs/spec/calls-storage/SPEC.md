# Calls storage: the calls-folder claim

Observer: the three holders that work on the calls folder and must not
overlap: Recording (a recording), Recordings (a folder move) and Lifecycle
(an update relaunch), each through a port of its own that compose answers
with this claim. This spec covers the claim; the calls journal and its
transactions are described in the architecture.

## Decided

- **The claim excludes; it does not decide.** Whether a start, a move or a
  relaunch should happen, and what to do after a refusal, is the holder's.
  The claim keeps no queue, no retry and no waiting holders, and publishes
  nothing: a holder learns about the folder only from its own answer.
- **A take is answered at once,** granted with a new token or refused with
  the holder that has the folder. A holder that wants to wait does so in its
  own state.
- **A release names its token.** Releasing a token that is not the current
  one (already released, or never granted) changes nothing, so a late
  release cannot free another holder's claim.
- **The claim lives in this process only.** It is held in memory, written to
  no journal, and gone after a crash or quit. It does not keep a second
  Audelin, sharing the folder, out.
- **The claim does not depend on any holder.** Compose makes it with the
  storage and answers every holder's port from it, so a move and a relaunch
  take the folder as usual when Recording failed to start.

```gherkin
Feature: Keeping work on the calls folder apart

  Scenario: S-1 A free folder is granted
    Given no holder has the calls folder
    When a holder takes it
    Then it can work on the folder with its token

  Scenario: S-2 A held folder is refused with its holder
    Given a folder move has the calls folder
    When a recording takes it
    Then the recording can read that a move has the folder

  Scenario: S-3 Two takes at once grant one
    Given no holder has the calls folder
    When two holders take it at the same moment
    Then exactly one of them can work on the folder

  Scenario: S-4 A release frees the folder
    Given a holder has the calls folder
    When it releases its token
    Then the next holder that takes the folder can work on it

  Scenario: S-5 A stale release frees nothing
    Given a holder released its token and another holder took the folder
    When the first token is released again
    Then a third holder that takes the folder can read that the second has it

  Scenario: S-6 The claim works without Recording
    Given Recording failed to start
    When a folder move and then a relaunch take the calls folder
    Then the move can work on the folder and the relaunch can read that the move has it
```
