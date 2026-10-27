# Settings

Observer: the root, which reads the countdown for host broadcast and the
picker's values for the host picker, and hands the settings UI
its choices. The countdown and the picker keep their scenarios only if
each reads a value in its range, the one last chosen or its default.

Settings owns each setting's default and allowed values: the countdown
(60 s), the picker's α (0.3), window (1 s and 5 readings), floor (−65 dBm),
margin (6 dB) and fade (2 s), and the advertised name. It stores through a
store interface of its own, answered by the preferences adapter.

## Decided

- **A missing or out-of-range stored value reads as the default,** so a
  bad store can never stop a payment.
- **The countdown is one of five choices,** 15, 30, 60, 90 and 120 s, as
  the settings screen offers them (S1); any other value is refused.
- **The advertised name is made once,** `MIZAN-` and four random upper-case
  hex digits, stored and never changed in v0.0.1, so the payer sees the
  same till each time.
- **The picker's values have no screen in v0.0.1;** they change in the
  store, for a trial, and are read at each scan.

```gherkin
Feature: Settings with their defaults

  Scenario: S-1 Defaults on a fresh install
    Given nothing is stored
    When the settings are read
    Then I can read a 60 s countdown and the picker's starting values

  Scenario: S-2 Choosing a countdown
    Given the countdown is 60 s
    When 30 s is chosen
    Then I can read 30 s, also from a new settings read over the same store

  Scenario: S-3 A countdown that is not offered
    Given the countdown is 60 s
    When 45 s is chosen
    Then I can read that it was refused, and 60 s

  Scenario: S-4 A stored value out of range
    Given the store holds a picker floor of 0 dBm
    When the settings are read
    Then I can read the default floor

  Scenario: S-5 The advertised name is made once
    Given nothing is stored
    When the settings are read twice over the same store
    Then I can read the same advertised name both times, `MIZAN-` and four hex digits

  Scenario: S-6 A picker value from the store
    Given the store holds a margin of 8 dB
    When the settings are read
    Then I can read a margin of 8 dB
```

Not the settings': where values are stored (preferences), the screen
(host UI) and what each value does (host broadcast, host picker).
