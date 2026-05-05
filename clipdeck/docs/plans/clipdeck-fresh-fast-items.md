---
date: 2026-05-05
model: claude-opus-4-7
description: "Implementation plan for ADR-006 fresh-fast item loading: GraphQL bulk fetch + SHA-keyed Cache API for clipdeck /api/items"
---

# Clipdeck Fresh-Fast Item Loading Implementation Plan

**Goal:** Replace the per-request REST fan-out behind `GET /api/items` with a single GitHub GraphQL request gated by a SHA-keyed Workers Cache API entry, so the steady-state path is sub-millisecond and the cold path is bounded by one GraphQL round-trip, while preserving every ADR-001/005 boundary.

**Architecture:** A new GraphQL client method returns prompts, skills, and the trunk commit SHA in a single response. `handleItems` consults the Workers Cache API keyed by trunk SHA before contacting GitHub; on cache miss or expiry it issues a small SHA-only freshness query, refreshes the entry if the SHA is unchanged, and rebuilds via the bulk GraphQL query when the SHA has changed. The browser-visible response shape, status codes, headers, and ETag semantics from ADR-001 remain unchanged.

**Tech Stack:** TypeScript Cloudflare Worker, Workers Cache API, Wrangler, Vitest Workers pool, jsdom frontend tests.

---

## Execution Lock

- Execution mode: auto-continue
- Human review between tasks: no
- Worktree mode: no separate worktree (work on the feature branch on the primary working tree)
- Expected branch: `clipdeck/fresh-fast-items`
- Push policy: push at closeout
- Push boundary: keep all phase commits local; push only when Phase 4 reaches the PR/release task.
- Final archive behavior: after implementation, move this plan to `clipdeck/docs/plans/implemented/` in the Phase 4 closeout commit before opening the PR.
- Preflight check: [x] done

Stop immediately if:

- A phase verification gate fails after two focused fix attempts.
- The active branch is not `clipdeck/fresh-fast-items`.
- A required behavior cannot be expressed in tests without violating the Worker test pool conventions in `clipdeck/test/`.
- A change would broaden the source allowlist beyond ADR-001 scope.
- The user changes scope or asks to pause.

## Governing Documents

- ADR: `clipdeck/docs/adr/adr-006-fresh-fast-item-loading.md`
- Existing access ADR: `clipdeck/docs/adr/adr-005-cloudflare-access-authentication.md`
- Existing API/frontend spec: `clipdeck/docs/specs/spec-iphone-copy-library.md`
- Existing source ADR: `clipdeck/docs/adr/adr-001-iphone-copy-library.md`

## ADR Traceability Matrix

| ADR-006 invariant | Plan phase(s) | Acceptance evidence |
| --- | --- | --- |
| At most one GitHub GraphQL request per `/api/items` rebuild | Phase 1 | Tests assert exactly one `fetch` invocation against `api.github.com/graphql` for a cold rebuild |
| No per-file REST `readFile` calls on the request path | Phase 1 | Tests fail if `fetch` targets the REST contents endpoint during `/api/items` |
| GraphQL request restricted to ADR-001 allowlisted source paths | Phase 1 | Test inspects the GraphQL query string and asserts only `prompts` and `dev-skills/public` expressions appear |
| Binary blobs are ignored | Phase 1 | Test feeds a binary entry in the GraphQL response and asserts it is excluded from the items |
| Assembled body cached in Cache API keyed by trunk SHA | Phase 2 | Test asserts `caches.default.put` is called with a key encoding the SHA |
| Freshness TTL of at most 10 seconds | Phase 2 | Test inspects the cached `Response`'s `Cache-Control: max-age` and asserts `<= 10` |
| Cache hit within freshness window issues zero GitHub subrequests | Phase 2 | Test pre-seeds a cache hit and asserts `fetch` is not called |
| Same-SHA freshness check refreshes without rebuild | Phase 2 | Test seeds expired cache, returns matching SHA from freshness check, and asserts no GraphQL call |
| Different-SHA freshness check triggers rebuild | Phase 2 | Test seeds expired cache, returns differing SHA, and asserts one GraphQL call |
| Worker MUST NOT serve a body whose SHA differs from the most recently observed trunk SHA | Phase 2 | Test for changed-SHA path asserts the body returned reflects the new SHA's content |
| GitHub failure surfaces existing `502` upstream-failure error contract | Phase 1, Phase 2 | Tests assert `502` with `error: "upstream_github_failure"` for GraphQL failure and freshness-check failure |
| Response shape, status codes, headers, ETag semantics unchanged | Phase 1 | Existing item-shape assertions and ETag tests stay green |
| Browser receives no GitHub credentials, raw GraphQL responses, or out-of-allowlist data | Phase 1 | Existing source-allowlist and front-matter tests stay green |
| Cloudflare Access boundary unchanged | Phase 1, Phase 2 | No code touches `auth.ts` access path; ADR-005 invariants verified by unchanged tests |
| Free-tier subrequest budget honored | Phase 1, Phase 2 | Cache hit = 0 subrequests; SHA match = 1; rebuild = 2 (asserted by `fetch` call counts) |

