# Log

## 2026-09-15
- Implement "Follow an active session": `src/follow.ts` returns a reader that
  re-reads both sources on every call, so an open session picks up new messages
  and runtime transitions. All four scenarios falsify a snapshot-once reader,
  which is the implementation they exist to rule out. Pull, not push — the
  SSE/WebSocket transport in the implementation notes sits above this.
- Extract `src/ordering.ts`: `sessions.ts` and `transcript.ts` had each grown
  their own comparator and NaN-safe time reader, so the rule that an unreadable
  timestamp sorts oldest lived in two places. It now lives in one, parameterised
  by direction; `grep -rn "Number.isNaN" noreta/src/` returns a single hit.
- Codex review of "Read a session": messages now carry a speaker, because the
  rule is "session history preserves *conversational* order" and a transcript
  that cannot tell the user from the agent is not a conversation. Declined the
  demand for tool arguments, results and outcomes — no scenario asks what a tool
  did, only that a tool call is distinguishable from conversation.
- Implement "Read a session": `src/transcript.ts` reads a session's entries
  oldest-first through a `TranscriptSource` port, preserving messages, tool
  calls and file diffs as distinct kinds rather than flattening them. This slice
  is ordering and preservation only: nothing renders a transcript yet, so the
  two semantic-presentation outcomes are not verified — a renderer could still
  print every diff as plain text and pass the suite. See the pinned-scenarios
  table in the README.
- Machine-check the scenario-to-test mapping: `tests/qa-coverage.test.ts` parses
  `docs/qa.md` and asserts each implemented feature's test file declares exactly
  its scenario titles, so a renamed or dropped scenario fails CI instead of
  quietly widening the gap between the QA doc and the suite.
- Codex review of "See recent sessions", both findings accepted: `lastActivityAt`
  is required rather than optional, so the "inactive sessions expose their last
  activity" rule is carried by the type instead of by whatever the caller
  remembers to pass; and the ordering comparator is total, because `?? 0` does
  not catch the `NaN` an Invalid Date produces and one malformed record silently
  defeated ordering for every other session.
- Implement "See recent sessions": sessions carry `lastActivityAt`, the view
  surfaces it, and the default view is ordered most-recent-first. Test helpers
  move to `tests/session-source.ts`. "A recently inactive session exists" is
  pinned rather than driven — nothing filters the default view by recency until
  "Access older sessions" introduces the cutoff.
- Implement the first QA feature, "See active sessions": `src/sessions.ts` maps
  observed sessions to the active/waiting view a session list is drawn from, and
  `tests/active-sessions.test.ts` carries one test per Gherkin scenario, named
  after it. Runtime discovery is a port (`SessionSource`) owned by its client —
  the real Claude Code and Codex adapters are not part of this slice, so the two
  discovery scenarios are pinned rather than driven: they constrain the adapters
  when those arrive and cannot fail today.
- Promote noreta from `research/noreta/` to a top-level project: collect the existing docs under `docs/`, add this README and log, and register the project across the LOC dashboard, the README Components table, and the products page.
- Establish the product definition: vision, name brief, user stories and QA scenarios for the read-only Mac MVP, exploratory implementation notes, and backlog.
