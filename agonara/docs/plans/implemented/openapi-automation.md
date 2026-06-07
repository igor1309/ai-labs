---
date: 2026-06-07
model: gpt-5
description: "Implementation plan: implement Agonara route contract registry and generated OpenAPI contract."
---

# OpenAPI Automation Implementation Plan

## Adversarial review findings

### Finding 1 - code and generated-artifact phases omitted full gates

Verdict: fail

Why: Repo process gates require both `./scripts/run_silent.sh "tests" npm test` and `./scripts/run_silent.sh "build" npx tsc --noEmit` for Node/TypeScript code, config, dependency, CI, release, or generated-artifact changes. Phase 1 and Phase 2 initially listed targeted or workspace checks only, even though they add Node modules, generator behavior, package scripts, and generated-artifact checks.

Fix applied: Phase 1, Phase 2, and Phase 3 now include the root test and build wrappers in validation. The final closeout already required both gates.

## Goal

Implement [OpenAPI Automation](../../specs/openapi-automation.md) so Agonara route declarations are the shared source for server routing, route-level contract tests, and generated `docs/api/openapi.yml`, without changing the behavior of any existing public HTTP route.

## Execution mode

```
Mode: auto-continue
Human review between tasks: no
Stop conditions: failed gates, unclear scope, missing credentials/tooling, destructive operations, explicit user interruption
Push policy: no push
```

## Execution lock

```
Worktree mode: reuse existing
Expected worktree: /Users/igormalyarov/Developer/my-apps/ai-labs/ai-labs/worktrees/agonara-openapi-automation
Expected branch: codex/agonara-openapi-automation
Preflight check: [x] done
```

## Scope guardrails

- Do not add, remove, rename, or redefine public HTTP routes.
- Do not change auth, CSRF, idempotency, request parsing, response bodies, status mapping, operational logging, or fault redaction behavior except where tests prove existing behavior is preserved.
- Do not require BYOA operator skills to read source files, tests, route handlers, or private runtime modules.
- Do not replace the existing OpenAPI schema vocabulary with permissive placeholders when route-specific schemas already exist in `docs/api/openapi.yml`.
- Do not introduce new external services, live credentials, deployment topology changes, release-unit registration, or version bumps.
- Do not create another worktree for this task.

## Product intent traceability

Technical contract automation; no accepted user story changes. The plan preserves Agonara's API-first and BYOA operating model by keeping `docs/api/openapi.yml` the published external substrate while moving its source of truth into route declarations.

## Phase 1 - Generator and Registry Validation Substrate

**Objective**: establish the route contract module shape, generator function, and validation tests before routing depends on the registry.

**Key work items**:

- Add `agonara/src/http-contract.js` with `routeContracts`, `openApiContractMetadata`, and pure helpers for route-template parameter extraction.
- Seed the registry from the current committed `docs/api/openapi.yml` so generated output can preserve existing route-level metadata.
- Add focused tests for unique method/path pairs, unique operation ids, unique handler keys, path-parameter consistency, known tags, explicit auth, CSRF declarations, request body declarations, response declarations, shared rejection schemas, and local component refs.
- Add `generateOpenApiDocument` / `generateOpenApiYaml` helpers that produce deterministic OpenAPI 3.1 output from registry data and omit server-only fields.
- Add generator tests for determinism, route-contract matching, server-only field omission, and generated-output parse/ref/lint compatibility.

**Dependencies**: The OpenAPI automation spec and current hand-edited OpenAPI contract.

**Risks**: Copying current OpenAPI structure into registry data can accidentally loosen schemas or change YAML ordering. Keep generated output byte-identical to the committed contract before wiring the CLI.

**Validation**:

- Targeted command: `node --test agonara/tests/openapi-contract.test.js`
- Full test command: `./scripts/run_silent.sh "tests" npm test`
- Build command: `./scripts/run_silent.sh "build" npx tsc --noEmit`
- Diff check: `git diff --check`

**Completion signal**: Generator helpers can produce the committed OpenAPI contract from registry data, and registry validation tests cover the spec's structural rules.

## Phase 2 - CLI Check and Agonara Test Gate

**Objective**: make generated OpenAPI output enforceable through the workspace test command.

