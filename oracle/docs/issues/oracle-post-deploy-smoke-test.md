# Add post-deploy smoke test to oracle release pipeline (align with nomos pattern)

## Summary

Oracle's smoke test (`real-provider-smoke`) runs as a **pre-deploy test harness** — it validates LLM integration in a CI test runner before deployment. Nomos, by contrast, has a **post-deploy smoke test** embedded in its `deploy-nomos` job that hits the live production endpoint after deployment and blocks the GitHub Release on failure.

Oracle should adopt the same post-deploy smoke pattern to verify the deployed service is actually working end-to-end.

## Current State

| Aspect | Oracle (legacy `release.yml`) | Nomos (`release-unit.yml`) |
|--------|-------------------------------|----------------------------|
| **Smoke type** | Pre-deploy (test harness) | Post-deploy (live service) |
| **Smoke location** | Separate `real-provider-smoke` job | Embedded in `deploy-nomos` job |
| **What it tests** | LLM call via worker assembler in Node test | HTTP call to live `https://<NOMOS_DOMAIN>/v1/chat/completions` |
| **Timing** | Before `web-e2e` and `deploy` | After `docker compose up` + health check + version verify |
| **Release gate** | Blocks deploy job | Blocks `github-release` job |

## Desired State

After oracle deploy completes (`npm run worker:deploy && npm run web:deploy`), add a post-deploy smoke step that:

1. Hits the live oracle endpoint (e.g., `/api/outlook`) with a real request
2. Asserts HTTP 200 and validates response schema
3. Fails the deploy job (and blocks `github-release`) on failure
4. Sends deployment success notification with smoke result on pass

This mirrors the nomos pattern at `release-unit.yml:145-168`.

## Acceptance Criteria

- [ ] Post-deploy smoke test step added to oracle's release pipeline
- [ ] Smoke test makes a real HTTP request to the deployed oracle service
- [ ] Smoke test failure blocks GitHub Release creation
- [ ] Success notification includes smoke test result
- [ ] Existing pre-deploy `real-provider-smoke` job retained (belt-and-suspenders)

## References

- Nomos smoke test: `.github/workflows/release-unit.yml` lines 145-168
- Nomos deploy job: `.github/workflows/release-unit.yml` lines 87-188
- Oracle release workflow: `.github/workflows/release.yml`
- Nomos ADR-0002: `nomos/docs/adr-0002.md`
