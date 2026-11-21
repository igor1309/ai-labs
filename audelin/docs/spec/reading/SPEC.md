# Reading

Observer: compose, which feeds call-keyed text, names, recording state,
time and reader actions into the reducer, and translates its state
for the panel. Reading owns no recording, recognition, window or other
effects; transcript layout lays out its rows.

## Decided

- One Reading lives as long as the app. It holds the displayed call's id.
  Opening a later call resets the log, and input for another call is
  ignored. After its recording ends the call stays displayed, still taking
  its text, names and speaker places, until the next call opens. The log
  follows the chosen language even after recording ends.
- Text before capture begins is kept, and the log shows empty until
  capture first begins; once begun it does not close again for that call.
- A listening update replaces the text after the last final entry; final
  entries stay. Preparing, off, failed and finished updates keep prior entries. Holds and following
  survive every status change.
- Names come as one set by remote local id, with whether they are
  confirmed; each set replaces the last. A tentative set names the entries of
  the latest text update and later ones; a confirmed set names every
  remote entry. Speaker places take effect after the call's text feed ends.
- Time comes as instants on one monotonic clock, stamped by compose on
  each recording change, tick and fault report. The first instant recording
  is on starts the clock; recording off stops and clears it. Recording time
  is elapsed `HH:MM:SS`, fractions rounded down; a tick earlier than the
  last is ignored.
- A fault keeps the elapsed time of its first report and stays until
  recording is off. Banners run newest first; equal times put the last new
  one first. Missing call audio, microphone or disk track add a gap on that
  side; call silence adds only a banner, and clearing it removes only that.
- Holds keep the supplied text exactly, oldest first; only letting that
  selection go removes it. Scrolling away pauses following and counts each
  new entry below; reaching the bottom or jumping to live resumes and clears.
  The latest scroll interaction is acknowledged by its id. Reader actions
  stop changing the log once the Session and its feeds have ended.
- An unread recording shows an empty log. Recording with text off offers
  live text, keeping prior lines. Getting ready shows preparing, with lines
  kept visible while problems are active. Faults and recognition failure
  never change the recording indicator or captured text.

```gherkin
Feature: Reading the displayed call

  Scenario: S-1 A failed side shows a banner and a gap
    Given a recording with text on both sides
    When a track fault is reported
    Then compose can show its banner and a gap on that side until recording is off

  Scenario: S-2 Silence clears without leaving a gap
    Given the call-silence banner and a microphone fault
    When the silence warning clears
    Then compose can show only the microphone banner, with no silence gap

  Scenario: S-3 Held selections stay as selected
    Given several selections are held
    When text changes or disappears
    Then compose can show every selection with exactly its text, in order

  Scenario: S-4 Scrolling away counts new entries
    Given the reader has scrolled away from the bottom
    When new entries arrive
    Then compose can show how many are below, and jumping to live clears it

  Scenario: S-5 Live text prepares while recording
    Given a recording is running
    When live text is getting ready
    Then compose can show preparing and the elapsed recording time

  Scenario: S-6 Finishing keeps what was read
    Given the log has text
    When live text finishes
    Then compose can show the text so far

  Scenario: S-7 A finished call takes its confirmed names
    Given a call's recording has ended and the next has not opened
    When its confirmed names arrive
    Then compose can show its text with those names

  Scenario: S-8 The next call starts clean
    Given a finished call is displayed with holds
    When the next call opens and the finished call's text arrives late
    Then compose can show an empty log with no holds

  Scenario: S-9 Text before capture waits
    Given a call has opened and its text arrives
    When capture begins
    Then compose can show that text, and an empty log before it

  Scenario: S-10 Confirmed names reach final entries
    Given remote entries have been read, some of them final
    When a confirmed set of names arrives
    Then compose can show every remote entry under its name from that set

  Scenario: S-11 Time runs from the first recording instant
    Given recording went on at an instant
    When a later tick and then an earlier one arrive
    Then compose can show the time from that instant, never running back

  Scenario: S-12 Speaker places follow the final text
    Given speaker places arrive before the call's text feed ends
    When the final text arrives and the feed ends
    Then compose can show speaker places on the final rows
```
