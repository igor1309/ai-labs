# Installed update

Observer: the user of the running Audelin app.

Oracle: the owner's installed-update requirements in LAB-1059 and approved
Screen 7b, “Installed update”, with its accompanying brief. Presentation
details remain in the design; this spec makes no platform or architecture decisions.

```gherkin
Feature: Restart into an installed update without interrupting a call

  Scenario: S-1 No installed update
    Given the running Audelin is the installed build
    When I look at the menu bar and open its menu
    Then I see the usual icon and menu without an update badge or restart offer

  Scenario: S-2 Reinstall the running build
    Given Audelin is running without an update offer
    When the same build is installed again
    Then I see no update badge or restart offer

  Scenario: S-3 Notice an installed update
    Given Audelin is running between calls
    When a newer build finishes installing
    Then within seconds I can see the corner badge and choose Restart to update in the menu

  Scenario: S-4 Keep the menu bar in place
    Given I can see Audelin's menu bar icon
    When an installed update becomes available
    Then I can see the badge over its corner without the item changing size or position

  Scenario: S-5 Notice an update during recording
    Given Audelin is recording a call
    When a newer build finishes installing
    Then within seconds I can see the badge over the recording time without its item changing size or position

  Scenario: S-6 Cannot restart during recording
    Given a newer build is installed while Audelin records a call
    When I open the menu
    Then I can read the disabled Restart to update offer and Available after the call while recording continues

  Scenario: S-7 Cannot restart while saving the final transcript
    Given a newer build is installed and recording has stopped but the final transcript is still being saved
    When I open the menu
    Then I can read the disabled Restart to update offer and Available after the call until saving finishes

  Scenario: S-8 Restart becomes available after the call
    Given the restart offer was disabled during a call
    When recording, final transcript saving and any active notes finish
    Then I can choose Restart to update without reopening Audelin and can still see the badge

  Scenario: S-9 A new call prevents restart
    Given I could choose Restart to update between calls
    When Audelin starts recording another call before I restart
    Then I cannot use the restart offer to cut that call short and can read Available after the call

  Scenario: S-10 The offer stays until restart
    Given a newer build is installed
    When I close and reopen the menu without restarting
    Then I can still see the badge and the restart offer appropriate to whether a call is underway

  Scenario: S-11 Restart into the installed build
    Given a newer build is installed and no call is recording, finishing its transcript or preparing notes
    When I choose Restart to update
    Then I can use the installed build after Audelin quits and reopens, without the update badge or offer

  Scenario: S-12 A later install is the restart destination
    Given a newer build is installed and I have not restarted
    When an even newer build finishes installing
    Then I keep the badge and offer and can restart into the newest installed build when the call permits

  Scenario: S-13 Restart retains normal launch recovery
    Given a newer build is installed between calls and note jobs are pending
    When I choose Restart to update
    Then I can continue with my calls and pending notes as on an ordinary launch

  Scenario: S-14 Automatic update waits for active notes
    Given an automatic update is ready while call notes are being dispatched or prepared
    When Audelin checks whether it can restart
    Then it waits through publication and terminal saving

  Scenario: S-15 Automatic update checks observed owners
    Given another instance can be preparing notes for a loaded call
    When Audelin checks whether it can restart
    Then it rereads that call, including a previously interrupted attempt
    And it waits if ownership remains active or completion cannot be established

```

Normal launch behaviour for optional notes is owned by the optional call notes
spec; an update restart adds no new note retry or recovery policy.
