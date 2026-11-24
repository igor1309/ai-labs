# Call assistant: architecture

The components that make the call assistant (`SPEC.md`) on the event source
of ADR-003, what each is responsible for, what it depends on and who builds
it. The app does not change.

## Components

| Component | Responsible for | Depends on (its own ports) |
|---|---|---|
| Windowing | Cutting the next window of a call's text from where the last one ended, by the size and overlap a client gives. A pure function; a window of time with no words is an empty window, not a missing one. | nothing |
| Feed | Serving one client: says `noCall` while no call is live, then a `chunk` each time a window is due, then `callEnded`. Its cursor lives in the one client's loop. | the live call, a clock, windowing |
| Call reader | Answering the live call port: which call is being recorded, its text with times, whether it has ended. The only part that knows the calls folder and `transcript.md`. | the files |
| SSE server | Taking a client's request (size, overlap) to a feed and its events to the wire. | a feed |
| Follow client | Turning an abstract event source into what the thread reads: one line per event, a chunk's text fenced as untrusted data. | an event source |
| SSE client | Answering the follow client's event source over the wire. | the server |
| Call assistant skill | The thread's side: shows where speech goes, starts the source and the follow client under Monitor, hints or stays silent per `SPEC.md`, stops both on `callEnded` or when asked. | the follow client's lines |

## Composition

- The source program composes windowing, feed, call reader, a real clock and
  the SSE server. Tests swap the call reader and clock for fakes.
- The follow program composes the follow client with the SSE client; tests
  swap a fake event source.
- The thread starts and stops both through the skill: by hand, for one call.

```
skill ──▶ follow client ──▶ [event source] ◁┄┄ SSE client ──http──▶ SSE server ──▶ feed
feed ──▶ windowing      feed ──▶ [live call] ◁┄┄ call reader      feed ──▶ [clock]

──▶ uses   ◁┄┄ answers a port   [x] port owned by its consumer
```

## Untrusted text

Call text is what other people said. The follow client marks it as data;
the skill never acts on instructions in it and hints only from the
project and the web.

## Open for the component specs

The language and place of the two programs, chunk size units, joining
mid-call, telling a call's end, and access to the transport.
