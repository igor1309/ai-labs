# LAB-45 branch review round 2 fixes

Review rulings (code_review run 20261001T232126Z-6bde75). Make each fix as
its action says, with its tests. The owner item about the supervisor seam
is not part of this brief.

## 1. Prove that OpenCode tool events reach the recorded run (major)

Action: Extend the existing successful OpenCode CLI test (agister/cmd/agister/opencode_settings_test.go) to assert that events.jsonl contains both TOOL_REQUESTED and TOOL_RESULT for call_1, including call ID, tool name, input and result status.

Why: The trace is concrete and complete. The README promises that tool calls are recorded, and the fake emits a completed bash call, call_1. RunTurn forwards reducer events to sink.Event, which writes them to events.jsonl. But TestToolCallsAreReported calls only Stream.Reduce, the conformance suite returns early when ToolCalls is false, and the CLI test never reads events.jsonl. If RunTurn stopped forwarding these events, no test would fail. The change introduced this claimed behaviour without a test at the level where the claim is made.

## 2. Keep APIError statusCode so that a 429 is classified as rate_limited (minor)

Action: Keep the status code and typed error name from error.data, classify on them before falling back to message text, and add reducer and reconciliation tests whose error messages contain no status number.

Why: The case is concrete: an error event with name APIError, message 'Too Many Requests' and statusCode 429, followed by exit code 1. The trace shows reduction keeping only the message (opencode.go:353–360) and classify falling through to runtime_error (opencode.go:480–487). calls.go:800 then concludes the call with that classification. The reviewer reports that OpenCode 1.18.33's error schema carries statusCode separately from the message. The change introduced the bug.

## 3. Keep reported usage and cost when a resumed session is rejected (minor)

Action: Move the usage and cost transfer above the resume-mismatch guard, and extend the existing mismatch tests to assert nonzero usage and cost.

Why: The case uses an existing fake scenario. SCENARIO:mismatch with ResumeSessionID="ses_1" reports a different session and two steps totalling 2,200 input tokens, 120 output tokens and about $0.0033. The trace shows the mismatch return at opencode.go:410 coming before the usage transfer at line 413. calls.go:787 then stores the result with no reported usage and unknown cost. This contradicts the adapter's own comment that cost is kept however the turn ends. The change introduced the bug.

Do not call a real model provider. Run the full check from `agister/`
(its AGENTS.md) and `node --test pages/tests/*.test.js`. Report each
command with its exit code and final line, and list every file you
changed.
