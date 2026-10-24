# Changes

- LAB-534: workflow items run as child runs in their caller, with qualified calls, private child outputs and tests debate settings in home.

- LAB-467: workflows branch on results and repeat repairs with explicit state
  and a pass limit; failed tests can return to the builder's session.

- LAB-496: a capacity retry tells its reported session "Go on."; a call
  makes up to five capacity turns, waiting 30 s, 1 min, 3 min and 5 min.

- LAB-465: `agister check` refuses what `agister run` does not run yet
  (a branch, a repeat, a runtime with no turn, an input from a source a
  run does not take), in run's words, and a step that gives a file's
  text where its process reads a path.

- LAB-458: a call at capacity retries after 30 s, 1 min and 3 min, then
  runs on its agent's `fallback` (codex-sol-61 falls back to claude-opus);
  a parallel block's `max` runs the review's nodes one at a time.

- LAB-357: a codex turn's cost is priced through ccusage, so a cost
  limit and the daily budget spend it; a resumed turn's usage is its
  own, and each call records its cost's source.

- LAB-356: home may set a daily cost budget across runs; calls stop on a
  spent day, and claude-code turns get no more than remains.

- LAB-336: a call on claude-code is kept to its process's cost limit, and
  a resumed turn's cost is its own, no longer the session's to date.

- LAB-324: each call records its permission plan and resolved process
  environment; reuse requires the same environment.

- LAB-322: a run keeps the bytes of each settings file its record
  names, beside the record, and its export takes them.

- LAB-321: each call records the settings files it ran under, with
  their digests, and a reuse takes a call only under the same ones.

- LAB-320: Calls record the HEAD they left and pinned calls keep their changes as a patch, included in exports and reuse. Continuations and session steps accept the HEAD a call committed.
