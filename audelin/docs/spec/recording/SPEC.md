# Recording

Observer: compose, which builds Recording on the machine loop, feeds it
events through the merge mapping, and hands its state to the panel and the
menu bar (`../../app-shape.md`). They show whether a call is recorded, why,
and what held it back: user S-1, S-2, S-7, S-17 (`../SPEC.md`). Recording
decides whether a recording runs and brings its pieces up and down. Its
state holds the current recording's stage (claiming the calls folder,
claiming call audio, bringing the pieces up, running, bringing them down,
releasing call audio, releasing the calls folder) and the
pieces' own state, which the Session reducer advances as a pure function
inside Recording's reducer. Each piece is a collaborator of Recording's
effect handler, and its result comes back as a Recording event.

## Decided

- **A recording begins on a call or by hand.** A call starting begins one
  when automatic recording is on (S-1); the user begins one when none runs
  (S-2). A second call app joins the running call (Core Audio processes).
- **It ends with its call or by hand,** however it began (S-7, S-17), and
  also while still beginning. The user ending one during a call holds until
  that call ends, so automatic recording does not begin it again at once.
- **One at a time.** A start while a recording begins or runs is ignored.
  A call that starts while the last Session ends is recorded once it has
  ended, if the call is still on.
- **Idle only once the Session has ended,** so recordings never overlap.
- **Audio's conditions come first:** microphone access, call audio access
  established by a muted own-process reception probe, and a calls folder
  with room; room means at least 30 GB free on the calls folder's volume (owner, 2026-10-26). No start begins without them. Once recording,
  a lost access is a failing capture and the other side goes on (the
  Session, the design's mic lost); only a lost folder or room ends it, its
  audio kept (disk full). Setup reads the conditions' merge (LAB-406).
- **The calls folder is claimed first and released last.** A start takes
  the calls-folder claim before it asks for call audio, and Recording keeps
  the token until the pieces are down and call audio is released; only then
  is it idle. The claim covers the recording, not its finalization or
  notes. A refused start asks for no call audio. A stop or shutdown during
  the take ends the start, and a late grant is released.
- **A start refused by a move waits for it; one refused by a relaunch
  ends.** A waiting start is kept as a moving folder keeps one (below). If
  the move had already ended when its refusal arrives, the start takes the
  claim again at once, so a refusal can never leave a start waiting for a
  move that is over.
- **A moving calls folder holds a start; a lost one refuses it.** While a
  move has the folder, a start waits for the move to end and then begins:
  a stop drops it, a call's end or automatic recording turned off drops a
  call's start, and a start by hand stays. A moving folder never ends a
  recording that holds the claim, however late the news arrives; only a
  lost folder or room does.
- **Recording asks before the pieces come up.** Its stage after the claim awaits call-audio
  readiness for a user start, a call start and a deferred automatic start.
  The readiness port refreshes reception evidence and reserves the recording
  interval. A false answer reports call audio as unavailable and begins no
  Session. A previous missing-call-audio reading can be checked again by a
  new start. The reservation is released once the pieces are down, or when a
  pending start is stopped or refused. Compose subscribes to the published
  access condition and maps it for the menu; it does not identify start events.
- **A call's start refused only for call audio tries again during the call.**
  When a call's start gets a false readiness answer and nothing else is
  missing, Recording keeps the start waiting for call audio. Five seconds
  later, by its clock, it asks for readiness again, and goes on asking
  every five seconds until an answer is true, when the recording begins as
  any call's start does. Call audio published as available begins it at
  once. Each try takes the calls-folder claim as any start does and
  releases it with a false answer. The wait ends with no recording when the
  call ends, the user stops, automatic recording is turned off, another
  condition goes missing or Recording shuts down. A start by hand refused
  for call audio does not wait: the user sees what is missing and starts
  again.
- **A stop can name the recording it is for.** The panel's Stop names the
  recording the panel shows; Recording takes it as the user's stop only
  while that recording is the current one, and ignores it otherwise, so a
  stop from a finished call's panel never ends the next. The menu's Stop
  names none and stops whatever runs.
- **A Session that cannot record is ended,** named until the next.
- **A side that fails while recording is named until the next recording
  begins.** The Session tells which: a lost access or a failed capture on
  the microphone side is "no microphone", on the call side "no call
  audio"; a failed track write on either side is "disk full", its audio
  so far kept. The other side goes on, and the recording runs on while any
  side records. A report for a Session that is no longer the current one
  changes nothing. The menu bar shows each fault beside its recording line
  while recording and ending.

- **Call silence is carried only while the warning holds.** The current
  Session can report that its call side is silent and later clear that
  warning. Recording accepts these values while beginning, recording or
  ending, without adding a fault or changing recording control. A new
  recording begins without the warning, and the Session ending clears it.
  A warning report from an earlier or ended Session changes nothing.

- **Recording publishes its transcript output.** A recording's transcript
  is made final elsewhere (Transcript finalization), and Recording only
  reports what happened to the live file, in one ordered stream for the
  life of Recording, each value keyed by the call's folder, none dropped
  or merged:
  - **opened**, once the transcript file is open;
  - **wrote** with the call text saved, once a live save returns, or
    **write failed** when it throws;
  - **closed** with the speaker names, read once, after the file closes.

  A recording whose transcript never opened sends nothing. Values of one
  call come in that order, and one call's closed comes before the next
  call's opened. The output holds values only: the handles needed to make
  a transcript final (its writer, the track files, how far audio was
  captured) go to compose's resource store when the file opens, before
  opened is sent, and are not part of the output. Recording knows nothing of who reads the output: compose
  subscribes it and sends each value on, so no piece of a recording
  sends to another machine.
- **Shutdown settles after the transcript output.** On shutdown the current
  recording ends as by hand, and Recording settles only once its last
  closed is in the output; the output then finishes. A reader that has
  read every value to the end has therefore seen every call's close.

```gherkin
Feature: Deciding when a call is recorded

  Scenario: S-1 A call begins a recording
    Given automatic recording is on and nothing is missing
    When a call starts
    Then I can read that a recording begun by the call runs

  Scenario: S-2 A call begins nothing when automatic recording is off
    Given automatic recording is off
    When a call starts
    Then I can read that no recording runs

  Scenario: S-3 The user begins a recording
    Given no call is on and nothing is missing
    When the user starts recording
    Then I can read that a recording begun by hand runs

  Scenario: S-4 The user ends a recording
    Given a recording begun by hand runs with no call on
    When the user stops it and its Session ends
    Then I can read that no recording runs

  Scenario: S-5 A call's end ends its recording, however it began
    Given a recording runs during a call
    When the call ends and its Session ends
    Then I can read that no recording runs

  Scenario: S-6 A call the user stopped is not recorded again
    Given the user stopped the recording of a call that is still on
    When the call goes on
    Then I can read that no recording runs until a new call starts

  Scenario: S-7 A start while a recording is on changes nothing
    Given a recording is on
    When a start comes
    Then I can read that the same recording is on

  Scenario: S-8 A call during bring-down is recorded after it
    Given a recording is ending
    When a call starts and the Session ends
    Then I can read that a recording begun by the call runs

  Scenario: S-9 A missing condition holds a start back
    Given a needed condition is missing
    When a start comes
    Then I can read that no recording runs and what is missing

  Scenario: S-10 A Session that cannot record is ended and named
    Given a recording is on
    When its Session says it cannot record and then ends
    Then I can read that no recording runs and why

  Scenario: S-11 A stop while a recording begins ends it
    Given a recording is beginning
    When a stop comes and its Session ends
    Then I can read that no recording runs

  Scenario: S-11a A stop for a finished recording leaves the current one
    Given one recording has ended and the next records
    When a stop naming the first recording comes
    Then I can read that the next recording still runs

  Scenario: S-12 A call that ends during bring-down is not recorded
    Given a call started while a recording was ending
    When the call ends and then the Session ends
    Then I can read that no recording runs

  Scenario: S-13 Losing the calls folder ends a recording
    Given a recording runs
    When the calls folder goes missing and the Session ends
    Then I can read that no recording runs and what is missing

  Scenario: S-14 A condition coming back allows a start
    Given a needed condition was missing
    When it comes back and a start comes
    Then I can read that a recording runs

  Scenario: S-15 A side failing while recording is named
    Given a recording runs
    When its Session says a side failed
    Then I can read that the recording runs and which fault it has

  Scenario: S-16 Faults are named until the next recording
    Given a recording ended with a fault named
    When a new recording begins
    Then I can read that it has no fault

  Scenario: S-17 A fault from an earlier Session changes nothing
    Given a recording runs
    When an earlier Session says a side failed
    Then I can read that the recording has no fault

  Scenario: S-18 A recording's transcript is reported in order
    Given a recording runs with its transcript open
    When two saves return, one save fails and the recording ends
    Then the transcript output reads opened, wrote, wrote, write failed, closed for its call

  Scenario: S-19 Closed carries the names at close
    Given a recording runs and its call is named
    When the recording ends and a name changes afterwards
    Then the output's closed carries the names as they were when the file closed

  Scenario: S-20 A recording with no transcript reports nothing
    Given a recording whose transcript fails to open
    When the recording ends
    Then the transcript output is empty

  Scenario: S-21 Two recordings report one after the other
    Given a recording ended and a second one began
    When the second recording ends
    Then the output reads the first call's values through its closed, then the second call's

  Scenario: S-22 Shutdown settles after the last close
    Given a recording runs
    When Recording is shut down and settles
    Then the transcript output ends with that call's closed and then finishes

  Scenario: S-23 A start claims the calls folder before call audio
    Given nothing is missing and no one has the calls folder
    When a start comes
    Then I can see the calls folder claimed before call audio is asked for

  Scenario: S-24 A start refused by a relaunch begins nothing
    Given a relaunch has the calls folder
    When a start comes and its claim is refused
    Then I can read that no recording runs and none is waiting

  Scenario: S-25 A start refused by a move begins after it
    Given a move has the calls folder
    When a start comes, its claim is refused and then the move ends
    Then I can read that a recording runs

  Scenario: S-26 A start refused by a move that has already ended claims again
    Given a start's claim is under way while a move ends
    When the refusal arrives after the move's end
    Then I can see the calls folder claimed again at once

  Scenario: S-27 A start while the folder moves begins after the move
    Given the calls folder is moving
    When the user starts and then the move ends
    Then I can read that a recording begun by hand runs

  Scenario: S-28 A stop drops a start waiting for a move
    Given a start waits for a move
    When the user stops and then the move ends
    Then I can read that no recording runs

  Scenario: S-29 A call's end drops its start waiting for a move
    Given a call's start waits for a move
    When the call ends and then the move ends
    Then I can read that no recording runs

  Scenario: S-30 A start by hand outlasts a call's end while waiting
    Given a start by hand waits for a move during a call
    When the call ends and then the move ends
    Then I can read that a recording begun by hand runs

  Scenario: S-34 Automatic recording turned off drops only a call's waiting start
    Given a call's start waits for a move, or a start by hand does
    When automatic recording is turned off and then the move ends
    Then I can read that no recording runs for the call's start, and one begun by hand runs

  Scenario: S-31 Late news of a move does not end a recording
    Given a recording runs holding the calls folder
    When news arrives that the calls folder is moving
    Then I can read that the same recording runs

  Scenario: S-32 The claim is released last
    Given a recording is ending
    When its pieces are down and call audio is released
    Then I can see the calls folder released and then no recording running

  Scenario: S-33 A stop during the take releases a late grant
    Given a start is taking the calls folder
    When the user stops and then the claim is granted
    Then I can see the calls folder released and no call audio asked for

  Scenario: S-35 A call's start refused for call audio tries again
    Given a call started and its readiness answer was false
    When five seconds pass and readiness answers true
    Then I can read that a recording begun by the call runs

  Scenario: S-36 Call audio coming back begins a waiting call's start
    Given a call's start waits for call audio
    When call audio is published as available
    Then I can see readiness asked for at once, and a recording begins when it answers true

  Scenario: S-37 A call's start goes on waiting while call audio is missing
    Given a call's start waits for call audio
    When five seconds pass and readiness answers false again
    Then I can read that no recording runs and that call audio is missing, and see the next try five seconds later

  Scenario: S-38 The wait for call audio ends with the call, a stop or automatic off
    Given a call's start waits for call audio
    When the call ends, the user stops, or automatic recording is turned off
    Then I can read that no recording runs and see no further try

  Scenario: S-39 Another missing condition or shutdown ends the wait
    Given a call's start waits for call audio
    When the calls folder or room goes missing, or Recording shuts down
    Then I can read that no recording runs and see no further try

  Scenario: S-40 A start by hand refused for call audio does not wait
    Given no call is on
    When the user starts and readiness answers false
    Then I can read that no recording runs, that call audio is missing, and see no further try
```
