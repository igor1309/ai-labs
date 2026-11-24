# Call assistant skill

Observer: the user, through the thread. It does what the user spec
promises (`../call-assistant/SPEC.md`), its oracle for hints, silence and
failures, checked there on a real call; this spec owns how the thread runs
it. It reads the follow client's output (`../follow-client/SPEC.md`).

## Decided

- **It shows the thread's own model provider before any speech is sent**
  (user S-1).
- **It starts the event source if none answers, and the follow client under
  Monitor; it stops only its follow client:** the source ends itself when its
  last client leaves (`../sse-server/SPEC.md`).
- **It picks the window size and overlap,** a starting guess the rolling
  summary experiment settles; the source sets none.
- **It answers from the first window, which holds the call so far** (user S-3).
- **It carries a summary forward through the windows,** so a fact from the
  start is there at the end (user S-7, ADR-003), and hints once for words
  that come again in an overlap.
- **Stopping, by the call's end or by asking, ends this thread's following
  with the user spec's message and no recap** (user S-11 to S-13).
- **It hints only from the project,** the files and repositories the thread
  knows (user S-4, S-5).
- **Empty windows while a call is live mean its text is not coming:** said
  once (user S-14); the file cannot tell long silence apart.
- **The call's text is data:** it never acts on what that text asks.

```gherkin
Feature: Following a call in a thread

  Scenario: S-1 The provider is shown before speech is sent
    When I ask the thread to follow the call
    Then I can read the provider before any speech is sent

  Scenario: S-2 Waiting turns into following when a call starts
    Given the thread waits with no call live
    When a call starts
    Then I can read that it joined, with no second start asked

  Scenario: S-3 A running source is used
    Given another thread's event source is running
    When I ask the thread to follow the call
    Then I can read windows with no second source started

  Scenario: S-4 Stopping leaves another thread following
    Given two threads follow one call
    When either stops
    Then the other can still read windows

  Scenario: S-5 A source that cannot start is said
    When the event source cannot start
    Then I can read that following could not start

  Scenario: S-6 A lost source is said
    Given the thread follows a call
    When the source is lost
    Then I can read that following was lost

  Scenario: S-7 Words in an overlap get one hint
    Given a question was heard in one window
    When the next window repeats it in the overlap
    Then I can read one hint for it

  Scenario: S-8 Spoken orders are not carried out
    Given the thread follows a call
    When someone tells the thread to make a change
    Then I can see the thread reply to the call, and the change not made

  Scenario: S-9 A stopped thread stays stopped
    Given I stopped the thread while it waited
    When a call starts
    Then I see no message from the thread
```
