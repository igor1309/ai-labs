# Host picker

Observer: the root, which feeds the picker the client radio's timestamped
readings and the clock's ticks, and turns each answer into client find's
event. Client find keeps its scenarios only if the picker names the
nearest host when there is a clear one, and asks to hold closer when there
is not.

The picker is a pure type: readings and the time in, an answer out. Its
answer is one of a host, "hold closer" or "none". It reads its α, window,
floor, margin and fade from the settings it is given; every scenario
below uses the defaults unless it says otherwise.

## Decided

- **Smoothing:** an exponential moving average per host,
  `ema = α·rssi + (1 − α)·ema`, the first reading as the start, as
  `NOTES.md` decides.
- **A reading of 127 is dropped:** Core Bluetooth's "not available".
- **A host not heard for the fade (2 s) leaves the candidates:** its
  readings are too old to rank, whether or not it still advertises.
- **A leader is chosen** only after the window: at least 1 s since its
  first reading and 5 readings. If its average is above the floor
  (−65 dBm) and leads every other candidate by more than the margin
  (6 dB), it is the answer; otherwise "hold closer".
- **"None" means no candidate,** and "hold closer" means candidates but no
  clear leader, so the payer is told to move only when a host is there.
- **Every candidate counts against the leader,** inside its window or
  not, so a second till just coming into range near the leader's strength
  blocks a choice instead of being ignored.
- **The answer can change** with each reading or tick; the picker keeps no
  choice, and client find stops feeding it once the handshake starts.

```gherkin
Feature: Choosing the nearest host

  Scenario: S-1 One host, near
    Given one host has been heard above the floor for the whole window
    When I ask for the answer
    Then I can read that host

  Scenario: S-2 One host, too far
    Given one host has been heard for the whole window, below the floor
    When I ask for the answer
    Then I can read "hold closer"

  Scenario: S-3 One host, not yet long enough
    Given one host has been heard for less than the window
    When I ask for the answer
    Then I can read "hold closer"

  Scenario: S-4 Two hosts, one clearly nearer
    Given two hosts heard for the window, both above the floor, one leading by more than the margin
    When I ask for the answer
    Then I can read the leader

  Scenario: S-5 Two hosts too close to call
    Given two hosts heard for the window, within the margin of each other
    When I ask for the answer
    Then I can read "hold closer"

  Scenario: S-6 A host that fades out
    Given a chosen host, the only one heard, that stops being heard
    When the fade has passed with no reading from it
    Then I can read "none"

  Scenario: S-7 The fading host lets the other win
    Given two hosts too close to call, both heard above the floor for the window
    When one is not heard for the fade while the other still is
    Then I can read the other

  Scenario: S-8 A reading of 127
    Given a host heard above the floor for the window
    When readings of 127 arrive for it
    Then I can read the same answer as without them

  Scenario: S-9 A spike is smoothed
    Given a host at −50 dBm chosen over a host steady at −70 dBm
    When one reading of −45 dBm arrives from the farther host
    Then I can read the nearer host still

  Scenario: S-10 A newcomer near the leader's strength
    Given one host chosen at −50 dBm
    When a second host is first heard at −52 dBm
    Then I can read "hold closer"

  Scenario: S-11 No hosts
    Given no reading has arrived
    When I ask for the answer
    Then I can read "none"

  Scenario: S-12 Two equal hosts with no margin
    Given the margin is 0 and two hosts heard for the window at the same average
    When I ask for the answer
    Then I can read "hold closer"
```

Not the picker's: scanning (client radio), the time (clock), what the payer
sees (client find, client UI).
