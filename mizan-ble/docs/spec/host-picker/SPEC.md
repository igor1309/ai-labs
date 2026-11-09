# Host picker

Observer: the root, which feeds it the client radio's timestamped readings
and clock ticks, and hands host choice each answer: the signal as it is now.

A pure type: readings and the time in; out, the time, whether a host is
heard and the leader, if any, with its band. It reads its α, window,
floor, margin, fade and drop gap from settings; scenarios use defaults.

## Decided

- **Its view** is the live candidate count and the strongest live
  candidate's average in dBm, none when empty; reading it changes nothing.
- **Smoothing:** `ema = α·rssi + (1 − α)·ema` per host from its first
  reading (`NOTES.md`); a reading of 127, "not available", is dropped.
- **A host not heard for the fade (2 s) leaves the candidates,** its
  readings too old to rank; heard again, it starts a new window.
- **The leader** has been heard for the window (1 s and 5 readings) and
  leads every other candidate, in its window or not, by more than the
  margin (6 dB). A rival that is near it, or stronger, leaves no leader.
- **Its band** is above the floor (over −65 dBm), between the lines, or
  below the drop line (at or under the floor less the drop gap of 6 dB).
- **Below the drop line carries since when:** the time of the reading
  that took the host's average to or under the line, whether it led then
  or not. Only a reading that takes its average over the line ends that
  run; ticks, rivals and the window do not.
- **This spec may pass 100 lines:** the picker has one job, the signal
  now, and committing over time is already host choice's. A further cut
  would split one language in two, which the owner ruled a forced split.

```gherkin
Feature: Reading the signal of nearby hosts

  Scenario: S-1 One host, near
    Given one host has been heard above the floor for the whole window
    When I ask for the answer
    Then I can read that host leading, above the floor


  Scenario: S-3 One host, not yet long enough
    Given one host has been heard for less than the window
    When I ask for the answer
    Then I can read no leader, with a host heard

  Scenario: S-4 Two hosts, one clearly nearer
    Given two hosts heard for the window, both above the floor, one leading by more than the margin
    When I ask for the answer
    Then I can read the nearer one leading

  Scenario: S-5 Two hosts too close to call
    Given two hosts heard for the window, within the margin of each other
    When I ask for the answer
    Then I can read no leader, with hosts heard

  Scenario: S-6 A host that fades out
    Given a leading host, the only one heard, that stops being heard
    When the fade has passed with no reading from it
    Then I can read that no host is heard

  Scenario: S-7 The fading host lets the other lead
    Given two hosts too close to call, both heard above the floor for the window
    When one is not heard for the fade while the other still is
    Then I can read the other leading

  Scenario: S-8 A reading of 127
    Given a host heard above the floor for the window
    When readings of 127 arrive for it
    Then I can read the same answer as without them

  Scenario: S-9 A spike is smoothed
    Given a host at −50 dBm leading a host steady at −70 dBm
    When one reading of −45 dBm arrives from the farther host
    Then I can read the nearer host leading still

  Scenario: S-10 A newcomer near the leader's strength
    Given one host leading at −50 dBm
    When a second host is first heard at −52 dBm
    Then I can read no leader, with hosts heard



  Scenario: S-11 No hosts
    Given no reading has arrived
    When I ask for the answer
    Then I can read that no host is heard

  Scenario: S-12 Two equal hosts with no margin
    Given the margin is 0 and two hosts heard for the window at the same average
    When I ask for the answer
    Then I can read no leader, with hosts heard

  Scenario: S-13 A leader between the lines
    Given one host heard for the window, below the floor and above the drop line
    When I ask for the answer
    Then I can read that host leading, between the lines

  Scenario: S-14 Since when a leader is below the drop line
    Given one leading host above the drop line
    When a reading takes it below the line and ticks follow
    Then I can read it below the drop line since that reading

  Scenario: S-15 A leader back over the drop line
    Given one leading host below the drop line
    When a reading takes it over the line and a later one below it again
    Then I can read it below the drop line since the later reading

  Scenario: S-16 A host heard again after the fade
    Given a leading host that was not heard for the fade
    When a reading from it arrives
    Then I can read no leader, with a host heard

  Scenario: S-17 Below the drop line before it leads
    Given one host below the drop line, its window not yet over
    When its window ends with its average still below the line
    Then I can read it leading, below the drop line since it went there

  Scenario: S-18 A rival during a run below the drop line
    Given one host leading below the drop line
    When a rival near it is heard, then fades, the host's average under the line throughout
    Then I can read it leading, below the drop line since it first went there
```

Not the picker's: scanning (client radio), the time (clock), holding a
choice (host choice), what the payer sees (client find, client UI).
