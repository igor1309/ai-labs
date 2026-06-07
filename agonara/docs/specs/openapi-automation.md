---
date: 2026-06-07
model: gpt-5
description: "Spec: Agonara route contract registry and generated OpenAPI contract."
version: 0.0.1
status: draft
type: spec
---

# OpenAPI Automation

## Goal

Define the Agonara route contract automation surface that makes route declarations the shared source for server routing, route-level contract tests, and `docs/api/openapi.yml` generation. Owned by the Agonara HTTP server boundary (`src/server.js`) and route contract module.

This spec operationalizes the `OpenAPI automation` backlog item in `docs/backlog.md`. It does not add, remove, rename, or redefine any public HTTP route, auth rule, request body, response envelope, rejection reason, or domain field meaning. Existing route behavior remains governed by the implemented HTTP/domain specs and ADRs; this spec defines how the route-level OpenAPI contract is produced and checked.

## Public interface

### Route contract registry

The route contract registry is exported from `src/http-contract.js`.

```ts
type HttpMethod = "DELETE" | "GET" | "PATCH" | "POST";

type RouteAuth =
  | { kind: "none" }
  | { kind: "session" }
  | { kind: "session"; csrf: true }
  | { kind: "session-or-operations-trigger-token" };

type RoutePathParameter = {
  name: string;
  schema: JsonSchema;
  required: true;
};

type RouteQueryParameter = {
  name: string;
  schema: JsonSchema;
  required: boolean;
};

type RouteRequestBody = {
  contentType: "application/json";
  schema: JsonSchema | { ref: string };
  required: boolean;
};

type RouteResponse = {
  status: number;
  envelope: "accepted" | "rejected" | "fault" | "html" | "health";
  schema?: JsonSchema | { ref: string };
  headers?: Record<string, { ref: string } | JsonSchema>;
};

type RouteContract = {
  method: HttpMethod;
  path: string;                 // OpenAPI path template, e.g. "/programs/{programId}"
  operationId: string;
  tag: "operations" | "identity" | "programs" | "corpus" | "student-workspace" | "curator-workspace" | "ui";
  summary: string;
  auth: RouteAuth;
  pathParameters?: RoutePathParameter[];
  queryParameters?: RouteQueryParameter[];
  requestBody?: RouteRequestBody;
  responses: RouteResponse[];
};

export const routeContracts: readonly RouteContract[];
```

The registry may also export helper data used by the generator, such as reusable schemas, request bodies, responses, headers, security schemes, and tags, provided `routeContracts` remains the complete route inventory.

### Server routing integration

The HTTP server consumes `routeContracts` for route recognition. Server handlers may continue to delegate to existing module-specific handler functions, but the method/path inventory used for dispatch comes from the registry instead of a separate list, regex-only extraction, or the generated OpenAPI file.

The server-facing matcher accepts a request method and pathname and returns either the matching route contract with decoded path parameters or an explicit no-match result.

```ts
matchRoute(input: {
  method: string;
  pathname: string;
}) -> {
  status: "matched";
  contract: RouteContract;
  pathParameters: Record<string, string>;
} | {
  status: "not_found";
};
```

### OpenAPI generator

The generator command lives at `scripts/generate-agonara-openapi.mjs`.

```bash
node scripts/generate-agonara-openapi.mjs
node scripts/generate-agonara-openapi.mjs --check
```

Without `--check`, the command writes `agonara/docs/api/openapi.yml` from the route contract registry and shared OpenAPI metadata. With `--check`, the command generates the contract in memory and exits non-zero when generated output differs from the committed file.

The generated OpenAPI document remains OpenAPI 3.1 and preserves the existing high-level metadata surface: API title/version, servers, tags, security schemes, shared headers, shared request bodies, shared responses, reusable schemas, and operation-level method/path contracts.

### Test and CI contract

`npm test --workspace agonara` runs the OpenAPI generation check as part of the Agonara test gate. CI continues to run the Agonara workspace test command, so a route contract or generator drift fails the Agonara core workflow.

## Behavior rules

