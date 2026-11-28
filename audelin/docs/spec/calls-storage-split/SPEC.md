# Calls storage split

Observer: the caller changing a recorded call.

```gherkin
Feature: Calls storage split

  Scenario: S-1 Reject inactive folder
    Given a call is outside the active calls folder or is held by a move
    When I ask to split it
    Then I can see why the call is unavailable to split

  Scenario: S-2 Reject changed transcript
    Given the call's transcript changed after I read the split choices
    When I confirm the split
    Then I can see that those choices expired and read the current call intact

  Scenario: S-3 Resolve both parts
    Given a split has committed
    When I look up both replacement calls
    Then I can open each part by its own identity

  Scenario: S-4 Keep same-minute parts addressable
    Given both parts start in the same displayed minute
    When I split the call
    Then I can open and merge the parts by distinct identities

  Scenario: S-5 Recover identities after publication
    Given both parts were published before the storage index recorded them
    When I reopen the calls folder
    Then I can open both parts by their published identities
```
