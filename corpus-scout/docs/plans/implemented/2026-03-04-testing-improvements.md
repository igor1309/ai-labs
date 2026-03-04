# Corpus Scout Testing Improvements

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Align corpus-scout tests with testing-corpus-scout.md prescriptions: add missing unit-level assertions (must_contain tokens, no extra files), add explicit infrastructure precondition failures, and audit CI test inclusion.

**Architecture:** Three independent tasks touching only test files. No production code changes. Each task adds tests that exercise existing behavior more explicitly. Task 3 audits CI workflow for infra-dependent tests.

**Tech Stack:** Node.js test runner, assert/strict, ripgrep (external dep)

**Execution lock:**
- Worktree required: yes
- Expected worktree: `worktrees/testing-improvements`
- Expected branch: `codex/testing-improvements`
- Preflight check: [ ] done

---

## Context: Findings from Testing Doc Audit

`corpus-scout/docs/testing-corpus-scout.md` prescribes unit tests that assert:
- exact file
- exact heading
- **no extra files** — gap: no test asserts result set contains *only* expected files
- **must_contain tokens** — gap: no test asserts match text contains the query term

Additionally, user concern: tests that depend on local-only infrastructure (ripgrep, MCP stdio transport) should fail explicitly with a clear message when the dependency is unavailable, not with a cryptic subprocess error. Tests requiring Docker or other local-only infra must be examined before including in CI.

Current CI (`corpus-scout-core.yml`) runs `node --test corpus-scout/tests/*.test.js` — this includes all four test files. The e2e tests spawn a real MCP server over stdio, which requires ripgrep. CI installs ripgrep via `apt-get`, so this works. No Docker dependencies exist. All tests are CI-safe.

---

### Task 1: Add "must_contain tokens" unit test

Verify that every search result's `text` field contains the query term (case-insensitive by default).

**Files:**
- Modify: `corpus-scout/tests/corpus-client.test.js`

**Step 1: Write the failing test**

Add after the existing `search_shouldReturnMatches_withFileAndLine` test (~line 33):

```javascript
test("search_shouldContainQueryToken_inMatchText", async () => {
  const root = await makeTempCorpus({
    "doc.md": "the dragon sleeps\nno match here\ndragon flies\n"
  })
  try {
    const client = makeCorpusClient({ root })
    const results = await client.search("dragon")
    assert.ok(results.length > 0, "expected at least one result")
    assert.ok(
      results.every(($0) => $0.text.toLowerCase().includes("dragon")),
      `expected all results to contain query token, got: ${results.map(($0) => $0.text)}`
    )
  } finally {
    await rm(root, { recursive: true })
  }
})
```

**Step 2: Run test to verify it passes**

