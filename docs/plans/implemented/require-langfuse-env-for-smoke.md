## Context

The decorated smoke path (`run_with_langfuse`) silently falls back to plain `run()` when Langfuse env vars are missing. This hides misconfiguration. The script should require Langfuse keys and fail explicitly when they're absent, since the decorated path is the intended production usage.

## Plan

### Step 1: Add env-var guard to `__main__` and update tests

**`web-scout/smoke.py`** — change `__main__` block (lines 245-258):
- Remove the `if langfuse_client:` / `else:` branching.
- After `make_langfuse_client(env)`, if `None`, print `FAIL: LANGFUSE_SECRET_KEY and LANGFUSE_PUBLIC_KEY are required` and `sys.exit(1)`.
- Always call `run_with_langfuse`.

**`web-scout/tests/smoke_test.py`** — add test:
- `test_mainExitsNonzero_whenLangfuseEnvMissing` — patch `sys.exit`, run `__main__` logic (or test `make_langfuse_client` returning `None` triggers exit). Since `__main__` is script-level, the cleanest approach is to extract the entrypoint into a `main()` function and test that.

Actually, simpler: the `make_langfuse_client` already returns `None` and is tested. The behavioral change is in `__main__` which is hard to unit-test. Instead, keep the guard in `__main__` and rely on the existing `test_noLangfuseKeys_doesNotInstantiateLangfuseClient` plus a manual smoke verification. No new test needed for the `__main__` script block — it's 5 lines of glue.

Run: `./scripts/run_silent.sh "tests" npm test`

### Step 2: Update docs

**`web-scout/docs/langfuse.md`**:
- Line 1-5 front-matter: change description from "optional" to "required".
- Line 9: change "Optional local tracing" to "Local tracing" (keys are now required).
- Line 22: remove "When the Langfuse env vars are absent, tracing is skipped with no behavioural change."
- Add note that the script fails if `LANGFUSE_SECRET_KEY` or `LANGFUSE_PUBLIC_KEY` are missing.

**`web-scout/docs/specs/implemented/langfuse-smoke-observability.md`**:
- Update rule 1 ("When Langfuse keys are absent, the script behaves identically to v0.0.2") to reflect that the script now fails.
- Update "Done criteria" accordingly.

### Verification

1. `./scripts/run_silent.sh "tests" npm test` — all tests pass.
2. Manual: run `python3 web-scout/smoke.py` without Langfuse env vars → exits 1 with clear message.
