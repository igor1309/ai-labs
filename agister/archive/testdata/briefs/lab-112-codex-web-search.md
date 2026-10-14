# LAB-112: different Codex web searches count as one repeated tool call

## Gap

A Codex agent that makes five different web searches in a row is ended
as stale. Codex's `item.started` for a `web_search` item carries an
empty query; the query arrives only on `item.completed`:

```json
{"type":"item.started","item":{"id":"item_19","type":"web_search","query":"","action":{"type":"other"}}}
{"type":"item.completed","item":{"id":"item_19","type":"web_search","query":"site:github.com/openai/codex \"handle_patch_apply_end\" \"FileChange\"","action":{"type":"search","query":"site:github.com/openai/codex \"handle_patch_apply_end\" \"FileChange\""},"results":[]}}
{"type":"item.completed","item":{"id":"item_18","type":"web_search","query":"https://raw.githubusercontent.com/openai/codex/main/x.rs","action":{"type":"open_page","url":"https://raw.githubusercontent.com/openai/codex/main/x.rs"},"results":[]}}
```

The Codex adapter (`agister/internal/adapters/runtime/codex/codex.go`,
`item.started`) reports the call at its start, so every search has the
same tool and the same empty input, and `stale.repeated_tool_calls`
(`agister/internal/app/stale.go`) counts different searches as one
repeated call.

Observed 2026-10-07: run `20261007T001320Z-10b5a8`, the adversarial
node of `code_review` run `20261007T001319Z-83ac0d`, ended `failed,
budget_exhausted: stale: no progress, the agent made the same tool call
5 times in a row (stale.repeated_tool_calls): web_search`, though its
searches had different queries.

## What to do

In the Codex adapter only: a tool call is reported with the input that
identifies it. A `web_search` item whose start carries no query is not
reported at its start; it is reported when the item completes, started
and finished together, with the completed item's input (its query, and
its action where the query alone does not identify it). The recorded
`TOOL_REQUESTED` event likewise carries the real input. A start that
does carry a query is reported at the start, as today, and not again at
completion. Identical searches in a row still count as the same call.

Update the package comment where it says how tool calls are reported.
The core, the other adapters and the staleness rules are unchanged.

## Done when

- A fixture test of the Codex adapter, with lines of the shape above,
  shows searches with different queries reported as different calls
  (different `Input`), identical ones as the same, each started once and
  finished once, in order.
- A test through the application layer's turn watch shows five tool
  calls of one tool with different inputs do not reach
  `stale.repeated_tool_calls` 5, if no test shows it already; say which
  test does.

## Constraints

- Regular committed tests only: fakes, fixtures, `t.TempDir()`. No
  mutation or revert checks.
- Match the surrounding code.

## Check

From `agister/`: `test -z "$(gofmt -l .)" && go vet ./... && go test -count=1 -timeout 1m ./... && go test -race -count=1 -timeout 1m ./internal/app/...`.

List every file you changed.