## File Map

- `clipdeck/src/api/github.ts` — add a `fetchAll(): Promise<{ prompts, skills, sha }>` method backed by GitHub GraphQL, returning the trunk SHA and source bodies in one round-trip; keep existing REST methods only if used elsewhere; remove if not.
- `clipdeck/src/api/items.ts` — replace prompts+skills fan-out with `fetchAll`; add Cache API lookup keyed by trunk SHA with the documented freshness TTL; add the freshness-check path for cache miss/expiry.
- `clipdeck/src/api/discovery.ts` — unchanged shape; verify `discoverPrompts`/`discoverSkills` accept the GraphQL-derived `SourceFile`/`SourceFolder` inputs identically.
- `clipdeck/src/api/assemble.ts` — unchanged.
- `clipdeck/src/api/frontmatter.ts` — unchanged.
- `clipdeck/src/api/response.ts` — unchanged.
- `clipdeck/src/index.ts` — unchanged.
- `clipdeck/test/items.test.ts` — replace REST-shaped fetch mocks with GraphQL-shaped fetch mocks; add cache hit / cache miss with same SHA / cache miss with changed SHA / GraphQL failure / binary-blob-ignored cases; preserve existing ETag, source-missing, and upstream-failure expectations.
- `clipdeck/test/real-skills.test.ts` — adapt only the GitHub mock surface; keep behavioral expectations unchanged.
- `clipdeck/docs/log.md` — one outcome-focused entry per meaningful change set.
- `clipdeck/docs/plans/clipdeck-fresh-fast-items.md` — this plan; update checkboxes as phases complete, then move to `implemented/`.
- `clipdeck/package.json` — version bump in Phase 4 only.
- `package-lock.json` — root lockfile entry refresh in Phase 4 only.

## Scope Guardrails

- No change to `/api/items` response shape, ETag rules, status codes, or error codes.
- No change to source allowlisting under `prompts/` and `dev-skills/public/`.
- No introduction of Workers KV, R2, Durable Objects, or scheduled triggers.
- No change to `auth.ts` or any access-control surface.
- No change to deploy or release workflows.
- No new public endpoints; no admin/refresh endpoint.

## Phase 1 — GraphQL Bulk Fetch

**Aim:** Source `/api/items` content from a single GraphQL call, replacing the per-file REST fan-out, while preserving the existing response contract.

Steps:

- [ ] Add `fetchAll(token): Promise<{ prompts: SourceFile[]; skills: SourceFolder[]; sha: string }>` to `github.ts` issuing a single POST to `https://api.github.com/graphql` with a query covering `trunk:prompts` and `trunk:dev-skills/public` and the trunk ref's commit OID.
- [ ] Map the GraphQL response into the existing `SourceFile` and `SourceFolder` shapes consumed by `discovery.ts`; ignore entries with `isBinary: true`.
- [ ] Replace the prompts and skills fetch dance in `handleItems` with a single `fetchAll` call; keep the existing assemble/discovery/etag pipeline.
- [ ] Map GraphQL transport failures and source-missing conditions to the existing `502` `upstream_github_failure` and `source_missing` error responses.
- [ ] Update `clipdeck/test/items.test.ts` to mock the GraphQL endpoint and add coverage for: GraphQL query targets only allowlisted paths, binary blobs ignored, GraphQL failure surfaces the upstream-failure contract, source-missing path returns the same `502` body as today, item-shape and ETag assertions remain green.
- [ ] Run `./scripts/run_silent.sh "tests" npm test` from the repo root; gate is green.
- [ ] Run `./scripts/run_silent.sh "build" npx tsc --noEmit` from the repo root; gate is green.

Acceptance criteria:

- A cold `/api/items` request issues exactly one `fetch` to `api.github.com/graphql` and zero `fetch` calls to `api.github.com/repos/.../contents/...` or `api.github.com/repos/.../git/trees/...`.
- The `/api/items` response body, status codes, headers, and ETag semantics match today's tests for prompts and skills.
- A GraphQL transport failure produces `502 { error: "upstream_github_failure", source: "skills" }` (or `source: "prompts"` if applicable) consistent with existing assertions.
- A binary entry surfaced under prompts or under a skill folder is excluded from the response.
- All Vitest suites pass; `tsc --noEmit` passes.

Phase 1 ends with a single commit covering the source change plus its tests.

## Phase 2 — SHA-Keyed Cache API

**Aim:** Bound steady-state GitHub calls by serving a cached body keyed by trunk SHA with a freshness TTL of at most 10 seconds, and consult GitHub for a tiny SHA-only freshness query on cache miss.

Steps:

