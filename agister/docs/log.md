# Changes

- LAB-458: capacity retries fall back after their waits, record combined spend, and enforce daily budgets across calls; review nodes honor one-at-a-time limits.

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
