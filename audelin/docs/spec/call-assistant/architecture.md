# Call assistant: architecture

The components that make the call assistant (`SPEC.md`) on the event source
of ADR-003, what each is responsible for, what it depends on and who builds
it. The app does not change.

## Components

| Component | Responsible for | Depends on (its own ports) |
|---|---|---|
| Call events | Giving a client the next event of a call when it is due, as an iterator made with the client's size and overlap: a `chunk` (the next window, empty when no words came in it), `noCall` while no call is live, then `callEnded`. It keeps its own place, as an iterator does. | the live call, a clock |
| Call reader | Answering the live call port: which call is being recorded, its text with times, whether it has ended. The only part that knows the calls folder and `transcript.md`. | the files |
| SSE server | Making a call events iterator for each connection with the client's size and overlap, and writing what it gives to the wire. It decides nothing. | call events |
| Follow client | Turning an abstract event source into what the thread reads: one line per event, a chunk's text fenced as untrusted data. | an event source |
| SSE client | Answering the follow client's event source over the wire. | the server |
| Call assistant skill | The thread's side: shows where speech goes, starts the source and the follow client under Monitor, hints or stays silent per `SPEC.md`, stops both on `callEnded` or when asked. | the follow client's lines |

## Composition

- The source program composes call events, the call reader, a real clock and
  the SSE server. Tests swap the call reader and clock for fakes.
- The follow program composes the follow client with the SSE client; tests
  swap a fake event source.
- The thread starts and stops both through the skill: by hand, for one call.

```
skill ──▶ follow client ──▶ [event source] ◁┄┄ SSE client ──http──▶ SSE server ──▶ call events
call events ──▶ [live call] ◁┄┄ call reader      call events ──▶ [clock]

──▶ uses   ◁┄┄ answers a port   [x] port owned by its consumer
```

## Untrusted text

Call text is what other people said. The follow client marks it as data;
the skill never acts on instructions in it and hints only from the
project and the web.

## Open for the component specs

The language and place of the two programs, chunk size units, joining
mid-call, telling a call's end, and access to the transport.
