---
date: 2026-06-07
model: gpt-5
description: "Traceability review: OpenAPI automation spec to test names."
skill: traceability-review
skill_version: "0.12.0"
scope: "spec ↔ tests: agonara OpenAPI automation"
mechanism: "names-only bidirectional matrix"
inputs:
  - file: "agonara/docs/specs/openapi-automation.md"
    version: "0.0.1"
    status: "implemented"
  - file: "agonara/tests/openapi-contract.test.js"
    status: "committed at 2e20fd95"
  - file: "agonara/tests/operator-skill-contract.test.js"
    status: "committed at 2e20fd95"
  - file: "agonara/tests/http-api.test.js"
    status: "committed at 2e20fd95"
---

# Traceability Review - OpenAPI Automation Spec to Tests

## Summary

Scope enumerated 24 behavior-rule clauses from `agonara/docs/specs/openapi-automation.md`.
Verdict breakdown: 24 carried, 0 untested, 0 orphan OpenAPI-automation test names, 0 findings, 1 open question.

Verdict: the OpenAPI automation behavior rules are traceable to named tests, with one names-only limitation for the negative BYOA guarantee that operator skills do not read source files.

## Complete Enumeration

| id | spec clause | evidence | verdict |
| --- | --- | --- | --- |
| BR-01 | `routeContracts` contains exactly one entry for every implemented public HTTP method/path pair that Agonara serves (`agonara/docs/specs/openapi-automation.md:163`). | `routeContracts_shouldHaveUniqueMethodPathPairs` (`agonara/tests/openapi-contract.test.js:60`); `serverRouting_shouldUseRouteContractsForImplementedRoutes` (`agonara/tests/openapi-contract.test.js:201`); focused HTTP route tests such as `programsList_shouldReturnCreatedPrograms_onActiveSession` (`agonara/tests/http-api.test.js:7184`) and `corpusSourcesList_shouldReturnOnlyRequestedProgramSources_forCurator` (`agonara/tests/http-api.test.js:4418`). | carried |
| BR-02 | `routeContracts` contains no unimplemented public HTTP method/path pair (`agonara/docs/specs/openapi-automation.md:164`). | `routeContracts_shouldHaveUniqueMethodPathPairs` (`agonara/tests/openapi-contract.test.js:60`); `serverRouting_shouldUseRouteContractsForImplementedRoutes` (`agonara/tests/openapi-contract.test.js:201`); out-of-scope route guards such as `quickCheckProductUiLearnRoute_shouldKeepOutOfScopeRoutesAbsent` (`agonara/tests/http-api.test.js:136`). | carried |
| BR-03 | Every route contract has a unique `operationId` (`agonara/docs/specs/openapi-automation.md:165`). | `routeContracts_shouldHaveUniqueOperationIds` (`agonara/tests/openapi-contract.test.js:67`). | carried |
| BR-04 | Every route contract has a unique `handlerKey` (`agonara/docs/specs/openapi-automation.md:166`). | `routeContracts_shouldHaveUniqueHandlerKeys` (`agonara/tests/openapi-contract.test.js:74`). | carried |
| BR-05 | Server dispatch selects the handler from the matched route contract's `handlerKey` and avoids a second method/path-to-handler inventory (`agonara/docs/specs/openapi-automation.md:167`). | `serverRouting_shouldUseRouteContractsForImplementedRoutes` (`agonara/tests/openapi-contract.test.js:201`); `serverRouting_shouldCoverEveryHandlerKeyPrefix` (`agonara/tests/openapi-contract.test.js:216`). | carried |
| BR-06 | Every route contract path uses OpenAPI template syntax and every templated parameter has a required `pathParameters` entry (`agonara/docs/specs/openapi-automation.md:168`). | `routeContracts_shouldMatchPathParameterDeclarations` (`agonara/tests/openapi-contract.test.js:81`). | carried |
| BR-07 | Every `pathParameters` entry appears in the route path template (`agonara/docs/specs/openapi-automation.md:169`). | `routeContracts_shouldMatchPathParameterDeclarations` (`agonara/tests/openapi-contract.test.js:81`). | carried |
| BR-08 | Every route contract uses exactly one documented Agonara tag (`agonara/docs/specs/openapi-automation.md:170`). | `routeContracts_shouldUseKnownTags` (`agonara/tests/openapi-contract.test.js:93`). | carried |
| BR-09 | Every route declares auth requirements explicitly (`agonara/docs/specs/openapi-automation.md:171`). | `routeContracts_shouldDeclareAuthForEveryRoute` (`agonara/tests/openapi-contract.test.js:101`). | carried |
| BR-10 | Every state-changing session route declares CSRF unless explicitly governed CSRF-free (`agonara/docs/specs/openapi-automation.md:172`). | `routeContracts_shouldRequireCsrfForSessionMutations` (`agonara/tests/openapi-contract.test.js:109`); behavior examples include `quickCheckCandidateRoutes_shouldRejectMissingAndInvalidCsrf_beforeMutation` (`agonara/tests/http-api.test.js:595`). | carried |
| BR-11 | Every route with a JSON request body declares a schema or reusable request-body reference (`agonara/docs/specs/openapi-automation.md:173`). | `routeContracts_shouldDeclareRequestBodiesForJsonMutations` (`agonara/tests/openapi-contract.test.js:119`). | carried |
| BR-12 | Every route declares all possible public HTTP statuses including accepted, rejected, and fault where applicable (`agonara/docs/specs/openapi-automation.md:174`). | `routeContracts_shouldDeclareResponsesForEveryPublicStatus` (`agonara/tests/openapi-contract.test.js:128`); `openApiContract_shouldMatchHttpStatusRejectionReasons_onGeneratedContract` (`agonara/tests/openapi-contract.test.js:43`). | carried |
| BR-13 | Route responses use the Agonara envelope vocabulary (`agonara/docs/specs/openapi-automation.md:175`). | `routeContracts_shouldDeclareResponsesForEveryPublicStatus` (`agonara/tests/openapi-contract.test.js:128`). | carried |
| BR-14 | Rejected responses keep using shared `ApiRejectionReason` rather than route-local hidden vocabularies (`agonara/docs/specs/openapi-automation.md:176`). | `routeContracts_shouldUseSharedRejectionReasonSchema` (`agonara/tests/openapi-contract.test.js:136`); `openApiContract_shouldMatchHttpStatusRejectionReasons_onGeneratedContract` (`agonara/tests/openapi-contract.test.js:43`). | carried |
| BR-15 | `openApiContractMetadata` supplies document-level metadata and reusable components, and generated local refs resolve (`agonara/docs/specs/openapi-automation.md:177`). | `openApiMetadata_shouldResolveLocalComponentRefs` (`agonara/tests/openapi-contract.test.js:146`); `openApiContract_shouldResolveLocalRefs_onGeneratedContract` (`agonara/tests/openapi-contract.test.js:26`). | carried |
| BR-16 | The generator is deterministic for the same registry input (`agonara/docs/specs/openapi-automation.md:178`). | `generateOpenApi_shouldBeDeterministic` (`agonara/tests/openapi-contract.test.js:156`). | carried |
| BR-17 | Generated `docs/api/openapi.yml` contains exactly the route operations declared in `routeContracts`, with matching route-level contract fields (`agonara/docs/specs/openapi-automation.md:179`). | `generateOpenApi_shouldMatchRouteContracts` (`agonara/tests/openapi-contract.test.js:160`). | carried |
| BR-18 | Generated OpenAPI omits server-only fields including `handlerKey` (`agonara/docs/specs/openapi-automation.md:180`). | `generateOpenApi_shouldOmitServerOnlyFields` (`agonara/tests/openapi-contract.test.js:167`). | carried |
| BR-19 | `--check` exits `0` when the committed contract matches generated output (`agonara/docs/specs/openapi-automation.md:181`). | `generateOpenApiCheck_shouldPass_whenCommittedContractMatchesGeneratedOutput` (`agonara/tests/openapi-contract.test.js:173`). | carried |
| BR-20 | `--check` exits non-zero and prints a concise diff-oriented failure message on drift (`agonara/docs/specs/openapi-automation.md:182`). | `generateOpenApiCheck_shouldFail_whenCommittedContractDiffersFromGeneratedOutput` (`agonara/tests/openapi-contract.test.js:183`). | carried |
| BR-21 | `npm test --workspace agonara` fails when `--check` fails (`agonara/docs/specs/openapi-automation.md:183`). | `agonaraTestGate_shouldRunOpenApiGenerationCheck` (`agonara/tests/openapi-contract.test.js:225`). | carried |
| BR-22 | Route-level contract tests read inventory from `routeContracts` so registry and generated contract change together (`agonara/docs/specs/openapi-automation.md:184`). | `serverRouting_shouldUseRouteContractsForImplementedRoutes` (`agonara/tests/openapi-contract.test.js:201`); `generateOpenApi_shouldMatchRouteContracts` (`agonara/tests/openapi-contract.test.js:160`). | carried |
| BR-23 | The published OpenAPI contract remains the external BYOA substrate; automation must not require operator skills to read source files, tests, route handlers, or private runtime modules (`agonara/docs/specs/openapi-automation.md:185`). | `operatorSkills_shouldOnlyCiteRoutesPresentInOpenApi_onSkillRouteReferences` (`agonara/tests/operator-skill-contract.test.js:11`). See OQ-1. | carried with open question |
| BR-24 | Runtime behavior remains equivalent for matching, statuses, responses, headers, logging, CSRF/session handling, idempotency, and fault redaction (`agonara/docs/specs/openapi-automation.md:186`). | Focused behavior titles include `identityBootstrap_shouldSetCookieAndHideSessionId_onAcceptedBootstrap` (`agonara/tests/http-api.test.js:35`), `quickCheckAttemptRoutes_shouldRejectMissingMalformedIdempotencyHeader_beforeSubmission` (`agonara/tests/http-api.test.js:651`), `quickCheckCandidateRoutes_shouldRedactFaultResponsesAndLogs` (`agonara/tests/http-api.test.js:699`), `httpApiRoutes_shouldEmitCompletionLogs_onAcceptedRequests` (`agonara/tests/http-api.test.js:10593`), and `httpApiRoutes_shouldEmitCompletionLogs_onRejectedRequests` (`agonara/tests/http-api.test.js:10663`). | carried |

