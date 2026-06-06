---
date: 2026-06-06
model: claude
description: "Spec: Agonara operational health endpoint surfaces the running release version."
version: 0.0.1
status: implemented
type: spec
---

# Operations Health Version

## Goal

Surface the running Agonara release version on the `GET /operations/health` response so the deployment job can assert the live version after a deploy, mirroring how nomos verifies a deploy by matching `"version"` in its health payload. Owned by the operational server surface (`src/server.js`).

This operationalizes the version-verify prerequisite (`deployment-handoff.md` §6a) that the staging/production deploy steps depend on. It is not gated by the §5 ADR/spec gates. It does not add a new route, change authorization, alter the existing health status/request-id contract, or introduce diagnostics, metrics, or build metadata beyond the version string.

## Public interface

`createServer` accepts an injected version and includes it in the health response:

```ts
createServer(options: {
  // ...existing options...
  version?: string; // default "0.0.0"
}) -> http.Server
```

`GET /operations/health` response body:

```ts
{
  status: string;     // unchanged — from healthCheck()
  version: string;    // new — the configured running version
  checkedAt: string;  // unchanged — ISO timestamp
  requestId: string;  // unchanged
}
```

The composition root sources the real version from `package.json` at runtime:

```ts
readPackageVersion() -> string            // reads version from package.json

startServer(options: {
  // ...existing options...
  version?: string; // default readPackageVersion()
}) -> http.Server
```

## Behavior rules

1. `GET /operations/health` includes a `version` string field in addition to the existing `status`, `checkedAt`, and `requestId` fields.
2. `createServer` surfaces the `version` it was configured with, unchanged, in the health response.
3. When `createServer` is not given a `version`, the health response reports the default `"0.0.0"`.
4. `readPackageVersion` returns the `version` field declared in the package manifest (`package.json`).
5. `startServer` defaults its `version` to `readPackageVersion()` and injects it into `createServer`, so a deployed instance reports its real release version.
6. Adding the `version` field does not change the health `status` value, the `checkedAt` timestamp, the `requestId` echo behavior, the `200` status code, or the structured completion log for `GET /operations/health`.

## Product intent traceability

Operational/technical surface; no accepted user story changes. The version field exists to make deploys verifiable, supporting the admin operational responsibility committed by [ADR-017](../adr/adr-017-private-instance-deployment-operational-boundary.md).

## Tests (required)

1. `operationsHealth_shouldReportConfiguredVersion` — health reports the version injected into `createServer` (rules 1, 2).
2. `operationsHealth_shouldDefaultVersion_whenNotConfigured` — health reports `"0.0.0"` when no version is configured (rule 3).
3. `startServer_shouldSurfacePackageVersion_throughHealth` — a server started via `startServer` reports `readPackageVersion()` through health (rules 4, 5).
4. Existing operations health tests continue to pass, proving the status, request-id, and completion-log contract is unchanged (rule 6).
5. CI container smoke (`agonara-core.yml`) asserts the health payload contains the version from `package.json`, proving the field survives the Docker image build/runtime path.

## Done criteria

- `GET /operations/health` returns a `version` field sourced from `package.json` at runtime.
- The version is injected through the composition root (`startServer` → `createServer`), not read inside the request handler.
- The existing health contract (status, checkedAt, requestId, status code, completion log) is unchanged and still covered by tests.
- The container smoke verifies the version field end-to-end through the built image.
- Every behavior rule is covered by a listed test.
