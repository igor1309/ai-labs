---
date: 2026-06-07
model: gpt-5
description: "Spec: Agonara route contract registry and generated OpenAPI contract."
version: 0.0.1
status: implemented
type: spec
---

# OpenAPI Automation

## Goal

Define the Agonara route contract automation surface that makes route declarations the shared source for server routing, route-level contract tests, and `docs/api/openapi.yml` generation. Owned by the Agonara HTTP server boundary (`src/server.js`) and route contract module.

This spec operationalizes the `OpenAPI automation` backlog item in `docs/backlog.md`. It does not add, remove, rename, or redefine any public HTTP route, auth rule, request body, response envelope, rejection reason, or domain field meaning. Existing route behavior remains governed by the implemented HTTP/domain specs and ADRs; this spec defines how the route-level OpenAPI contract is produced and checked.

## Implementation status

Implemented by [OpenAPI Automation Implementation Plan](../plans/implemented/openapi-automation.md).

### Implementation Evidence

- Route contract registry and route matcher: [http-contract.js](../../src/http-contract.js)
- Deterministic OpenAPI document generation: [openapi-generator.js](../../src/openapi-generator.js)
- Generator CLI and `--check` mode: [generate-agonara-openapi.mjs](../../scripts/generate-agonara-openapi.mjs)
- Generated OpenAPI contract: [openapi.yml](../api/openapi.yml)
- Server dispatch through registry route matches: [server.js](../../src/server.js)
- Registry, generator, check-mode, route matching, and test-gate coverage: [openapi-contract.test.js](../../tests/openapi-contract.test.js)
- Workspace test gate wiring: [package.json](../../package.json)

The implemented automation keeps `docs/api/openapi.yml` as the published BYOA operator-skill substrate while making `routeContracts` and `openApiContractMetadata` the source for generated route-level OpenAPI output. The server uses registry matches for top-level method/path dispatch and preserves existing module-specific handler behavior.

## Public interface

### Route contract registry

The route contract registry is exported from `src/http-contract.js`.

```ts
type JsonSchema = Record<string, unknown>;

type HttpMethod = "DELETE" | "GET" | "PATCH" | "POST";

type OpenApiRef = { ref: string };

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
  schema: JsonSchema | OpenApiRef;
  required: boolean;
};

type RouteResponse = {
  status: number;
  envelope: "accepted" | "rejected" | "fault" | "html" | "health";
  schema?: JsonSchema | OpenApiRef;
  headers?: Record<string, OpenApiRef | JsonSchema>;
};

type RouteContract = {
  method: HttpMethod;
  path: string;                 // OpenAPI path template, e.g. "/programs/{programId}"
  operationId: string;
  handlerKey: string;           // server-only dispatch key, omitted from generated OpenAPI
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

The registry also exports the shared OpenAPI metadata and reusable components that are not route-specific:

```ts
type OpenApiContractMetadata = {
  openapi: "3.1.0";
  info: {
    title: string;
    version: string;
    summary?: string;
    description?: string;
    license?: Record<string, string>;
  };
  servers: { url: string; description?: string }[];
  tags: { name: RouteContract["tag"]; description?: string }[];
  security?: Record<string, string[]>[];
  components: {
    securitySchemes: Record<string, JsonSchema>;
    schemas: Record<string, JsonSchema>;
    requestBodies: Record<string, JsonSchema>;
    responses: Record<string, JsonSchema>;
    headers: Record<string, JsonSchema>;
  };
};

