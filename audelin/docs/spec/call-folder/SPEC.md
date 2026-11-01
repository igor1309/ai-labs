# Call folder

Observer: Session, which makes a recording's folder first, through
`SessionFolder`, and needs to tell when it cannot (`../session/SPEC.md`).
It keeps each call apart in the calls folder, for user S-7 and S-17
(`../SPEC.md`), named so the user can rename it later (S-10). An adapter
over the file system.

## Decided

- **This is making a call's folder only.** Renaming, deleting, moving and
  listing calls are Recordings' (`app-shape.md`), whose spec takes them
  with its own client; whether the calls folder is there and has room is
  the conditions' (Recording). One client now, so one responsibility.
- **Making the folder gives Session the folder, and Session opens its
  files in it.** `SessionFolder.create()` returns a folder of Session's
  own type, and the track files' and transcript's `open` take it, so the
  name chosen at run time reaches them through Session's contract, not
  through hidden shared state (Amanu and MacParakeet both hand the made
  folder to their writers). This amends Session's ports; the adapter maps
  the folder to its three places.
- **Named by when it is made, `yyyy.MM.dd-HHmm`, in local time,** the
  design's rename prefix (Rename field) and Amanu's folder name, taken as
  Amanu does when its session is made (`RecordingSession` `startedAt`). The
  clock and time zone are given to the adapter; the format uses the POSIX
  locale and the Gregorian calendar, as fixed formats need (Apple,
  `DateFormatter`; MacParakeet `MeetingAudioFile`). No title is known yet,
  so none is added. The name promises no order.
- **A name already taken gets `-2`, `-3` and on,** as Amanu does, and the
  suffix is part of the fixed prefix: a rename keeps the whole made name
  in front, so a renamed call stays apart (the design's Rename field shows
  the prefix; renaming is Recordings'). Each
  name is tried by making the folder, and anything already there, of any
  kind, even a link to nothing, sends it to the next. Checking first would
  race (Apple: `fileExists` follows links), so a second call never shares
  or changes a kept one.
- **The calls folder is never made here:** a missing calls folder is a
  condition Recording waits on, so making it would hide that the user's
  folder went away. Making a call's folder fails instead.
- **The places are `microphone.caf`, `call.caf` and `transcript.md`**
  inside the folder, so every call looks alike (Amanu keeps `mic.caf` and
  `system.caf`; "call" is the side's name here).
- **The folder is private to the user, mode `0700`,** because it holds
  the user's recorded calls; no other account on the Mac may list or read
  them. The mode is given to the folder as it is made, so it is never
  readable by others even for a moment.
- **A make that fails leaves nothing,** so it never takes a name from the
  next call.

```gherkin
Feature: Making a call's folder

  Scenario: S-1 A call gets its own folder
    Given a calls folder
    When I make a call's folder
    Then I can keep the call in a folder of its own, named by when it was made

  Scenario: S-2 A second call in the same minute gets its own folder
    Given a call's folder made for this minute
    When I make another
    Then I can keep the call in a folder of its own

  Scenario: S-3 A name taken by a file is not used
    Given a file under the name a call's folder would take
    When I make the call's folder
    Then I can keep the call in a folder of its own

  Scenario: S-7 A name taken by a link is not used
    Given a link to a folder under the name a call's folder would take
    When I make the call's folder
    Then I can keep the call in a folder of its own

  Scenario: S-9 A name taken by a broken link is not used
    Given a link to nothing under the name a call's folder would take
    When I make the call's folder
    Then I can keep the call in a folder of its own

  Scenario: S-8 Every taken name is passed over
    Given the name a call's folder would take, and its next, both taken
    When I make the call's folder
    Then I can keep the call in a folder of its own

  Scenario: S-5 A missing calls folder fails
    Given no calls folder where it should be
    When I make a call's folder
    Then I can tell it failed

  Scenario: S-6 A folder that cannot be made fails
    Given a calls folder where no folder can be made
    When I make a call's folder
    Then I can tell it failed
```
