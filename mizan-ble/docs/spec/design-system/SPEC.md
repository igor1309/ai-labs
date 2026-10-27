# Design system

Observer: the UI modules (host UI, settings UI, client UI, client payment
UI, mode switch), which draw every screen from this module's tokens and
components. They keep their scenarios only if what they draw matches the
locked design (`../../design/README.md`).

`DesignSystem` holds the design's `mz-*` tokens as Swift, generated from a
snapshot of the design's variables, and one SwiftUI view per `DS /`
component. It knows no flow and no state: each view takes plain values.

## Decided

- **Tokens are generated, never typed:** a script reads `tokens.json`, the
  snapshot of the `.pen` file's variables, and writes the Swift; a check
  mode fails when the Swift is stale, as audelin does it.
- **Only `mz-*` variables are tokens;** the rest belong to the
  explorations and are not generated.
- **Fonts ship with the app:** Space Grotesk, Inter and JetBrains Mono,
  all under the SIL Open Font License, so the screens look as designed
  with no network.
- **The Mizan sign is a vector shape** drawn from the design's path, so it
  scales with the amount's size.
- **Light and dark follow the device:** each `mz-*` colour has a dark and
  a light value, and a view takes the one for the SwiftUI colour scheme.
  Dark is the reference design; light accents are darker, to keep 4.5:1.

```gherkin
Feature: Drawing from the locked design

  Scenario: S-1 A token in the design is a token in code
    Given a token's value changes in the design
    When the snapshot is refreshed and the Swift regenerated
    Then I can draw with the new value, and the stale check passes

  Scenario: S-2 A stale token file is caught
    Given the snapshot changed and the Swift was not regenerated
    When the stale check runs
    Then I can read that the Swift is stale

  Scenario: S-3 Every component is a view
    Given a `DS /` component in the design
    When I draw a screen
    Then I can use it as a view with the same overrides the design has

  Scenario: S-4 An amount with the Mizan sign
    Given an amount and a size from the design
    When I draw it
    Then I can see the Mizan sign before it, at the design's proportion

  Scenario: S-5 A component matches its frame
    Given a component drawn with the design's sample values
    When it is compared with the design's preview of that component
    Then I can see the same colours, type, spacing and radii
  Scenario: S-6 The device's appearance
    Given a component and a device set to light
    When I draw it
    Then I can see the token's light value, and its dark value once the device is set to dark
```

Not the design system's: screens (host UI, settings UI, client UI, client
payment UI, mode switch) and the design itself (the `.pen` file).
