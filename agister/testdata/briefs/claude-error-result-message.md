# A Claude Code error result is not reported as "success"

Observed on 2026-10-02 (run 20261002T055359Z-38363e): Claude Code ended a
turn on its session limit with a result event whose `subtype` is
`success` while `is_error` is `true` and `api_error_status` is `429`:

    {"type":"result","subtype":"success","is_error":true,
     "result":"You've hit your session limit · resets 12:30pm (Europe/Moscow)",
     "api_error_status":429, "stop_reason":"stop_sequence", ...}

The `claudecode` adapter classified it correctly (`rate_limited`), but
built the message from the subtype: "runtime reported success: You've
hit your session limit ...". A failed turn's message must not call it a
success.

## Change

In `internal/adapters/runtime/claudecode` (`classify`), word a result
with `is_error: true` whose subtype is `success` as an error, e.g.
"runtime reported an error (429): <result text>"; keep the subtype in
the message when it names an error (`error_max_turns`, budget, ...).
Classification is unchanged.

## Tests

A reducer/reconciliation test with the event above (as it was observed)
asserting status failed, class `rate_limited`, a message that contains
the result text and the status, and does not contain "success". Add the
observation to `docs/findings.md`.

Run the full check from `agister/` (its AGENTS.md) and `node --test
pages/tests/*.test.js` from `agister/`. Report each command with its exit
code and final line, and list every file you changed.
