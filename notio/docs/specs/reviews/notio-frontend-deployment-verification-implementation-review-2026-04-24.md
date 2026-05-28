---
date: 2026-04-24
model: gpt-5
description: "Adversarial review of Notio frontend deployment verification implementation"
---

# Notio Frontend Deployment Verification Implementation Review

## Findings

### Fail: Expected-version helper failures are swallowed by the workflow

Verdict: fail

Location: `.github/workflows/notio-frontend-deploy.yml:73`

Why: The workflow writes the step output with `echo "version=$(node scripts/deploy-expected-version.mjs)" >> "$GITHUB_OUTPUT"`. In shell, a failing command inside command substitution does not make `echo` fail; the step exits `0` and writes an empty `version`. That means invalid or broken expected-version derivation is not rejected at the derivation gate and the workflow can continue to deploy before failing later in the smoke check. This weakens the plan's expected-version contract and leaves the static workflow tests unable to catch the failure-propagation bug.

Fix:

```yaml
- name: Derive expected frontend version
  id: expected-version
  working-directory: notio/frontend
  env:
    GITHUB_REF_NAME: ${{ github.ref_name }}
    GITHUB_REF_TYPE: ${{ github.ref_type }}
  run: |
    version="$(node scripts/deploy-expected-version.mjs)"
    echo "version=${version}" >> "$GITHUB_OUTPUT"
```

Because the `node` invocation is the assignment command in a multi-line `run` block, GitHub Actions' default `bash -e` behavior fails the step if the helper exits non-zero. Keep the deploy step after this derivation step.

Tests: Add or update a static workflow test that rejects the single-line `echo "version=$(node scripts/deploy-expected-version.mjs)"` form and requires a separate `version="$(node scripts/deploy-expected-version.mjs)"` command before writing to `$GITHUB_OUTPUT`.

## Scope Reviewed

- `.github/workflows/notio-frontend-deploy.yml`
- `notio/frontend/scripts/deploy-expected-version.mjs`
- `notio/frontend/scripts/smoke-deployed-version.mjs`
- `notio/frontend/tests/deploy/DeployExpectedVersion.test.ts`
- `notio/frontend/tests/deploy/SmokeDeployedVersion.test.ts`
- `notio/frontend/tests/deploy/DeployWorkflow.test.ts`
- `notio/frontend/tests/App.test.ts`
- related docs, log, package metadata, and implemented plan move

## Passing Checks

- The smoke script uses a browser-rendered DOM path through Playwright.
- The smoke script checks the `Version` accessible label and fails on unreachable target, missing element, and mismatch.
- The deploy workflow runs the smoke step after `wrangler pages deploy`.
- The release fan-in still includes `deploy-notio-frontend`.
- The frontend remains static-only; no Pages Function, server route, SSR route, or backend proxy was added.
