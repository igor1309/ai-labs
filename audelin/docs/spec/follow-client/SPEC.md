# Follow client

Observer: the thread, which reads what the follow client prints under
Monitor (`../call-assistant-skill/SPEC.md`). It reads an event source of
its own and knows no transport.

## Decided

- **Each event is printed at once, in one write,** so Monitor, which turns
  lines printed together into one notification, wakes the thread once per
  event.
- **The call's text is set apart as untrusted data,** every word kept, as an
  escaped JSON string in a record marked untrusted, new words apart from
  overlap context: no word can close the mark or pass for a record of its own.
- **The call's end and a lost source end it,** saying which, so the thread
  can tell the user.

```gherkin
Feature: Telling the thread a call's events

  Scenario: S-1 A window with words can be read apart from instructions
    When a window with words comes
    Then the thread can read every word, marked as what the call said

  Scenario: S-2 An empty window is said
    When an empty window comes
    Then the thread can read that no words came in it

  Scenario: S-3 Waiting for a call is said
    When there is no call
    Then the thread can read that no call is live

  Scenario: S-4 The call's end ends following
    When the call's end comes
    Then the thread can read that the call ended, and nothing more comes

  Scenario: S-6 A lost source ends following
    When the source is lost
    Then the thread can read that it was lost, and nothing more comes

  Scenario: S-7 Words that mimic the marks stay data
    When a window's words hold the mark that ends the call's text
    Then the thread can read every word, still inside the call's text

  Scenario: S-8 Spoken orders stay data
    When a window's words give the thread an order
    Then the thread can read the order only inside the call's text

  Scenario: S-9 Waiting, then a call, is said in turn
    When no call is live, then a call starts
    Then the thread can read that it waits, then the call's first window
```
