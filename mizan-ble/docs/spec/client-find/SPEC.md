# Client find

Observer: the client UI, which draws this machine's state and sends the
payer's start (screen C1). It says which host, if any, the payer can start
a handshake with; on the payer's start the root hands that host to client
connect, and this machine waits until the transaction is over.

Its events are host choice's answers, the picker's strongest smoothed
signal and the scanner's Bluetooth state, mapped by the root. Its one dependency, its own interface, is a
scanner (start, stop).

## Decided

- **Host choice's answer is final:** the machine never ranks hosts itself,
  so no host is guessed (`NOTES.md`).
- **The handshake is the payer's tap** in v0.0.1 (`docs/poc.md`).
- **A host that goes quiet after it was offered** is shown as gone (M10)
  until host choice offers a host again.
- **A host with no name yet is chosen all the same,** as the name is
  best effort in an advertisement; it is named once a reading brings it,
  and is handed over with its name or none.
- **The signal is shown, never judged:** it changes no choice and no
  start, and nothing fails on a weak one; RSSI moves 5–13 dB a second with
  the phone held still (`NOTES.md`), and once the payer starts, the
  session key, not distance, binds the payment to the till.
- **The signal at the start is kept** through the handshake, whatever
  arrives after it, Bluetooth's loss included (client connect shows that);
  it is cleared when the transaction is over.
- **Scanning stops on the start** and starts again when the root says the
  transaction is over, so the radio serves one link at a time.

```gherkin
Feature: Finding the nearest host

  Scenario: S-1 No host nearby
    Given the client is scanning
    When host choice finds no host
    Then I can read that no host is nearby and no handshake can start

  Scenario: S-2 A host is chosen
    Given the client is scanning
    When host choice chooses a host
    Then I can read that host's name and that a handshake can start

  Scenario: S-3 No clear nearest host
    Given the client is scanning
    When host choice says to hold the phone closer
    Then I can read that the phone should be held closer to the till, and no handshake can start

  Scenario: S-4 The chosen host goes quiet
    Given a host was chosen
    When host choice finds no host
    Then I can read that the host went quiet and no handshake can start

  Scenario: S-5 Starting the handshake
    Given a host was chosen
    When the payer starts the handshake
    Then I can read that the host is handed over and scanning stopped

  Scenario: S-6 Back to scanning
    Given a host was handed over
    When the root says the transaction is over
    Then I can read that the client is scanning, with no host chosen and no signal

  Scenario: S-7 Bluetooth is not available
    Given the client is scanning
    When the scanner says Bluetooth is not available, with its reason
    Then I can read that reason, no signal, and that no handshake can start

  Scenario: S-8 Bluetooth comes back
    Given Bluetooth was not available
    When the scanner says it is on
    Then I can read that the client is scanning, with no host chosen

  Scenario: S-9 A host with no name yet
    Given host choice chose a host whose readings brought no name
    When a reading brings its name
    Then I can read that host chosen, first with no name and then with its name

  Scenario: S-10 The signal while scanning
    Given the client is scanning
    When the picker hears a host at a signal
    Then I can read that signal, live, beside what host choice says

  Scenario: S-11 The signal at the start
    Given a host was chosen, and a later reading moved the signal
    When the payer starts the handshake
    Then I can read the latest signal as the one at the start, and nothing after changes it

  Scenario: S-12 No host heard
    Given the client is scanning, and a signal was read
    When the picker hears no host
    Then I can read that there is no signal
```

Not this machine's: choosing a host (host picker, host choice), the
handshake (client connect) and Core Bluetooth (client radio).
