# Preferences

Observer: the root, which answers the settings' store with this adapter.
Settings keeps its scenarios only if a value written is the value read
back, also after a relaunch, and nothing written reads as nothing.

Preferences is a thin binding over `UserDefaults`: a number or a text
under a key. It knows no setting.

## Decided

- **The app's suite is `mizan-ble`;** the suite name is given when the
  adapter is built, so a test uses a suite of its own and never touches
  the app's.
- **No validation here:** the store gives back what it holds; ranges are
  the settings'.

```gherkin
Feature: Stored values

  Scenario: S-1 A value round trip
    Given an empty suite
    When a number is written under a key
    Then I can read that number under that key

  Scenario: S-2 A value survives a new instance
    Given a number written under a key
    When a new instance opens the same suite
    Then I can read that number under that key

  Scenario: S-3 Nothing written
    Given an empty suite
    When a key is read
    Then I can read that nothing is there
```

Not the preferences': defaults and ranges (settings).
