---
date: 2026-05-19
model: claude-opus-4-7
description: "Fix built-in output schemas to satisfy OpenAI strict structured-output mode used by the codex runner"
---

# OpenAI strict schema fix for built-in agent output schemas

## Findings

### Incident

Run `20260519T062833Z-cylhqxq5` (task: `swift-vortex/Sources/Feature/CardToCardP2P/Backend/TransferRequest/transfer-request-task.md`).

Producer (anthropic/claude-code/claude-sonnet-4-5) completed in 8m59s ($1.19). Reviewer (openai/codex/gpt-5.5) failed immediately on startup:

```
ERROR: {
  "type": "error",
  "error": {
    "type": "invalid_request_error",
    "code": "invalid_json_schema",
    "message": "Invalid schema for response_format 'codex_output_schema': In context=(), 'additionalProperties' is required to be supplied and to be false.",
    "param": "text.format.schema"
  },
  "status": 400
}
```

Run terminal state: `failed`, duration `09:15`, exit code `1`.

### Root cause

The codex runner writes the configured agent output schema verbatim to a temp file and passes it via `--output-schema` (see `src/provider-cli-executor.js:65-77`). OpenAI's strict structured-output endpoint enforces two rules that the built-in schemas violate:

1. **Every object node must declare `additionalProperties: false`** — this is what the 400 above is reporting.
2. **Every key in `properties` must also appear in `required`** — optional fields are not allowed; they must be modeled as nullable (`"type": ["string", "null"]`). Even after fixing rule 1, the next codex call would fail on this rule.

The built-in schemas live in `src/settings/agent-settings.js:16-55`. A repo-wide grep for `additionalProperties` returns nothing under `src/` or `tests/`, confirming the constraint is unmodeled today.

Current built-in schemas:

- `VERIFICATION_SCHEMA` — no `additionalProperties`; `command`/`exitCode` are in `properties` but not in `required`.
- `reinix://schemas/producer-output` — no `additionalProperties`; `required` lists `artifact` but `properties` does not declare it.
- `reinix://schemas/reviewer-output` — no `additionalProperties`; `required` lists `verdict` but `properties` does not declare it.
- `reinix://schemas/remediator-output` — no `additionalProperties`; `required` lists `task` but `properties` is absent entirely.

The producer phase succeeded because the Claude Code runner does not enforce these constraints; the failure is OpenAI-specific.

## Proposed patch

Replace `SUPPORTED_SCHEMA_REFS` and `VERIFICATION_SCHEMA` in `src/settings/agent-settings.js:16-55`:

```js
const VERIFICATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ran", "command", "exitCode"],
  properties: {
    ran: { type: "boolean" },
    command: { type: ["string", "null"] },
    exitCode: { type: ["integer", "null"] },
  },
};

const SUPPORTED_SCHEMA_REFS = new Map([
  [
    "reinix://schemas/producer-output",
    {
      type: "object",
      additionalProperties: false,
      required: ["artifact", "verification"],
      properties: {
        artifact: { type: "string" },
        verification: VERIFICATION_SCHEMA,
      },
    },
  ],
  [
    "reinix://schemas/reviewer-output",
    {
      type: "object",
      additionalProperties: false,
      required: ["verdict", "verification", "summary"],
      properties: {
        verdict: { type: "string", minLength: 1 },
        summary: { type: "string", minLength: 1 },
        verification: VERIFICATION_SCHEMA,
      },
    },
  ],
  [
    "reinix://schemas/remediator-output",
    {
      type: "object",
      additionalProperties: false,
      required: ["task"],
      properties: {
        task: { type: "string", minLength: 1 },
      },
    },
  ],
]);
```

### Changes per schema

- **`VERIFICATION_SCHEMA`** — add `additionalProperties: false`; promote `command`/`exitCode` to `required` and make them nullable so they remain optional in spirit.
- **`producer-output`** — add `additionalProperties: false`; declare missing `artifact` property.
- **`reviewer-output`** — add `additionalProperties: false`; declare missing `verdict` property.
- **`remediator-output`** — add `additionalProperties: false`; declare `task` in `properties`.

## Caveats / decisions to verify

1. **`minLength` under OpenAI strict mode** is supported on plain `string` only, not on `["string", "null"]`. The patch keeps `minLength` only on plain string fields.
2. **`integer` is accepted** by OpenAI strict mode alongside `number`.
3. **Inline user schemas** (`output.schema` in `agents.yaml`) still bypass these constraints. Two options:
   - Permissive: leave them alone — user's problem if they target codex.
   - Strict: add `assertOpenAIStrictCompatible(schema)` in `executeCodex` (`src/provider-cli-executor.js`) that fails fast before invoking the CLI.
   Recommendation: ship the schema patch first; add the validator behind a separate change.
4. **Downstream Ajv validation** in `src/runtime-output.js` (`validateRuntimeOutput`) will now reject unexpected top-level keys in `structured_output.*`. Confirm the codex/claude-code runners never inject stray fields into that wrapper.
5. **Tests** — search `tests/` for fixtures asserting on the literal schema shape (Ajv compiled output, JSON snapshots) and update them. Add a regression test that the codex runner is handed a schema whose root and every nested object declares `additionalProperties: false` and whose `properties` keys are a subset of `required`.

## Workaround for current users (no reinix change required)

In `~/.reinix/agents.yaml`, override the reviewer's `output` with an inline strict-compliant schema:

```yaml
reviewer:
  provider: openai
  model: high
  prompt:
    ref: reinix://prompts/reviewer
  output:
    schema:
      type: object
      additionalProperties: false
      required: [verdict, verification, summary]
      properties:
        verdict: { type: string, minLength: 1 }
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

Apply the same shape to producer and remediator if either is routed through codex.
