# Automatic recording

Observer: the client that shows whether a call is recorded and starts and
stops one by hand: the menu and panel, through the control adapter at the
root (no spec yet). It needs this to keep user spec S-1, S-2 and S-7.

Automatic recording is a Core. It starts and stops the recording for a call
or for the user's hand. It is told when a call starts and ends (call
watch), reads the "record calls automatically" setting, and drives session,
each through an interface of its own.

## Decided

- Hand start and stop come through it, not straight to session, because
  only it can tell a hand-started recording from a call's.
- It stops by itself only a recording a call started: one started by hand
  is stopped by hand (mvp.md, Controls; user spec S-2).
- After a hand stop, that call starts no recording by itself again: the
  user asked to stop. The next call does, and a hand start still does.
- The setting is read when a call starts; switching it off mid-call does not
  stop that recording, because the user did not ask to stop (mvp.md says
  only what "on" does).
- A call that starts while a recording runs starts nothing (session: one at
  a time).

```gherkin
Feature: Recording calls by themselves and by hand

  Scenario: S-1 A call starts a recording
    Given automatic recording is on and nothing is recorded
    When a call starts
    Then I can tell the call is being recorded

  Scenario: S-2 With the setting off a call starts nothing
    Given automatic recording is off and nothing is recorded
    When a call starts
    Then I can tell nothing is being recorded

  Scenario: S-3 A call's end stops the recording it started
    Given a call started a recording
    When the call ends
    Then I can tell the recording stopped

  Scenario: S-4 A recording started by hand outlasts the call
    Given I started a recording by hand during a call
    When the call ends
    Then I can tell it is still recording

  Scenario: S-5 A call during a hand-started recording starts nothing new
    Given I started a recording by hand
    When a call starts
    Then I can tell my recording goes on, and no other starts

  Scenario: S-6 The setting switched off mid-call keeps the recording
    Given a call started a recording
    When I switch automatic recording off
    Then I can tell the call is still being recorded

  Scenario: S-7 A recording that cannot start is told
    Given automatic recording is on and the recording cannot start
    When a call starts
    Then I can tell the call is not being recorded

  Scenario: S-8 Starting by hand records
    Given nothing is being recorded
    When I start a recording by hand
    Then I can tell it is recording

  Scenario: S-9 Stopping by hand stops
    Given a call started a recording
    When I stop it by hand
    Then I can tell it stopped, and the call goes on unrecorded

  Scenario: S-10 The next call records after a hand stop
    Given I stopped a call's recording by hand and that call ended
    When the next call starts
    Then I can tell the call is being recorded

  Scenario: S-11 A hand start after a hand stop records the same call
    Given I stopped a call's recording by hand and the call goes on
    When I start a recording by hand
    Then I can tell it is recording

  Scenario: S-12 Stopping a hand-started recording by hand stops it
    Given I started a recording by hand
    When I stop it by hand
    Then I can tell it stopped
```

Not automatic recording's: when a call starts or ends (call watch),
recording and keeping the call (session, transcript writer).
