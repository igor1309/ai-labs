# Recordings — quitting

Observer: Lifecycle, through compose, which tells Recordings that Audelin
quits and passes on when Recordings has settled. Quitting is part of
Recordings, specified here so each spec stays within 100 lines; moves are
in `../recordings/SPEC.md` and merging in `../recordings-merge/SPEC.md`.

## Decided

- **Recordings settles once nothing it started still touches the calls:**
  no calls-folder claim asked, held or being released, and no merge running.
  An idle Recordings settles as soon as it is told to stop.
- **A claim granted after the quit is released at once;** no call moves.
- **A move under way finishes,** moved or failed, and releases the claim;
  no new action starts while quitting.
- **A running merge finishes** before Recordings settles.

```gherkin
Feature: Recordings settles on quit

  Scenario: S-1 An idle Recordings settles at once
    Given no move or merge is under way
    When Audelin quits
    Then Lifecycle can read that Recordings has settled

  Scenario: S-2 A quit during the take releases a late grant
    Given a confirmed move is taking the calls folder
    When Audelin quits and then the claim is granted
    Then no call moves, and once the folder is free Lifecycle can read that Recordings has settled

  Scenario: S-3 A quit during a move waits for its release
    Given a move under way
    When Audelin quits
    Then Lifecycle can read that Recordings has settled only after the move let the folder go

  Scenario: S-4 A quit during a merge waits for the merge
    Given a merge under way
    When Audelin quits
    Then Lifecycle can read that Recordings has settled only after the merge ends
```
