# Mode switch

Observer: the person holding a device. The mode switch is the segmented
Host and Client control in every header, in the host's orange and the
client's cyan, and the shell that shows the chosen mode's screens. The
root tells it whether the live flow is at rest; it decides which mode is
chosen and nothing else. Oracle: the design's header (M1 to M10) and the
user spec.

## Decided

- **At rest** means the side holds no session and no link: the host
  types an amount, timed out, failed a handshake or ended a payment; the
  client scans, failed to connect or ended a payment. The root finishes
  the host radio on a switch, never retires it, so a result sent leaves.
- **The switch is disabled while not at rest,** so a switch can never
  break a payment off. The way out is the screen's own: Cancel, Decline,
  or the host's end; the payer's wait after confirming has none.
- **A launch opens the host on an iPad and the client on an iPhone;** the
  last mode is not remembered, so each device starts in its design role.
- **Switching shows the other mode at its start,** with nothing kept from
  the mode left.

```gherkin
Feature: Switching between host and client

  Scenario: S-1 Launch on an iPad
    Given Mizan BLE is not running on an iPad
    When I open it
    Then I see the host, with Host chosen in orange

  Scenario: S-2 Launch on an iPhone
    Given Mizan BLE is not running on an iPhone
    When I open it
    Then I see the client, with Client chosen in cyan

  Scenario: S-3 Switching at rest
    Given the host is waiting for an amount
    When I choose Client
    Then I see the client at its start, scanning for hosts

  Scenario: S-4 No switch while a payment is under way
    Given the host is broadcasting an amount
    When I look at the switch
    Then I see it cannot be changed

  Scenario: S-5 Switching after a failed handshake
    Given the client could not connect
    When I choose Host
    Then I see an empty amount to type

  Scenario: S-6 Switching after a payment
    Given the client's payment has ended
    When I choose Host
    Then I see an empty amount to type
```

Not the mode switch's: what each mode does (the flows, host UI and client
UI) and its colours and shapes (design system).
