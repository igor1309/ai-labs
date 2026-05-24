---
date: 2026-05-19
model: claude-opus-4-7
description: "Surface claude-code's structured-output retry limit so reviewer agents that do tool-heavy investigation can finish without burning their budget on invalid responses"
---

# Claude Code structured-output retry exhaustion

## Findings

### Incident

Run `20260519T072718Z-9ysax432` (task: `swift-vortex/Sources/Feature/CardToCardP2P/Backend/TransferRequest/transfer-request-task.md`). All three agents on anthropic/claude-code; reviewer on `claude-opus-4-7`. Producer succeeded (6m17s, $0.72). Reviewer failed with provider exit code 1 after 4m13s and $1.15.

Reviewer `stdoutReference` from the agent-end / runtime-failure event:

```json
{
  "type": "result",
  "subtype": "error_max_structured_output_retries",
  "duration_ms": 253905,
  "duration_api_ms": 191099,
  "is_error": true,
  "num_turns": 18,
  "stop_reason": "tool_use",
  "errors": ["Failed to provide valid structured output after 5 attempts"]
}
```

Run terminal state: `failed`, exit code `1`, total `$1.8770`.

### Root cause

Claude Code, invoked with `--output-format json --json-schema <reviewer-output-schema>`, allows up to 5 structured-output retry attempts before giving up. The reviewer model spent 18 turns running tool calls (file reads, likely `xcodebuild`) and, when asked to emit the structured verdict, produced output that failed schema validation 5 times in succession.

Two reinforcing factors:

1. **Capable model, open-ended prompt.** `claude-opus-4-7` plus the reviewer prompt (which asks the model to independently execute verification commands) yields aggressive tool use. Each tool call consumes a turn; the structured-output attempts happen later, after the budget is already loaded with tool noise.
2. **Open `verdict` schema.** `reinix://schemas/reviewer-output` requires `verdict` but does not constrain it (no `properties.verdict`, no `enum`). The model has nothing to anchor against — under stress, it may emit shapes the runner refuses to coerce, then re-attempt with similar invalid output.

This is distinct from the OpenAI strict-schema issue and the codex sandbox issue. It is a claude-code runner constraint that surfaces under tool-heavy reviewer behavior on capable models.

### Why it slipped through the producer

The producer ran the same task on the same machine with the same runner and succeeded in 53 turns. Its schema (`producer-output`) is just as open as the reviewer's, but the producer prompt and role are convergent: write code, run the verification command, report. The reviewer prompt is divergent: investigate, judge, and only then summarize. Divergent prompts produce more turns of tool use and a higher chance of running out of structured-output attempts at the end.

## Proposed changes

### 1. Anchor the `verdict` field in the built-in schema

Update `reinix://schemas/reviewer-output` in `src/settings/agent-settings.js` (the same file targeted by `openai-strict-schema-fix.md`) to constrain `verdict` to a known set:

```js
"reinix://schemas/reviewer-output",
{
  type: "object",
  additionalProperties: false,
  required: ["verdict", "verification", "summary"],
  properties: {
    verdict: { type: "string", enum: ["accepted", "rejected"] },
    summary: { type: "string", minLength: 1 },
    verification: VERIFICATION_SCHEMA,
  },
},
```

Both `ConfigBasedReviewFixPolicy` (which already treats only the literal string `"accepted"` as success) and the reviewer prompt assume a small accept/reject vocabulary. Encoding that in the schema gives the model a hard constraint to land on, reducing retry waste.

If callers need finer-grained verdicts (e.g. `accepted-with-notes`), extend the `enum` — but the schema must remain closed.

### 2. Surface `structuredOutputMaxAttempts` (or equivalent) in `models.yaml`

If the installed Claude Code version exposes a flag to raise the retry ceiling, plumb it through:

```yaml
providers:
  anthropic:
    runner: claude-code
    structuredOutputMaxAttempts: 8  # optional
    models:
      medium: { model: claude-sonnet-4-5 }
      high:   { model: claude-opus-4-7  }
```

In `src/provider-cli-executor.js`, append the corresponding flag to the `claude` argument list when the field is present. Validate at startup like `reasoningEffort`. Before implementing, confirm the flag exists in the targeted Claude Code version via `claude --help`. If it does not, escalate to upstream rather than guessing a CLI surface that does not exist.

### 3. Soften reviewer prompt around tool-use budget

`src/prompts/reviewer.md` (verify exact path) currently encourages the reviewer to run verification commands independently. Add an explicit cap and an explicit instruction to emit the structured verdict early if the budget is at risk:

> Limit independent verification to the declared command set. Do not exceed N tool calls total. If you cannot complete verification within that budget, return `verdict: "rejected"` with `verification.ran: false` and a summary that names the obstruction.

This trades depth for reliable termination. Pick `N` empirically; start at `10`.

### 4. Document the failure mode

`README.md` and `docs/reinix-orchestration.md` should call out the trinity of provider-runtime failures observed so far:

- OpenAI strict-mode schema rejection (`openai-strict-schema-fix.md`).
- Codex sandbox blocking verification commands (`codex-sandbox-plumbing.md`).
- Claude Code structured-output retry exhaustion (this doc).

Users picking a provider for the reviewer role should see all three trade-offs before they choose.

### 5. Tests

- Unit: reviewer-output schema accepts `"accepted"`/`"rejected"` and rejects other strings.
- Unit: `ConfigBasedReviewFixPolicy` continues to honor `"accepted"` and falls through to `complete-fail` (or `remediate`) for `"rejected"`.
- Integration (fake provider mode): a fake provider returning `error_max_structured_output_retries` produces a `runtime-failure` event with `providerError` and a useful summary, and the run terminates cleanly.

## Workaround until this lands

Two independent levers, either suffices:

1. **Drop reviewer to `medium`.** Edit `~/.reinix/agents.yaml`:

   ```yaml
   reviewer:
     provider: anthropic
     model: medium          # claude-sonnet-4-5 — less aggressive tool use
     prompt:
       ref: reinix://prompts/reviewer
     output:
       schemaRef: reinix://schemas/reviewer-output
   ```

   Trade-off: weaker reasoning depth in the verdict.

2. **Inline a closed-enum reviewer schema** so the model has a hard target to land on, even without changing the model tier:

   ```yaml
   reviewer:
     provider: anthropic
     model: high
     prompt:
       ref: reinix://prompts/reviewer
     output:
       schema:
         type: object
         additionalProperties: false
         required: [verdict, verification, summary]
         properties:
           verdict: { type: string, enum: [accepted, rejected] }
           summary: { type: string, minLength: 1 }
           verification:
             type: object
             additionalProperties: false
             required: [ran, command, exitCode]
             properties:
               ran: { type: boolean }
               command: { type: [string, "null"] }
               exitCode: { type: [integer, "null"] }
   ```

   This shape also satisfies OpenAI strict mode, so it is portable if you later flip provider back to `openai`.