export const openApiContractMetadata: OpenApiContractMetadata;
```

`routeContracts` remains the complete route inventory. `openApiContractMetadata` supplies only document metadata and reusable component definitions; it must not add path operations.

### Server routing integration

The HTTP server consumes `routeContracts` for route recognition. Server handlers may continue to delegate to existing module-specific handler functions, but the method/path inventory and server dispatch key come from the registry instead of a separate list, regex-only extraction, or the generated OpenAPI file.

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
4. Every route contract has a unique `handlerKey`.
5. Server dispatch selects the handler from the matched route contract's `handlerKey`; it must not maintain a second method/path-to-handler inventory.
6. Every route contract path uses OpenAPI `{parameterName}` template syntax, and every templated path parameter has a matching required `pathParameters` entry.
7. Every `pathParameters` entry appears in the route path template.
8. Every route contract has exactly one tag from the documented Agonara tag set.
9. Every route contract declares auth requirements explicitly, including no-auth HTML/health/bootstrap routes, session routes, session+CSRF mutation routes, and the operations trigger token alternative.
10. Every state-changing session route declares CSRF requirements unless the governing HTTP spec explicitly keeps that route CSRF-free.
11. Every route with a JSON request body declares a request body schema or reusable request-body reference.
12. Every route declares all possible public HTTP statuses the server can return for that route, including accepted, rejected, and fault responses where applicable.
13. Route response declarations use the existing Agonara envelope vocabulary: `accepted`, `rejected`, `fault`, `html`, or `health`.
14. Rejected responses continue to reference the shared `ApiRejectionReason` schema; the route registry must not introduce route-local hidden rejection vocabularies.
15. `openApiContractMetadata` supplies document-level metadata and reusable components, and generated local `$ref` values resolve inside the generated document.
16. The OpenAPI generator produces deterministic YAML for the same registry input: repeated generation without source changes yields byte-identical output.
17. Generated `docs/api/openapi.yml` contains exactly the method/path operations declared in `routeContracts`, with matching `operationId`, tag, summary, security, parameters, request body, and response statuses.
18. Generated `docs/api/openapi.yml` omits server-only fields, including `handlerKey`.
19. `--check` exits `0` when committed `docs/api/openapi.yml` matches generated output.
20. `--check` exits non-zero and prints a concise diff-oriented failure message when committed `docs/api/openapi.yml` differs from generated output.
21. `npm test --workspace agonara` fails when `--check` fails.
22. Route-level contract tests read from `routeContracts` for inventory expectations, so adding/removing a route requires changing the registry and generated OpenAPI contract together.
23. The OpenAPI contract remains the external substrate for BYOA operator skills; automation must not require operator skills to read source files, tests, route handlers, or private runtime modules.
24. The automation does not change existing runtime behavior: request matching, status mapping, response bodies, headers, logging, CSRF/session handling, idempotency handling, and fault redaction remain behaviorally equivalent for all existing routes.

## Product intent traceability

Technical contract automation; no accepted user story changes. The generated OpenAPI contract supports Agonara's API-first and BYOA operating model by keeping the published route substrate authoritative for external operator skills.

## Tests (required)

Route contract registry:

1. `routeContracts_shouldHaveUniqueMethodPathPairs` covers rules 1 and 2.
2. `routeContracts_shouldHaveUniqueOperationIds` covers rule 3.
3. `routeContracts_shouldHaveUniqueHandlerKeys` covers rule 4.
4. `routeContracts_shouldMatchPathParameterDeclarations` covers rules 6 and 7.
5. `routeContracts_shouldUseKnownTags` covers rule 8.
6. `routeContracts_shouldDeclareAuthForEveryRoute` covers rule 9.
7. `routeContracts_shouldRequireCsrfForSessionMutations` covers rule 10.
8. `routeContracts_shouldDeclareRequestBodiesForJsonMutations` covers rule 11.
9. `routeContracts_shouldDeclareResponsesForEveryPublicStatus` covers rules 12 and 13.
10. `routeContracts_shouldUseSharedRejectionReasonSchema` covers rule 14.
11. `openApiMetadata_shouldResolveLocalComponentRefs` covers rule 15.

OpenAPI generation:

12. `generateOpenApi_shouldBeDeterministic` covers rule 16.
13. `generateOpenApi_shouldMatchRouteContracts` covers rule 17.
14. `generateOpenApi_shouldOmitServerOnlyFields` covers rule 18.
15. `generateOpenApiCheck_shouldPass_whenCommittedContractMatchesGeneratedOutput` covers rule 19.
16. `generateOpenApiCheck_shouldFail_whenCommittedContractDiffersFromGeneratedOutput` covers rule 20.
17. Existing OpenAPI parse/ref/lint tests continue to pass against generated output.

Server and drift guards:

18. `serverRouting_shouldUseRouteContractsForImplementedRoutes` covers rules 1, 2, 5, and 22.
19. Existing focused HTTP API tests continue to pass for Identity, Program, Corpus, Curator Workspace, Student Workspace, Operations, and UI routes, covering rule 24.
20. `agonaraTestGate_shouldRunOpenApiGenerationCheck` covers rule 21.
21. Operator skill contract tests continue to read only the published OpenAPI contract and not server source, covering rule 23.

## Done criteria

- `src/http-contract.js` exports a complete route contract registry for all implemented Agonara public HTTP method/path pairs.
- Server route recognition uses the route contract registry for method/path inventory and handler dispatch keys.
- `scripts/generate-agonara-openapi.mjs` writes deterministic OpenAPI 3.1 YAML from the registry.
- `scripts/generate-agonara-openapi.mjs --check` fails on committed-contract drift.
- `npm test --workspace agonara` runs the generation check, and Agonara CI reaches that check through the existing workspace test command.
- Route-level contract tests no longer depend on hard-coded route inventories or regex extraction from `server.js`.
- Generated OpenAPI output omits server-only registry fields and still resolves all local `$ref` values.
- Existing HTTP behavior remains unchanged and covered by the current HTTP/API acceptance tests.
- BYOA operator skills continue to consume `docs/api/openapi.yml` as their only route substrate.
- Every behavior rule is covered by a listed test or by existing HTTP/API acceptance coverage.