- [ ] Introduce a freshness-check method in `github.ts` issuing a minimal GraphQL query for `repository.ref.target.oid` only, returning the current trunk SHA.
- [ ] In `handleItems`, look up the assembled body in `caches.default` keyed by trunk SHA; serve on hit without contacting GitHub.
- [ ] On cache miss or expiry: issue the freshness check; if the returned SHA matches the SHA of any previously cached body, refresh the cache entry with that body and the same SHA key; if the SHA differs (or no cached body exists), rebuild via `fetchAll` and store the new body keyed by the new SHA.
- [ ] Set the cached `Response`'s `Cache-Control: max-age=<= 10>`; tests assert the value is no greater than 10.
- [ ] Map freshness-check transport failures to the existing `502` `upstream_github_failure` contract.
- [ ] Add tests in `items.test.ts` covering: cache hit path issues zero `fetch` calls, expired-cache same-SHA path issues exactly one `fetch` call (the freshness check) and reuses the existing body, expired-cache different-SHA path issues two `fetch` calls (freshness check plus full GraphQL) and returns the new body, freshness-check failure surfaces `502 upstream_github_failure`, and the cached `Response` carries `Cache-Control: max-age <= 10`.
- [ ] Run `./scripts/run_silent.sh "tests" npm test` from the repo root; gate is green.
- [ ] Run `./scripts/run_silent.sh "build" npx tsc --noEmit` from the repo root; gate is green.

Acceptance criteria:

- Two sequential `/api/items` requests within the freshness window with the same trunk SHA produce at most one GitHub `fetch` call across both requests.
- A request after a SHA change rebuilds via the GraphQL fetch and caches the new body under the new SHA.
- A freshness-check failure produces `502 { error: "upstream_github_failure", ... }`.
- Cache key includes the trunk SHA the body was built from.
- All Vitest suites pass; `tsc --noEmit` passes.

Phase 2 ends with a single commit covering the source change plus its tests.

## Phase 3 — Self-Review and Cleanup

**Aim:** Apply review discipline against the implemented changes, fix any fails or warns, and record outcomes.

Steps:

- [ ] Apply the existing review skill against the diff for Phases 1 and 2 (correctness, scope, edge cases, test quality, naming).
- [ ] Fix any fails and warns surfaced by review.
- [ ] Re-run both gates after fixes.
- [ ] Add a `clipdeck/docs/log.md` entry summarizing the outcome.

Acceptance criteria:

- No fails or warns remain unaddressed.
- Gates green after fixes.
- Log entry present.

Phase 3 ends with a commit (or no commit if review surfaced nothing actionable).

## Phase 4 — Closeout and Release

**Aim:** Archive the plan, bump versions, open the PR, merge, and create the release tag.

Steps:

- [ ] Move this plan from `clipdeck/docs/plans/` to `clipdeck/docs/plans/implemented/`.
- [ ] Bump `clipdeck/package.json` patch version; refresh `package-lock.json` lockfile entries; align root `package.json` and `package-lock.json` versions per repo policy.
- [ ] Re-run `./scripts/run_silent.sh "tests" npm test` and `./scripts/run_silent.sh "build" npx tsc --noEmit`.
- [ ] Push branch; open PR with title and body summarizing the ADR-006 implementation.
- [ ] Enable auto-merge with `gh pr merge <number> --merge --auto --delete-branch`.
- [ ] After merge, follow the release process: trigger the per-unit release tag for clipdeck per the existing `<basename>_v*` namespace.

Acceptance criteria:

- Plan file is under `clipdeck/docs/plans/implemented/`.
- `clipdeck/package.json` and `package-lock.json` versions are aligned and reflect the bump.
- PR is merged via merge-commit; branch deleted.
- Release tag exists for the new clipdeck version.

Phase 4 ends with the release tag created.

## Edge Cases

- **Empty `prompts/` directory:** `prompts` section is empty in the assembled body; existing behavior preserved.
- **Empty `dev-skills/public/` subtree:** `skills` section is empty; existing behavior preserved.
- **Skill folder without `SKILL.md`:** discovery emits a folder with no `SKILL.md` content; existing behavior preserved (matches today's `agents/` folder shape).
- **Binary blob accidentally placed in `prompts/` or a skill folder:** ignored (`isBinary == true` excluded from the assembled items).
- **GraphQL response truncation or partial data:** treat as upstream failure; surface existing `502` contract.
- **Trunk SHA changes mid-rebuild:** the rebuild reflects whichever SHA the freshness check returned; the next request will observe the latest SHA on the next freshness-check window expiry.
- **Cold colo:** no cached body; first request pays a freshness check plus a rebuild (two GitHub subrequests); subsequent requests within the freshness window are sub-millisecond.
- **GitHub GraphQL transient 5xx:** surface as `502 upstream_github_failure`; the next request retries by virtue of the cache miss.

## Completion Definition

- All ADR-006 invariants in the traceability matrix have automated coverage.
- Vitest and `tsc --noEmit` gates green at every phase boundary.
- Plan archived under `clipdeck/docs/plans/implemented/`.
- Release tag created for the bumped clipdeck version.
- Repo-level `docs/log.md` and `clipdeck/docs/log.md` carry outcome-focused entries.