## Backward Test-Name Register

| test title | evidence | trace |
| --- | --- | --- |
| `openApiContract_shouldResolveLocalRefs_onGeneratedContract` | `agonara/tests/openapi-contract.test.js:26` | BR-15 |
| `openApiContract_shouldMatchHttpStatusRejectionReasons_onGeneratedContract` | `agonara/tests/openapi-contract.test.js:43` | BR-12, BR-14 |
| `routeContracts_shouldHaveUniqueMethodPathPairs` | `agonara/tests/openapi-contract.test.js:60` | BR-01, BR-02 |
| `routeContracts_shouldHaveUniqueOperationIds` | `agonara/tests/openapi-contract.test.js:67` | BR-03 |
| `routeContracts_shouldHaveUniqueHandlerKeys` | `agonara/tests/openapi-contract.test.js:74` | BR-04 |
| `routeContracts_shouldMatchPathParameterDeclarations` | `agonara/tests/openapi-contract.test.js:81` | BR-06, BR-07 |
| `routeContracts_shouldUseKnownTags` | `agonara/tests/openapi-contract.test.js:93` | BR-08 |
| `routeContracts_shouldDeclareAuthForEveryRoute` | `agonara/tests/openapi-contract.test.js:101` | BR-09 |
| `routeContracts_shouldRequireCsrfForSessionMutations` | `agonara/tests/openapi-contract.test.js:109` | BR-10 |
| `routeContracts_shouldDeclareRequestBodiesForJsonMutations` | `agonara/tests/openapi-contract.test.js:119` | BR-11 |
| `routeContracts_shouldDeclareResponsesForEveryPublicStatus` | `agonara/tests/openapi-contract.test.js:128` | BR-12, BR-13 |
| `routeContracts_shouldUseSharedRejectionReasonSchema` | `agonara/tests/openapi-contract.test.js:136` | BR-14 |
| `openApiMetadata_shouldResolveLocalComponentRefs` | `agonara/tests/openapi-contract.test.js:146` | BR-15 |
| `generateOpenApi_shouldBeDeterministic` | `agonara/tests/openapi-contract.test.js:156` | BR-16 |
| `generateOpenApi_shouldMatchRouteContracts` | `agonara/tests/openapi-contract.test.js:160` | BR-17, BR-22 |
| `generateOpenApi_shouldOmitServerOnlyFields` | `agonara/tests/openapi-contract.test.js:167` | BR-18 |
| `generateOpenApiCheck_shouldPass_whenCommittedContractMatchesGeneratedOutput` | `agonara/tests/openapi-contract.test.js:173` | BR-19 |
| `generateOpenApiCheck_shouldFail_whenCommittedContractDiffersFromGeneratedOutput` | `agonara/tests/openapi-contract.test.js:183` | BR-20 |
| `serverRouting_shouldUseRouteContractsForImplementedRoutes` | `agonara/tests/openapi-contract.test.js:201` | BR-01, BR-02, BR-05, BR-22 |
| `serverRouting_shouldRejectMethodMismatches` | `agonara/tests/openapi-contract.test.js:209` | BR-24 |
| `serverRouting_shouldCoverEveryHandlerKeyPrefix` | `agonara/tests/openapi-contract.test.js:216` | BR-05 |
| `agonaraTestGate_shouldRunOpenApiGenerationCheck` | `agonara/tests/openapi-contract.test.js:225` | BR-21 |
| `operatorSkills_shouldOnlyCiteRoutesPresentInOpenApi_onSkillRouteReferences` | `agonara/tests/operator-skill-contract.test.js:11` | BR-23 |

