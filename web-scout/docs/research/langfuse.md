---
date: 2026-03-02
model: claude-sonnet-4-6
description: "Langfuse observability for web-scout smoke script — research and integration approach"
---

# Langfuse Observability for web-scout

## What Langfuse Is

Open-source LLM observability platform. Instrument code once, get a UI showing full traces: every LLM call with its prompt, output, token counts, latency, and cost. For agents, the trace is a nested call tree — agent → tool call → model response.

## JS/TS Integration with Claude Agent SDK

The Claude Agent SDK + Langfuse in JS/TS works via OpenTelemetry auto-instrumentation:

```bash
npm install @arizeai/openinference-instrumentation-anthropic @langfuse/otel @opentelemetry/sdk-node
```

```js
import { NodeSDK } from "@opentelemetry/sdk-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { AnthropicInstrumentation } from "@arizeai/openinference-instrumentation-anthropic";
import Anthropic from "@anthropic-ai/sdk";

const instrumentation = new AnthropicInstrumentation();
instrumentation.manuallyInstrument(Anthropic);

const sdk = new NodeSDK({
  spanProcessors: [new LangfuseSpanProcessor()],
  instrumentations: [instrumentation],
});
sdk.start();
```

After that, normal Anthropic SDK calls (which the Claude Agent SDK wraps) are automatically captured. No manual span tracking needed.

Caveat: the Langfuse Claude Agent SDK integration page documents Python only. The JS path goes through the lower-level Anthropic instrumentation — it should still capture the underlying API calls.

Required env vars (Langfuse side):
```
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_BASE_URL=http://localhost:3000   # self-hosted
```

## Progressive Integration Approach

Principle: no upfront sign-up, no declaring Langfuse everywhere. Opt-in side effect only.

### Step 1 — Zero code, zero sign-up

Self-host Langfuse locally via Docker Compose (postgres + langfuse-server). Full UI on `localhost`. Aligns with the project's existing local-stack approach (SearXNG is already Docker).

Official compose: https://langfuse.com/docs/deployment/local

### Step 2 — Minimal code instrumentation

Add ~5 lines of OTel setup to the smoke script (see snippet above). The script behavior is unchanged — it just emits spans as an opt-in side effect.

- No new env vars required to *run* the script without Langfuse
- Langfuse keys only needed if you want traces
- Graceful: if keys are absent, instrumentation is a no-op

### Step 3 — Observe and evaluate

Run one smoke pass, open the Langfuse UI, see:
- Scout agent and judge agent as separate traces
- MCP `search` tool call nested under the scout
- Per-agent cost and latency (compare with the script's own `$0.02/$0.03` budget tracking)

## Why the Smoke Script Is a Good Learning Vehicle

- Two distinct agents → easy to see trace hierarchy
- One tool call (MCP search) → interesting nesting
- Budget tracking in both the script and Langfuse → natural comparison
- Short-lived script → surface the `langfuse.flush()` requirement in short-lived processes
- Low stakes — test script, not production

## References

- [Anthropic JS/TS integration](https://langfuse.com/integrations/model-providers/anthropic-js)
- [Claude Agent SDK integration (Python)](https://langfuse.com/integrations/frameworks/claude-agent-sdk)
- [Langfuse local deployment](https://langfuse.com/docs/deployment/local)
