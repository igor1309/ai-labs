# App

Observer: the owner running a build on a device, who reads its log. The
app target is the composition root: it builds every component and adapter,
answers each interface, maps each source into a flow's events and wraps
logging around them. It decides nothing; what a person can do with it is
the user spec (`../SPEC.md`).

## Decided

- **One mode is live at a time:** the root builds the chosen mode's flows
  and radio, and tears them down on a switch, so an iPad never advertises
  while it is a client.
- **Hand-over is wiring:** when a flow reaches its handed-over state, the
  root builds the next one with what it handed over (client find a host;
  the others a link and its session). The flow that started the
  transaction waits and gets the transaction's end; a flow in the middle
  is ended.
- **Logging is `os.Logger`,** subsystem `mizan-ble`, one category per
  decorated interface; amounts, keys and plaintext are never logged, only
  kinds, counters, lengths and states.
- **Bluetooth permission text** names payments to a nearby till:
  `NSBluetoothAlwaysUsageDescription` is "Mizan BLE uses Bluetooth to pay
  a nearby till, or to be the till."

```gherkin
Feature: Building the app

  Scenario: S-1 Each mode wires its own radio
    Given the app launched on an iPad
    When I read the log
    Then I can see the host radio built and no client radio

  Scenario: S-2 A switch tears the old mode down
    Given the host is at rest
    When the person switches to Client
    Then I can see in the log the host radio stopped before the client radio started

  Scenario: S-3 Every message is logged without its contents
    Given a payment from lock to result
    When I read the log
    Then I can see each message's kind, counter and length, and no amount or key

  Scenario: S-4 Every state change is logged
    Given a payment from lock to result
    When I read the log
    Then I can see each flow's states in order

  Scenario: S-5 A hand-over builds the next flow
    Given a handshake completes
    When I read the log
    Then I can see the flow that started the transaction wait, not end, and the next flow built with the same session
```

Not the app's: any decision (the flows, settings, picker) and any screen
(the UI modules).
