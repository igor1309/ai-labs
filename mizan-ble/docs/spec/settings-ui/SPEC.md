# Settings UI

Observer: the operator at the iPad. The settings UI is the host's settings
sheet, opened from the gear in the host's session rail; it draws the
settings and sends the operator's choice; it decides nothing. Oracle: the
design's S1 frame and the user spec.

## Decided

- **Only the countdown can be changed;** the advertised name, the
  currency (Mizan · MZN) and the processor (mock, manual outcome) are
  shown read-only, as S1 draws them.
- **The gear is disabled while an amount is on air or a payment runs,**
  so the countdown of the amount on air is never in question.

```gherkin
Feature: The host's settings

  Scenario: S-1 Choosing the countdown
    Given the host waits for an amount, with none on air
    When I open settings from the gear and choose an offered countdown
    Then I see it chosen, and a preview of the ring at that length

  Scenario: S-2 What else is shown
    Given the settings are open
    When I look at them
    Then I see the advertised name, the currency and the processor, and cannot change them

  Scenario: S-3 Settings while on air
    Given an amount is advertised
    When I look at the gear
    Then I see that it cannot be opened

  Scenario: S-4 Settings during a payment
    Given the host awaits the client's decision
    When I look at the gear
    Then I see that it cannot be opened
```

Not the settings UI's: the allowed values and storage (settings) and the
tokens and components (design system).