## Findings

None.

## Open Questions

### OQ-1 - BYOA source-file absence guarantee is names-only limited

Resolving layer: tests

`operatorSkills_shouldOnlyCiteRoutesPresentInOpenApi_onSkillRouteReferences` (`agonara/tests/operator-skill-contract.test.js:11`) traces the positive OpenAPI-substrate requirement in BR-23 (`agonara/docs/specs/openapi-automation.md:185`). The clause also contains a negative guarantee that automation must not require operator skills to read source files, tests, route handlers, or private runtime modules. Per the traceability-review pass notes, test names alone cannot prove an absence guarantee. If this needs names-only traceability rather than body-level confidence, add or rename a test so the title states that operator skills consume only the published OpenAPI contract.

## Inspected

- `agonara/docs/specs/openapi-automation.md` behavior rules BR-01 through BR-24 (`agonara/docs/specs/openapi-automation.md:163-186`)
- `agonara/tests/openapi-contract.test.js` OpenAPI automation test titles (`agonara/tests/openapi-contract.test.js:26-225`)
- `agonara/tests/operator-skill-contract.test.js` operator skill route-reference test title (`agonara/tests/operator-skill-contract.test.js:11`)
- Representative existing HTTP/API behavior test titles in `agonara/tests/http-api.test.js` for route behavior equivalence (`agonara/tests/http-api.test.js:35`, `agonara/tests/http-api.test.js:651`, `agonara/tests/http-api.test.js:699`, `agonara/tests/http-api.test.js:10593`, `agonara/tests/http-api.test.js:10663`)
