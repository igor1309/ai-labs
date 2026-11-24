# Call assistant: architecture

The components that make the call assistant (`SPEC.md`) on the event source
of ADR-003, what each is responsible for, what it depends on and who builds
it. The app does not change.

## Components

| Component | Responsible for | Depends on (its own ports) |
|---|---|---|
| Call events | Giving one client, step by step, the next event of a call when it is due, by the client's size and overlap: the next window of text (empty when no words came in it), no call while none is live, then the call's end. Joining a call already under way, its first window holds what was said before. It keeps its own place in the call. | the live call, a clock |
| Call reader | Answering the live call port: which call is being recorded, its text with times, whether it has ended. The only part that knows the calls folder and `transcript.md`. | the files |
| SSE server | For each connection, asking its event source port with the client's size and overlap and writing what it gives to the wire. It decides nothing. | an event source |
| Follow client | Turning an abstract event source into what the thread reads: what each event says, with the call's text marked as untrusted data. | an event source |
| SSE client | Answering the follow client's event source over the wire. | the server |
| Call assistant skill | The thread's side: shows where speech goes, starts the source and the follow client under Monitor, hints or stays silent per `SPEC.md`, stops both on `callEnded` or when asked. | the follow client's lines; the thread's own provider setting; a shell to start and stop the programs |

## Composition

- The source program composes call events, the call reader, a real clock and
  the SSE server. Tests swap the call reader and clock for fakes.
- The follow program composes the follow client with the SSE client; tests
  swap a fake event source.
- The thread starts and stops both through the skill: by hand, for one call.

```
skill ──▶ follow client ──▶ [event source] ◁┄┄ SSE client ──http──▶ SSE server ──▶ [event source] ◁┄┄ call events
call events ──▶ [live call] ◁┄┄ call reader      call events ──▶ [clock]

──▶ uses   ◁┄┄ answers a port   [x] port owned by its consumer
```

## The thread's side

The skill keeps what the call said for the rest of the call, so a fact
from its start is there near its end. Empty windows while a call is live
mean its text is not coming: the skill says so once and says nothing of
silence otherwise.

## Untrusted text

Call text is what other people said. The follow client marks it as data;
the skill never acts on instructions in it and hints only from the
project and the web.

## Open for the component specs

The language and place of the two programs, chunk size units, joining
mid-call, telling a call's end, and access to the transport.
