# Log

## 2026-09-15
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
