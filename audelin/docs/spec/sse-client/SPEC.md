# SSE client

Observer: the follow client, whose event source it answers
(`../follow-client/SPEC.md`). An adapter over the SSE server
(`../sse-server/SPEC.md`).

## Decided

- **No server, a refusal and a lost stream are three outcomes,** each said
  apart: the thread tells the user that following could not start, was
  refused or was lost. None is retried here; a retry would be a decorator at
  the root (rule 6).

```gherkin
Feature: Reading a call's events over the wire

  Scenario: S-1 Each event is read as it comes
    Given I connected
    When the server sends an event
    Then I can read it before the next one comes

  Scenario: S-2 A server that is not running is said
    When I connect and no server answers
    Then I can read that the source is not running

  Scenario: S-3 A refused request is said
    When the server refuses my request
    Then I can read the server's reason

  Scenario: S-4 A lost connection is said
    Given I am reading events
    When the connection drops before the call's end
    Then I can read that the source was lost

  Scenario: S-5 The stream closing after the end is not a loss
    Given I read the call's end
    When the stream closes
    Then I can read that the events are over
```