**Key work items**:

- Add `scripts/generate-agonara-openapi.mjs` with normal write mode and `--check` mode.
- Make `--check` exit `0` when generated output matches the committed file and non-zero with concise diff-oriented output when it differs.
- Wire the generation check into `npm test --workspace agonara` before or alongside Redocly lint.
- Add tests that prove the check passes for matching output and fails for changed committed output without rewriting files in check mode.

**Dependencies**: Phase 1 generator helpers.

**Risks**: The test gate can become noisy or mutate files during checks. Keep check mode read-only and failure output short.

**Validation**:

- Targeted command: `node --test agonara/tests/openapi-contract.test.js`
- Workspace command: `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- Full test command: `./scripts/run_silent.sh "tests" npm test`
- Build command: `./scripts/run_silent.sh "build" npx tsc --noEmit`
- Diff check: `git diff --check`

**Completion signal**: The Agonara workspace test command fails on OpenAPI generation drift and still passes when the generated contract matches.

## Phase 3 - Server Route Matching Integration

**Objective**: use the route contract registry for method/path inventory and handler dispatch keys while preserving existing runtime behavior.

**Key work items**:

- Export `matchRoute` from `src/http-contract.js` and cover exact/static, templated, method mismatch, and not-found cases.
- Route the server's top-level dispatch through `matchRoute` so the selected handler comes from the matched contract's `handlerKey`.
- Keep existing module-specific handler functions as behavior owners; only replace duplicated method/path inventory with registry-driven recognition.
- Update route-level contract tests so inventory expectations come from `routeContracts`, not hard-coded route arrays or regex extraction from `server.js`.
- Keep the public `404 not_found` behavior for unmatched routes.

**Dependencies**: Phase 1 registry and Phase 2 generated-contract check.

**Risks**: Dispatch refactoring can change first-match ordering or parameter decoding for overlapping routes. Preserve the current route order in `routeContracts` and rely on the existing HTTP API suite for behavior equivalence.

**Validation**:

- Targeted command: `node --test agonara/tests/openapi-contract.test.js`
- Behavior command: `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- Full test command: `./scripts/run_silent.sh "tests" npm test`
- Build command: `./scripts/run_silent.sh "build" npx tsc --noEmit`
- Diff check: `git diff --check`

**Completion signal**: Server dispatch uses registry matches and the existing HTTP/API tests pass without behavior changes.

## Phase 4 - Documentation, Backlog, and Archive Closeout

**Objective**: mark the automation work implemented and leave forward docs accurate.

**Key work items**:

- Move this plan to `agonara/docs/plans/implemented/openapi-automation.md`.
- Update the OpenAPI automation spec status and implementation evidence.
- Remove or rewrite the `OpenAPI automation` backlog item so no completed work remains as a forward task.
- Add a concise Agonara log entry for implemented automation.

**Dependencies**: Phases 1-3 complete and validated.

**Risks**: Docs can overclaim if the generated contract check or routing integration is incomplete. Update closeout docs only after the final gates pass.

**Validation**:

- Markdown/front-matter structure check by inspection.
- Final gates listed below.
- Diff check: `git diff --check`

**Completion signal**: Active plan is archived, specs/log/backlog reflect implemented automation, and final gates pass.

## Done criteria

- `src/http-contract.js` exports complete route contracts, shared OpenAPI metadata, and route matching.
- `scripts/generate-agonara-openapi.mjs` writes deterministic OpenAPI YAML and enforces `--check`.
- `npm test --workspace agonara` runs the generated-contract check.
- Server routing uses route contract matches and handler keys for method/path dispatch.
- Route-level contract tests read inventory from `routeContracts`.
- `docs/api/openapi.yml` remains the published BYOA substrate and is generated from registry data.
- Existing HTTP/API behavior remains green through the Agonara test suite.
- The plan is moved to `agonara/docs/plans/implemented/` in the implementation closeout commit.

## Final closeout

```
Final gates: ./scripts/run_silent.sh "tests" npm test; ./scripts/run_silent.sh "build" npx tsc --noEmit; git diff --check
Archive plan: move to agonara/docs/plans/implemented/
Commit archive move: yes
Push/PR: follow push policy
```
