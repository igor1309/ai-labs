# App

Observer: the owner running a build on a device, who reads its log. The
app target is the composition root: it builds every component and adapter,
answers each interface, maps each source into a flow's events and wraps
logging around them. It decides nothing; what a person can do with it is
the user spec (`../SPEC.md`).

## Decided

- **One mode is live at a time:** the root builds the chosen mode's flows
  and tears them down on a switch. Both radios live as long as the app,
  idle unless a flow uses them, so a switch never cuts a finishing session;
  a host radio advertises only while host broadcast asks.
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
- **Each flow runs on a swift-imrx `ObservableModel`** (`from: "1.0.0"`),
  made on the main actor with its Equatable initializer from the flow's
  reducer and handler, because it reduces events one at a time in order,
  queues each result behind the events already sent and skips an equal
  state while still carrying out its effect, with no loop of our own.
  Only the root imports IMRxObservation.
- **A handler starts its work before it returns its stream:** the model
  calls it while reducing, and work that waits begins in `Task.immediate`,
  so an effect runs up to its first suspension before the next event is
  reduced.
- **The root sees every state in order:** it takes each flow's initial
  state when it builds the flow, then each changed state from a decorator
  around the reducer, using the model's equality rule. It logs those
  states and wires hand-overs and ends from them.
- **A flow ends after the reduction that asked for it:** the decorator
  only notes a handed-over or ended state, and the root acts on it once
  that reduction and the effect it started are under way. It then drops
  the model's last strong reference: the root holds each model in one
  place, and no subscription, event closure or task retains it. The loop
  stops, so a later event or result is dropped and starts no work; an
  effect already started may finish.
- **Screens get plain state:** an observing view in the app target reads
  the model through Observation and hands the UI module its state and an
  event closure; it may skip a state between two frames.

```gherkin
Feature: Building the app

  Scenario: S-1 Both radios built, one mode at work
    Given the app launched on an iPad
    When I read the log
    Then I can see both radios built and the host flows built, and the client radio not scanning

  Scenario: S-2 A switch tears the old mode down
    Given the host is at rest
    When the person switches to Client
    Then I can see in the log the host flows torn down before the client flows were built, and both radios kept

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
