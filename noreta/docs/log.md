# Log

## 2026-09-15
- First adapter: `claudeCodeSessions` reads the JSONL transcripts under
  `~/.claude/projects` and implements `SessionSource`, so the domain runs on real
  data for the first time. Discovery only — no runtime state, so every session
  reads as inactive. The project directory's name is the workspace path with its
  separators replaced and cannot be decoded back, so workspace and branch come
  from the records; the newest context record wins, since the branch moves with
  the checkout. Real data drove two of the six cycles: Claude Code writes
  `gitBranch: "HEAD"` when no branch is checked out (207 of the first 400
  transcripts), which is not a branch name, and a running session's last line can
  be half written, which was aborting the whole read. Against 793 project
  directories: 1540 sessions in 5.8s, 888 with a workspace that is gone. That
  5.8s is every transcript parsed end to end — identity and last activity do not
  need the whole file, and nothing has been done about it yet.
- Close the one open question on search: a `TranscriptSource` that throws no
  longer aborts the whole search. `searchSessions` returns
  `{ matches, unreadable }`, so an unreadable session is reported instead of
  silently vanishing from the results — the alternative, skipping it quietly,
  leaves nobody able to tell "no match" from "could not read". New QA scenario
  "A transcript cannot be read" under its own rule; the five existing call sites
  read `.matches`. Nothing renders the warning yet: there is still no renderer.
- Codex review of "Access older sessions", accepted with a correction: both
  deleted-worktree scenarios were called pinned, but only one is. Breaking the
  view so it folds a deleted worktree into its repository root fails "Its worktree
  has been deleted" and leaves "Open a session from a deleted worktree" green — so
  the retention half is real and the detection half is not. Both are now in the
  README's pinned table, described by what their tests do and do not establish.
  Also derived `olderSessions` from the same predicate as `recentSessions` instead
  of restating it as a hand-written complement.
- Implement "Access older sessions", the last of the seven QA features to get a
  domain implementation: `olderSessions` is the complement of `recentSessions`
  over the same list, and sessions carry `workspaceOnDisk`, so a deleted worktree
  keeps its path and is reported as gone rather than collapsed into the
  repository root. The coverage test now requires the feature map to account for
  *every* feature in `docs/qa.md` — adding a scenario to the document fails the
  suite until it has a test, verified by adding one. Every feature has a domain
  model and a test per scenario; none has an adapter, and nothing yet reads a
  real Claude Code or Codex session.
- Make the session projections compose: `recentSessions` took a `SessionSource`
  while `activeSessions` and `groupSessions` took a list, so the three could not
  be chained. All three are list-to-list now, and `viewSessions` is the one
  function that reads a source.
- Codex review of "Organize sessions", accepted: grouping rebuilt each group's
  array on every insertion, which is quadratic and worst exactly where it is most
  likely — grouping by agent puts every session in one of two or three groups.
  Measured 45/372/1754ms for 10k/20k/40k sessions before, 1/0/4ms after. The
  regression check measures elapsed time explicitly: `it`'s timeout does not
  interrupt synchronous work, so the first attempt passed against the quadratic
  shape and proved nothing.
- Implement "Organize sessions": `src/grouping.ts` partitions a session list by
  repository, workspace or agent, and `activeSessions` filters by active state.
  Sessions carry a `workspace` — the working directory, which for a worktree is
  the worktree's own path, not the repository root. A group's `name` is
  `undefined` when its sessions have no such context: they still form one group,
  because the rule is that every session lands in exactly one, and labelling
  that group is the reader's job. Each grouping test asserts the partition
  itself — every session placed, none placed twice — not just the memberships.
- Codex review of "Find a session", accepted: search checked a session's
  transcript before its agent, repository and branch, so a metadata-only query
  read and sorted every transcript, and a transcript source that threw lost a
  session whose agent had matched. Context now short-circuits and the transcript
  is read straight from the source without the ordering pass. Reworked the four
  Examples-row tests first: they all shared one session matching on every
  dimension, so no single-dimension bug could fail them.
- Implement "Find a session": `src/search.ts` matches a query against a session's
  agent, repository, branch and message text. Its second rule names sessions
  "outside the recent history", so this slice also introduces the window —
  `recentSessions(source, recency)` is the default view (active sessions at any
  age, inactive ones inside the cutoff) while `viewSessions` stays unfiltered and
  is what search reads. That un-pins "A recently inactive session exists": it now
  fails if the window is removed.
- Strengthen the coverage check for Scenario Outlines: each Examples row is
  expected as its own test, named `<outline>: <query>`. The first attempt only
  asserted the query string appeared somewhere in the file, which passed for the
  wrong reason — the session setup contained the same literals.
- Codex review of "Follow an active session": took the finding's fix rather than
  hedging the claim again. Following now pushes through a `SessionChanges` port —
  "the sources may have changed", to be implemented by a watcher or poller — so
  the scenarios assert that an update *arrives* at an open session rather than
  that a re-read would have found one. No test calls a reader; deleting the
  subscription fails all four. Declined the finding's claim that a stale-forever
  view passed the old tests: a caching reader failed all four of those too.
- Implement "Follow an active session": `src/follow.ts` follows one session by
  re-reading its state and transcript, so an open session picks up new messages
  and runtime transitions.
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
