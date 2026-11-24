# Live call events: architecture

The components of ADR-003's event source and its follow client, which the
call assistant (`SPEC.md`) reads: what each is responsible for, what it
depends on and who builds it. The app does not change.

## Components

| Component | Responsible for | Depends on (its own ports) |
|---|---|---|
| Call events | An iterator of a call's events for one client: each step gives the next event when it is due, by the client's size and overlap: the next window of text (empty when no words came in it), no call while none is live, then the call's end. Joining a call already under way, its first window holds what was said before. It keeps its own place, as an iterator does. | the live call, a clock |
| Call reader | Answering the live call port: which call is being recorded, its text with times, whether it has ended. The only part that knows the calls folder and `transcript.md`. | the files |
| SSE server | For each connection, asking its event source port with the client's size and overlap and writing what it gives to the wire. It decides nothing. | an event source |
| Follow client | Turning an abstract event source into what the thread reads: what each event says, with the call's text marked as untrusted data. | an event source |
| SSE client | Answering the follow client's event source over the wire. | the server |

## Composition

- The source program composes call events, the call reader, a real clock and
  the SSE server. Tests swap the call reader and clock for fakes.
- The follow program composes the follow client with the SSE client; tests
  swap a fake event source.

```
follow client ──▶ [event source] ◁┄┄ SSE client ──http──▶ SSE server ──▶ [event source] ◁┄┄ call events
call events ──▶ [live call] ◁┄┄ call reader      call events ──▶ [clock]

──▶ uses   ◁┄┄ answers a port   [x] port owned by its consumer
```

## Untrusted text

Call text is what other people said. The follow client marks it as data, so its
reader can keep it apart from instructions.

## Open for the component specs

The language and place of the two programs, chunk size units, telling a call's end, and access to the transport.