1. `routeContracts` contains exactly one entry for every implemented public HTTP method/path pair that Agonara serves.
2. `routeContracts` contains no unimplemented public HTTP method/path pair.
3. Every route contract has a unique `operationId`.
4. Every route contract path uses OpenAPI `{parameterName}` template syntax, and every templated path parameter has a matching required `pathParameters` entry.
5. Every `pathParameters` entry appears in the route path template.
6. Every route contract has exactly one tag from the documented Agonara tag set.
7. Every route contract declares auth requirements explicitly, including no-auth HTML/health/bootstrap routes, session routes, session+CSRF mutation routes, and the operations trigger token alternative.
8. Every state-changing session route declares CSRF requirements unless the governing HTTP spec explicitly keeps that route CSRF-free.
9. Every route with a JSON request body declares a request body schema or reusable request-body reference.
10. Every route declares all possible public HTTP statuses the server can return for that route, including accepted, rejected, and fault responses where applicable.
11. Route response declarations use the existing Agonara envelope vocabulary: `accepted`, `rejected`, `fault`, `html`, or `health`.
12. Rejected responses continue to reference the shared `ApiRejectionReason` schema; the route registry must not introduce route-local hidden rejection vocabularies.
13. The OpenAPI generator produces deterministic YAML for the same registry input: repeated generation without source changes yields byte-identical output.
14. Generated `docs/api/openapi.yml` contains exactly the method/path operations declared in `routeContracts`, with matching `operationId`, tag, summary, security, parameters, request body, and response statuses.
15. `--check` exits `0` when committed `docs/api/openapi.yml` matches generated output.
16. `--check` exits non-zero and prints a concise diff-oriented failure message when committed `docs/api/openapi.yml` differs from generated output.
17. `npm test --workspace agonara` fails when `--check` fails.
18. Route-level contract tests read from `routeContracts` for inventory expectations, so adding/removing a route requires changing the registry and generated OpenAPI contract together.
19. The OpenAPI contract remains the external substrate for BYOA operator skills; automation must not require operator skills to read source files, tests, route handlers, or private runtime modules.
20. The automation does not change existing runtime behavior: request matching, status mapping, response bodies, headers, logging, CSRF/session handling, idempotency handling, and fault redaction remain behaviorally equivalent for all existing routes.

## Product intent traceability

Technical contract automation; no accepted user story changes. The generated OpenAPI contract supports Agonara's API-first and BYOA operating model by keeping the published route substrate authoritative for external operator skills.

## Tests (required)

Route contract registry:

1. `routeContracts_shouldHaveUniqueMethodPathPairs` covers rules 1 and 2.
2. `routeContracts_shouldHaveUniqueOperationIds` covers rule 3.
3. `routeContracts_shouldMatchPathParameterDeclarations` covers rules 4 and 5.
4. `routeContracts_shouldUseKnownTags` covers rule 6.
5. `routeContracts_shouldDeclareAuthForEveryRoute` covers rule 7.
6. `routeContracts_shouldRequireCsrfForSessionMutations` covers rule 8.
7. `routeContracts_shouldDeclareRequestBodiesForJsonMutations` covers rule 9.
8. `routeContracts_shouldDeclareResponsesForEveryPublicStatus` covers rules 10 and 11.
9. `routeContracts_shouldUseSharedRejectionReasonSchema` covers rule 12.

OpenAPI generation:

10. `generateOpenApi_shouldBeDeterministic` covers rule 13.
11. `generateOpenApi_shouldMatchRouteContracts` covers rule 14.
12. `generateOpenApiCheck_shouldPass_whenCommittedContractMatchesGeneratedOutput` covers rule 15.
13. `generateOpenApiCheck_shouldFail_whenCommittedContractDiffersFromGeneratedOutput` covers rule 16.
14. Existing OpenAPI parse/ref/lint tests continue to pass against generated output.

Server and drift guards:

15. `serverRouting_shouldUseRouteContractsForImplementedRoutes` covers rules 1, 2, and 18.
16. Existing focused HTTP API tests continue to pass for Identity, Program, Corpus, Curator Workspace, Student Workspace, Operations, and UI routes, covering rule 20.
17. `agonaraTestGate_shouldRunOpenApiGenerationCheck` covers rule 17.
18. Operator skill contract tests continue to read only the published OpenAPI contract and not server source, covering rule 19.

## Done criteria

- `src/http-contract.js` exports a complete route contract registry for all implemented Agonara public HTTP method/path pairs.
- Server route recognition uses the route contract registry for method/path inventory.
- `scripts/generate-agonara-openapi.mjs` writes deterministic OpenAPI 3.1 YAML from the registry.
- `scripts/generate-agonara-openapi.mjs --check` fails on committed-contract drift.
- `npm test --workspace agonara` runs the generation check, and Agonara CI reaches that check through the existing workspace test command.
- Route-level contract tests no longer depend on hard-coded route inventories or regex extraction from `server.js`.
- Existing HTTP behavior remains unchanged and covered by the current HTTP/API acceptance tests.
- BYOA operator skills continue to consume `docs/api/openapi.yml` as their only route substrate.
- Every behavior rule is covered by a listed test or by existing HTTP/API acceptance coverage.
