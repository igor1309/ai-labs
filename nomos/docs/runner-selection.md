---
date: 2026-02-26
model: gpt-5.2
source: https://chatgpt.com/share/69a04dee-78a4-8003-8d39-553a25372c4f
---

## Runner Selection (V0)

Nomos supports multiple outbound runners. In V0:

- LiveRunner: real vendor HTTP calls (including SSE streaming passthrough)
- StubRunner: deterministic fixtures (including scripted SSE streams)

### Selection Mechanism

Runner is selected by endpoint namespace:

- Live API: `/v1/*` → LiveRunner
- Stub API: `/stub/v1/*` → StubRunner

### Authorization

Tokens carry a scope:

- `scope=live` may access `/v1/*` only
- `scope=stub` may access `/stub/v1/*` only

### Production Safety

Stub API is disabled in production via configuration:

- `NOMOS_STUB_ENABLED=false` (prod)
- `NOMOS_STUB_ENABLED=true` (dev/staging)

When disabled, `/stub/*` MUST be unreachable (recommended: return 404).

### Fixtures

StubRunner fixtures are read-only in V0 and are loaded from the filesystem.
No fixture upload or mutation API is provided in V0.

### Streaming Parity

Stub streaming MUST use the same SSE framing as live streaming so clients can test against identical semantics.