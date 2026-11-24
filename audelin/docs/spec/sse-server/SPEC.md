# SSE server

Observer: a client of the event source on this Mac (ADR-003); here the SSE
client (`../sse-client/SPEC.md`). An adapter: it asks its event source port
and writes what it gives; it decides nothing.

## Decided

- **Server-sent events over HTTP, on loopback only, open to this Mac's
  processes:** its clients are threads on this Mac, and any process here can
  already read `transcript.md`, so loopback adds no reader that had none.
- **A request names the window size and overlap;** one without a whole
  size above zero and a whole overlap from zero to below it is refused with
  what was wrong.
- **Each event is sent as it comes,** never held for the next.
- **The program ends when its last client leaves,** so a thread starting it
  never has to stop it, and one thread's stop never cuts another's stream.
- **Each connection steps its own source,** so clients asking different
  windows do not affect each other.

```gherkin
Feature: Serving a call's events

  Scenario: S-1 Each event is sent as it comes
    Given a client connected
    When the source gives an event
    Then the client can read it before the next one comes

  Scenario: S-2 A request that cannot be served is refused
    When a client asks for windows that cannot be cut
    Then the client can read what was wrong with its request

  Scenario: S-3 Two clients get their own windows
    Given two clients connected with different sizes
    When time passes
    Then each can read the windows it asked for

  Scenario: S-4 The stream ends after the call's end
    Given a client connected
    When the source gives the call's end
    Then the client can read the end, and the stream closes

  Scenario: S-5 A client leaving lets its source go
    Given a client connected, its next event awaited
    When it disconnects
    Then later clients are served as before, with nothing left waiting

  Scenario: S-6 Only this Mac can connect
    When a client connects through this Mac's network address
    Then it cannot connect

  Scenario: S-7 The last client leaving ends the program
    Given two clients connected
    When one leaves, then the other
    Then the other reads on until it leaves, and then the program is gone
```
