# Call events

Observer: the SSE server, which gives each client the events of the call
being recorded. An iterator
over a live call and a clock, both its own ports; it knows no file and no
transport.

## Decided

- **The source and follow programs are Go, in `audelin/feed/`,** a folder of
  their own beside the app's Swift package: small command-line programs that
  need the standard library's HTTP and no app build. They read
  `transcript.md`, whose format is the outside contract they rely on.
- **Size and overlap are the client's,** in call time; this iterator sets no
  values: the client cuts the windows it needs.
- **Call time zero is the call's start the call reader gives,** true to the
  minute, a window up to a minute early accepted; a window is
  due when the clock passes its end, not when text arrives, so a call whose
  text stopped still gives windows, empty.
- **A window marks the words of its overlap as context, apart from its new
  words,** so a client neither hints twice nor takes an overlap alone for
  text still coming.
- **A part goes in every window its start falls in.** Regular windows
  exclude their end. Words first read after their window was given go in the
  next window; revisions of words already given are not sent.
- **No call is said once;** the next event waits for a call to start, so a
  waiting client is not woken for nothing.
- **Joining a call under way, the first event is everything said so far;**
  windows go on from the last window end passed.
- **Falling behind, every due window is given in turn, none dropped,** so the
  client decides what to read. At the call's end the windows left come
  first. The last part-window includes every unsent part from the ended
  snapshot, extending its end past any part starting at or after the time
  the end was observed.
- **A failed read gives the due window empty and is read again at the next
  step:** the three events carry no failure; a lasting failure reads as
  text not coming, which the call assistant says once. Before finding a call, a failed read keeps
  the iterator waiting and discovery retries on its clock.

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
    Then I can read each of them, then that the call ended, then nothing

  Scenario: S-11 A failed read gives an empty window
    Given a call is live
    When its text cannot be read at a window's end
    Then I can read that window empty, and the next one whole once read again

  Scenario: S-12 A call ending between windows gives its last words
    Given a call is live
    When it ends between two window ends
    Then I can read a last window with its words, then that it ended

  Scenario: S-13 New words can be told from the overlap
    Given I asked for overlapping windows
    When a window comes after another
    Then I can read which words are new and which repeat the overlap

  Scenario: S-14 An overlap alone reads as no new words
    Given the last window had words in its overlap
    When no words came after them
    Then I can read that the window has no new words
```
