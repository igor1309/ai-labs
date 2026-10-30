# Host choice

Observer: the root, which hands host choice each of the host picker's
answers and maps its answer to client find's events. It says which host
the payer is offered, held steady while the signal swings.

A pure type: the picker's answer in, a host, "hold closer" or "none" out.
It never sees a signal level, only the leader, its band and the time. It
reads its hold from the settings; scenarios use the default.

## Decided

- **A host is chosen** when it leads above the floor. With none chosen
  the answer is "hold closer" while a host is heard, "none" when none is.
- **The chosen host is kept** while it leads above the floor or between
  the lines, and while it leads below the drop line for less than the
  hold (1 s) since it went there. On device a typical loss lasts 100 ms
  and one line flipped the answer 88 times in 32 s (`NOTES.md`).
- **It ends at once** when it is not the leader: a rival near it or
  stronger, its fade or a new window. A hold never keeps a host the payer
  may not mean, or one no longer heard.
- **An ended choice is followed by the same answer read afresh,** so
  another host leading above the floor is chosen at once.
- **A hold of 0 drops a host on the drop line,** and with the picker's
  drop gap of 0 gives the single line of before.

```gherkin
Feature: Holding the choice of host

  Scenario: S-1 A host leads above the floor
    Given no host is chosen
    When a host leads above the floor
    Then I can read that host

  Scenario: S-2 A host leads between the lines
    Given no host is chosen
    When a host leads between the lines
    Then I can read "hold closer"

  Scenario: S-3 Hosts heard with no leader
    Given no host is chosen
    When hosts are heard with no leader
    Then I can read "hold closer"

  Scenario: S-4 No host heard
    Given no host is chosen
    When no host is heard
    Then I can read "none"

  Scenario: S-5 The chosen host between the lines
    Given a host is chosen
    When it leads between the lines
    Then I can read that host still

  Scenario: S-6 The chosen host briefly below the drop line
    Given a host is chosen
    When it leads below the drop line for less than the hold, then between the lines
    Then I can read that host still

  Scenario: S-7 The chosen host below the drop line for the hold
    Given a host is chosen
    When it leads below the drop line for the hold
    Then I can read "hold closer"

  Scenario: S-8 A rival near the chosen host
    Given a host is chosen
    When hosts are heard with no leader
    Then I can read "hold closer"

  Scenario: S-9 Another host leads
    Given a host is chosen
    When another host leads above the floor
    Then I can read the other host

  Scenario: S-10 The chosen host fades during the hold
    Given a host is chosen and below the drop line for less than the hold
    When no host is heard
    Then I can read "none"

  Scenario: S-11 No hold
    Given the hold is 0 and a host is chosen
    When it leads below the drop line
    Then I can read "hold closer"

  Scenario: S-12 The chosen host above the floor
    Given a host is chosen
    When it leads above the floor again
    Then I can read that host still

  Scenario: S-13 A host first leads below the drop line
    Given no host is chosen
    When a host leads below the drop line
    Then I can read "hold closer"
```

Not host choice's: the signal, the leader and its band (host picker),
what the payer sees (client find, client UI).
