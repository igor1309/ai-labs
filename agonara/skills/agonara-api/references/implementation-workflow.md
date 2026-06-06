---
date: 2026-06-06
model: gpt-5
description: "Workflow for implementing, changing, testing, and debugging Agonara HTTP API routes"
---

# Agonara API Implementation Workflow

## Grounding

Before code changes, identify the route family and read:

1. `agonara/README.md`
2. `agonara/docs/module_responsibility_map.md`
3. The relevant `agonara/docs/specs/*.md`
4. Existing tests in `agonara/tests/http-api.test.js` and, when the behavior is
   end-to-end, `agonara/tests/executable-acceptance.test.js`
5. The owner module under `agonara/src/` and the route adapter in
   `agonara/src/server.js`

If a handoff, review, plan, or ADR already captures current facts, read the
documents it references before re-deriving live state.

## Adding Or Changing A Route

1. Write a failing HTTP or executable-acceptance test that expresses the
   missing API behavior. Compilation failures are not RED.
2. Implement domain behavior in the owner module when behavior changes. Keep
   transport-only mapping in `server.js`.
3. Add or update the route adapter in `server.js`. Reuse existing helpers for
   session lookup, CSRF checks, body parsing, pagination cursors, status
   mapping, JSON output, and cookie handling.
4. For session-backed mutations, validate CSRF before request body parsing or
   mutation. Preserve idempotency-key behavior for student attempt routes.
5. Map domain `reason` values through existing status mapping helpers. Add a
   new reason mapping only when the spec names it or the domain needs it.
6. Update product UI only when the task explicitly includes UI behavior. API
   routes should remain usable without the UI.
7. Update the relevant Agonara spec/log only when the change alters documented
   behavior or completes an implementation slice.

## Debugging A Contract Failure

- Compare spec route table, `server.js` route matching, and HTTP test helpers
  before assuming the domain module is wrong.
- Check auth first: missing session, disabled identity, role mismatch, missing
  CSRF, invalid CSRF, and idempotency conflict are common intended rejections.
- Check owner-only projections for student state. Non-owner reads should often
  look unavailable rather than disclosing existence.
- Check redaction regressions by searching test forbidden-fragment arrays and
  spec "must not expose" lists.
- Verify out-of-scope routes still return `{ "status": "rejected",
  "reason": "not_found" }` when a spec requires route absence.

## Test Commands

Use `scripts/run_silent.sh` for Node test/build commands.

Targeted HTTP route tests:

```bash
./scripts/run_silent.sh "agonara http api" node --test --test-name-pattern "<route-or-behavior-pattern>" agonara/tests/http-api.test.js
```

Executable acceptance tests:

```bash
./scripts/run_silent.sh "agonara acceptance" node --test --test-name-pattern "<behavior-pattern>" agonara/tests/executable-acceptance.test.js
```

Full Agonara workspace tests:

```bash
./scripts/run_silent.sh "agonara tests" npm test --workspace agonara
```

Root Node gates for code, config, dependency, CI, release, or generated-artifact
changes:

```bash
./scripts/run_silent.sh "tests" npm test
./scripts/run_silent.sh "build" npx tsc --noEmit
```

Docs-only skill/reference changes do not require Node test/build gates unless
they change executable examples, generated outputs, CI/release behavior, or
package/tooling configuration.
