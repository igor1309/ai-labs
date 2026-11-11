# Save pacing

Observer: transcript writing, which hands it each text call text publishes
and waits on it when call text stops (`../transcript-writing/SPEC.md`), so
the transcript is saved often enough to keep the call and seldom enough
not to cost it (user S-7 and S-17 in `../SPEC.md`). A pipeline operator
the root chains (`../../../ARCHITECTURE.md`, Transcript pipeline): generic
over what it saves, it never looks inside a value. It owns the interfaces
it saves through and tells failures through.

## Decided

- **Split from transcript writing** (LAB-1146): pacing changes with the
  disk and the save interval, passing call text through with Session's
  lifecycle; together their spec passed 100 lines. Transcript writing's
  S-2, S-7, S-8, S-13 and S-14 are S-1 to S-5 here.
- **The save in flight finishes, then only the latest value waiting is
  saved,** never an older one after a newer, since each save holds the
  whole value. Readers that need every value read them before it.
- **Each save is followed by a pause the root chooses,** so values are
  saved at most that often: real recognition changes a call's text about
  17–18 times a minute, and the fake recogniser about 220. The app
  pauses 5 seconds (owner, 2026-10-31, from
  `../../research/transcript-save-interval.md`). What a crash keeps is the
  save's to promise (`../transcript-file/SPEC.md`), not pacing's.
- **Finishing ends the pause,** so the last value is saved at once, and
  returns once it is saved or its save failed.
- **A failed save is told once, until a save succeeds,** and ends
  nothing: the next value is saved. A disk that keeps failing is named
  once, not on every value.

```gherkin
Feature: Saving the latest value, paced

  Scenario: S-1 Only the latest value is saved after a slow save
    Given a save I hold
    When two values come, then the save returns
    Then I can read back the latest, never the one between

  Scenario: S-2 A failed save is told
    When the save of a value fails
    Then I am told it failed

  Scenario: S-7 A save failing again is not told again
    Given a save that failed and was told
    When the next save fails too
    Then I am told nothing more

  Scenario: S-3 A save after a failed one keeps the newer value
    Given a value whose save failed
    When a new value comes
    Then I can read back the new value

  Scenario: S-4 Saves are spaced by a pause
    Given a value just saved
    When two values come during the pause after it
    Then I can read back the earlier value until the pause ends, and then only the latest

  Scenario: S-5 Finishing ends the pause
    Given a value waiting in the pause after a save
    When I finish
    Then I can read back that value as soon as my finish returns, without waiting for the pause

  Scenario: S-6 Finishing after a failed last save
    Given a value whose save will fail
    When I finish
    Then I have been told it failed by the time my finish returns

  Scenario: S-8 A failure after a success is told again
    Given a save that failed, then one that succeeded
    When a save fails
    Then I am told it failed

  Scenario: S-9 A failed save is followed by a pause too
    Given a save that just failed
    When two values come during the pause after it
    Then I can read back neither until the pause ends, and then only the latest
```
