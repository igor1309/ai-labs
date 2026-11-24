# Call events

Observer: the SSE server, which gives each client the events of the call
being recorded (`../call-assistant/architecture.md`, ADR-003). An iterator
over a live call and a clock, both its own ports; it knows no file and no
transport.

## Decided

- **The source and follow programs are Go, in `audelin/feed/`,** a folder of
  their own beside the app's Swift package: small command-line programs that
  need the standard library's HTTP and no app build. They read
  `transcript.md` as the outside contract ADR-003 accepts.
- **Size and overlap are the client's,** in call time; this iterator sets no
  values (ADR-003: the client cuts the windows it needs).
- **Call time zero is the call's start the call reader gives,** true to the
  minute, a window up to a minute early accepted; a window is
  due when the clock passes its end, not when text arrives, so a call whose
  text stopped still gives windows, empty.
- **A part goes in every window its start falls in,** a start on a window's
  end in the next. Words first read after their window was given go in the
  next window; revisions of words already given are not sent (ADR-003).
- **No call is said once;** the next event waits for a call to start, so a
  waiting client is not woken for nothing.
- **Joining a call under way, the first event is everything said so far;**
  windows go on from the last window end passed.
- **Falling behind, every due window is given in turn, none dropped,** so the
  client decides what to read. At the call's end the windows left come
  first, then the last part-window, so no words are lost.
- **A failed read gives the due window empty and is read again at the next
  step:** ADR-003's three events carry no failure; a lasting failure reads as
  text not coming (user S-14).

```gherkin
Feature: Stepping through a live call's events

  Scenario: S-1 No call is said while none is live
    Given no call is live
    When I take the next event
    Then I can read that there is no call

  Scenario: S-2 A window comes when its time has passed
    Given a call is live with text in its first window
    When the clock passes the window's end
    Then I can read that window's text, and no text after it

  Scenario: S-3 Windows overlap by what I asked
    Given I asked for overlapping windows
    When two windows have come
    Then I can read the overlap's text in both

  Scenario: S-4 A window with no words comes empty
    Given a call is live and no text came in a window's time
    When the clock passes the window's end
    Then I can read an empty window

  Scenario: S-5 Joining mid-call gives what was said before
    Given a call has gone on with text
    When I take the first event
    Then I can read everything said so far

  Scenario: S-6 A call starting after no call is joined
    Given I read that there is no call
    When a call starts
    Then I can read its windows on the same steps

  Scenario: S-7 Words saved late come in the next window
    Given a window was given
    When words that start in it are first read after
    Then I can read them in the next window

  Scenario: S-8 A late reader gets every due window in turn
    Given several windows' time has passed unread
    When I take events
    Then I can read each window once, in order

  Scenario: S-9 The windows left come before the end
    Given windows are due and unread
    When the call ends
    Then I can read each of them, then that the call ended

  Scenario: S-10 After the end no more events come
    Given I read that the call ended
    When I take the next event
    Then I can read that the events are over

  Scenario: S-11 A failed read gives an empty window
    Given a call is live
    When its text cannot be read at a window's end
    Then I can read that window empty, and the next one whole once read again

  Scenario: S-12 A call ending between windows gives its last words
    Given a call is live
    When it ends between two window ends
    Then I can read a last window with its words, then that it ended
```
