# Am I done?

Toy app: one-shot quiz for specific questions like “I’m a software developer, is AI taking my job? What time is left for me?” - and names a profession.

## Front
Text input form for profession.
Multilingual for v2

### State
- idle
- queried: sent query to backend
- failed on timeout
- backend response

### Event
- Send non-empty query
- Receive response (Result)

### Effect
- Query

### Reducer
Quite straightforward

### Effect Handler
HTTPS with timeout

## Backend
Composition of components

### Guard
Prompt injection guardian
Fast failure
Simple regex for v1

### Cache
Fast answer for similar queries (professions)
Fuzzy match, cheap LLM
Increment counter
Caches responses with counter 1

### Query Service // or better name
Compose system prompt / use from config
Compose user prompt / use from config
Simple async response for v1 (no partial streaming)
Queries async API (protocol!)

### Cache decorator
Composition
Wraps Query Service with caching on success preserving same interface

### OpenRouter Adapter
Composition
Adapts OpenRouterAPI for Query Service

## OpenRouterAPI
Config to select model

---
AGENTS.md

## Release Process

Release policy is outcome-based. Commands are implementation detail; these invariants are mandatory:

- **Start state**: release from `trunk`.
- **SemVer decision**: choose release bump per SemVer 2.0 from the delta since the previous tag (or full history on first release).
- **Release notes**: add exactly one new top entry in `docs/log.md` for this release, scoped to that reviewed delta.
- **Version consistency**: `package.json` version, `package-lock.json` version, and release tag `vX.Y.Z` must match.
- **Push safety**: push only `trunk` and the explicit release tag; never `git push --tags`.
- **Pre-push gate**: run BOTH `./scripts/run_silent.sh "build" npx tsc --noEmit` AND `./scripts/run_silent.sh "tests" npm test` before tagging. `tsx` (test runner) ignores unused imports; `tsc` (CI build) does not.
- **Deployment gate**: releases deploy via CI on tag push after tests pass.

## "protocol owned by client" rule

- The client defines and owns the dependency shape (protocol/interface/data model).
- A protocol MUST live in the same module as its client. Separating them is a violation.
- If the client is public, its protocol must be public so composition can supply an implementation.
- Composition layer(s) adapts concrete implementations to client-owned protocols.
- Modules MUST NOT know about CLI or each other.

## Context-Efficient Commands

Use `scripts/run_silent.sh` to run tests and builds. It suppresses output on success (one-line summary) and only dumps full output on failure. This keeps the context window clean.

`scripts/run_silent.sh` is a stable local wrapper that delegates to `vendor/ci-shared/scripts/run_silent.sh`, pinned to a specific `ci-shared` commit.

```bash
# Tests
./scripts/run_silent.sh "tests" npm test

# Build / typecheck
./scripts/run_silent.sh "build" npx tsc --noEmit
```

Do NOT run `npm test` or `npx tsc` directly — always use the wrapper.