This test validates existing correct behavior — it should pass immediately (GREEN, not RED, because we're adding a coverage assertion for existing behavior, not new behavior).

Run: `./scripts/run_silent.sh "tests" node --test corpus-scout/tests/corpus-client.test.js`
Expected: PASS

**Step 3: Commit**

```bash
git add corpus-scout/tests/corpus-client.test.js
git commit -m "add must_contain token assertion to corpus-scout unit tests"
```

---

### Task 2: Add "no extra files" unit test

Verify that search results contain *only* files that match — no spurious results from non-matching files.

**Files:**
- Modify: `corpus-scout/tests/corpus-client.test.js`

**Step 1: Write the failing test**

Add after the test from Task 1:

```javascript
test("search_shouldReturnOnly_matchingFiles", async () => {
  const root = await makeTempCorpus({
    "match.md": "the dragon awakens\n",
    "decoy.md": "nothing relevant here\n",
    "also-match.md": "another dragon sighting\n"
  })
  try {
    const client = makeCorpusClient({ root })
    const results = await client.search("dragon")
    const files = results.map(($0) => $0.file).sort()
    assert.deepEqual(files, ["also-match.md", "match.md"])
  } finally {
    await rm(root, { recursive: true })
  }
})
```

**Step 2: Run test to verify it passes**

Again, this validates existing correct behavior.

Run: `./scripts/run_silent.sh "tests" node --test corpus-scout/tests/corpus-client.test.js`
Expected: PASS

**Step 3: Commit**

```bash
git add corpus-scout/tests/corpus-client.test.js
git commit -m "add no-extra-files assertion to corpus-scout unit tests"
```

---

### Task 3: Add explicit ripgrep precondition check

Currently, if `rg` is not installed, `corpus-client.test.js` search tests fail with a cryptic `ENOENT` or `spawn rg` error. Add an explicit precondition test that fails with a clear message.

**Files:**
- Modify: `corpus-scout/tests/corpus-client.test.js`

**Step 1: Write the precondition test**

Add at the top of the test file, before any search tests (after the imports and helper):

```javascript
test("precondition_ripgrepMustBeInstalled", async () => {
  const { execFile: execFileCb } = await import("node:child_process")
  const { promisify } = await import("node:util")
  const execFileAsync = promisify(execFileCb)
  const { stdout } = await execFileAsync("rg", ["--version"])
  assert.match(stdout, /ripgrep/, "ripgrep (rg) must be installed — search tests depend on it")
})
```

This runs first (node:test runs in declaration order). If `rg` isn't installed, this test fails with a clear message instead of letting later tests produce cryptic errors.

**Step 2: Run test to verify it passes (locally, where rg is installed)**

Run: `./scripts/run_silent.sh "tests" node --test corpus-scout/tests/corpus-client.test.js`
Expected: PASS

**Step 3: Commit**

```bash
git add corpus-scout/tests/corpus-client.test.js
git commit -m "add explicit ripgrep precondition check in corpus-scout tests"
```

---

### Task 4: Audit CI workflow for infra-dependent tests

Verify that `corpus-scout-core.yml` correctly handles all infrastructure dependencies for the test files it runs.

**Files:**
- Review: `.github/workflows/corpus-scout-core.yml`
- Review: `.github/workflows/ci.yml`

**Audit checklist:**

| Test file | Infra dependency | CI provision | Status |
|---|---|---|---|
| `corpus-client.test.js` | ripgrep (`rg`) | `apt-get install -y ripgrep` (line 34) | OK |
| `mcp-server.test.js` | none (in-memory transport + stubs) | n/a | OK |
| `e2e.test.js` | ripgrep (spawns real server) | same `apt-get` step | OK |
| `smoke.test.js` | none (all mocked) | n/a | OK |

**Step 1: Verify the audit**

Read both CI files and confirm the table above. No Docker, no Langfuse, no external services required.

**Step 2: Document findings**

No changes needed — all infra deps are provisioned in CI. Add a brief comment to `corpus-scout-core.yml` documenting the ripgrep dependency reason:

```yaml
      - name: Install ripgrep
        # Required by corpus-client search (subprocess) and e2e tests
        run: sudo apt-get install -y ripgrep
```

**Step 3: Commit**

```bash
git add .github/workflows/corpus-scout-core.yml
git commit -m "document ripgrep dependency in corpus-scout CI workflow"
```

---

### Task 5: Run full test suite and close out

**Step 1: Run full suite**

```bash
./scripts/run_silent.sh "build" npx tsc --noEmit
./scripts/run_silent.sh "tests" npm test
```

Expected: all pass.

**Step 2: Push and create PR**

Push `codex/testing-improvements` to origin and create PR targeting `trunk`.

---

## Summary of changes

| Change | File | Doc prescription addressed |
|---|---|---|
| must_contain token assertion | `corpus-client.test.js` | "must_contain tokens" |
| no-extra-files assertion | `corpus-client.test.js` | "no extra files" |
| ripgrep precondition test | `corpus-client.test.js` | explicit infra failure |
| CI comment | `corpus-scout-core.yml` | documentation |
