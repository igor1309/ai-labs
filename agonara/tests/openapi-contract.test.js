import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { parseDocument } from "yaml";
import {
  extractPathParameterNames,
  openApiContractMetadata,
  routeContracts,
  matchRoute,
} from "../src/http-contract.js";
import {
  generateOpenApiDocument,
  generateOpenApiYaml,
} from "../src/openapi-generator.js";

const openApiPath = fileURLToPath(new URL("../docs/api/openapi.yml", import.meta.url));
const serverPath = fileURLToPath(new URL("../src/server.js", import.meta.url));
const generatorPath = fileURLToPath(new URL("../scripts/generate-agonara-openapi.mjs", import.meta.url));
const openApiRouteMethods = Object.freeze(["delete", "get", "patch", "post", "put"]);
const knownTags = new Set(openApiContractMetadata.tags.map(($0) => $0.name));

test("openApiContract_shouldResolveLocalRefs_onGeneratedContract", () => {
  const document = parseDocument(readFileSync(openApiPath, "utf8"), { prettyErrors: false });
  const parseErrors = document.errors.map($0 => $0.message);
  const contract = parseErrors.length === 0 ? document.toJS() : {};
  const refs = collectRefs(contract);
  const externalRefs = refs.filter($0 => !$0.ref.startsWith("#/")).map(formatRefFailure);
  const unresolvedRefs = refs
    .filter($0 => $0.ref.startsWith("#/"))
    .filter($0 => !hasLocalRef(contract, $0.ref))
    .map(formatRefFailure);

  assert.deepEqual(
    { externalRefs, parseErrors, unresolvedRefs },
    { externalRefs: [], parseErrors: [], unresolvedRefs: [] },
  );
});

test("openApiContract_shouldMatchHttpStatusRejectionReasons_onGeneratedContract", () => {
  const contract = readOpenApiContract();
  const apiRejectionReasons = contract.components.schemas.ApiRejectionReason.enum;
  const httpStatusReasons = collectHttpStatusReasons(readFileSync(serverPath, "utf8"));

  assert.deepEqual(
    {
      undocumentedHttpStatusReasons: httpStatusReasons.filter($0 => !apiRejectionReasons.includes($0)),
      unmappedApiRejectionReasons: apiRejectionReasons.filter($0 => !httpStatusReasons.includes($0)),
    },
    {
      undocumentedHttpStatusReasons: [],
      unmappedApiRejectionReasons: [],
    },
  );
});

test("routeContracts_shouldHaveUniqueMethodPathPairs", () => {
  const methodPathPairs = routeContracts.map(formatRouteContract);
  const uniqueMethodPathPairs = [...new Set(methodPathPairs)];

  assert.deepEqual(methodPathPairs, uniqueMethodPathPairs);
});

test("routeContracts_shouldHaveUniqueOperationIds", () => {
  const operationIds = routeContracts.map($0 => $0.operationId);
  const uniqueOperationIds = [...new Set(operationIds)];

  assert.deepEqual(operationIds, uniqueOperationIds);
});

test("routeContracts_shouldHaveUniqueHandlerKeys", () => {
  const handlerKeys = routeContracts.map($0 => $0.handlerKey);
  const uniqueHandlerKeys = [...new Set(handlerKeys)];

  assert.deepEqual(handlerKeys, uniqueHandlerKeys);
});

test("routeContracts_shouldMatchPathParameterDeclarations", () => {
  const mismatches = routeContracts
    .map((route) => ({
      declared: (route.pathParameters ?? []).map($0 => $0.name).sort(),
      expected: extractPathParameterNames(route.path).sort(),
      route: formatRouteContract(route),
    }))
    .filter(({ declared, expected }) => JSON.stringify(declared) !== JSON.stringify(expected));

  assert.deepEqual(mismatches, []);
});

test("routeContracts_shouldUseKnownTags", () => {
  const unknownTags = routeContracts
    .filter($0 => !knownTags.has($0.tag))
    .map(formatRouteContract);

  assert.deepEqual(unknownTags, []);
});

test("routeContracts_shouldDeclareAuthForEveryRoute", () => {
  const missingAuth = routeContracts
    .filter($0 => !$0.auth?.kind)
    .map(formatRouteContract);

  assert.deepEqual(missingAuth, []);
});

test("routeContracts_shouldRequireCsrfForSessionMutations", () => {
  const missingCsrf = routeContracts
    .filter($0 => $0.method !== "GET")
    .filter($0 => $0.auth.kind === "session")
    .filter($0 => $0.auth.csrf !== true)
    .map(formatRouteContract);

  assert.deepEqual(missingCsrf, []);
});

test("routeContracts_shouldDeclareRequestBodiesForJsonMutations", () => {
  const invalidRequestBodies = routeContracts
    .filter($0 => $0.requestBody)
    .filter($0 => $0.requestBody.contentType !== "application/json" || !$0.requestBody.schema)
    .map(formatRouteContract);

  assert.deepEqual(invalidRequestBodies, []);
});

test("routeContracts_shouldDeclareMaterialContentBodiesAndPaginationQueries", () => {
  assert.deepEqual(
    {
      readMaterialContent: contentQueryProjection(routeContract("GET", "/materials/{entityId}/content")),
      readMaterialRevisionContent: contentQueryProjection(routeContract("GET", "/materials/revisions/{revisionId}/content")),
      readSourceContent: contentQueryProjection(routeContract("GET", "/sources/{sourceId}/content")),
      setAcceptedMaterialContent: requestBodyProjection(routeContract("PUT", "/materials/revisions/{revisionId}/content")),
      setSourceContent: requestBodyProjection(routeContract("PUT", "/sources/{sourceId}/content")),
    },
    {
      readMaterialContent: {
        cursor: { minLength: 1, type: "string" },
        limit: { maximum: 1048576, minimum: 1, type: "integer" },
      },
      readMaterialRevisionContent: {
        cursor: { minLength: 1, type: "string" },
        limit: { maximum: 1048576, minimum: 1, type: "integer" },
      },
      readSourceContent: {
        cursor: { minLength: 1, type: "string" },
        limit: { maximum: 1048576, minimum: 1, type: "integer" },
      },
      setAcceptedMaterialContent: {
        contentType: "application/json",
        required: true,
        schemaRef: "#/components/requestBodies/SetAcceptedMaterialContent",
      },
      setSourceContent: {
        contentType: "application/json",
        required: true,
        schemaRef: "#/components/requestBodies/SetSourceContent",
      },
    },
  );
});

test("routeContracts_shouldDeclareLifecycleAndDeletionRoutes", () => {
  assert.deepEqual(
    {
      corpusStatus: {
        ...mutationRouteProjection(routeContract("PUT", "/corpus/{entityId}/status")),
        requestBody: requestBodyProjection(routeContract("PUT", "/corpus/{entityId}/status")),
      },
      criterionStatus: {
        ...mutationRouteProjection(routeContract("PUT", "/assessment-criteria/{entityId}/status")),
        requestBody: requestBodyProjection(routeContract("PUT", "/assessment-criteria/{entityId}/status")),
      },
      deleteSource: mutationRouteProjection(routeContract("DELETE", "/sources/{sourceId}")),
      navigationRelationshipStatus: {
        ...mutationRouteProjection(routeContract("PUT", "/navigation-relationships/{entityId}/status")),
        requestBody: requestBodyProjection(routeContract("PUT", "/navigation-relationships/{entityId}/status")),
      },
      quickCheckStatus: {
        ...mutationRouteProjection(routeContract("PUT", "/quick-checks/{entityId}/status")),
        requestBody: requestBodyProjection(routeContract("PUT", "/quick-checks/{entityId}/status")),
      },
      openAnswerStatus: {
        ...mutationRouteProjection(routeContract("PUT", "/open-answer-checks/{entityId}/status")),
        requestBody: requestBodyProjection(routeContract("PUT", "/open-answer-checks/{entityId}/status")),
      },
      readinessStatus: {
        ...mutationRouteProjection(routeContract("PUT", "/readiness-checks/{entityId}/status")),
        requestBody: requestBodyProjection(routeContract("PUT", "/readiness-checks/{entityId}/status")),
      },
      setSourceStatus: {
        ...mutationRouteProjection(routeContract("PUT", "/sources/{sourceId}/status")),
        requestBody: requestBodyProjection(routeContract("PUT", "/sources/{sourceId}/status")),
      },
    },
    {
      corpusStatus: {
        csrf: true,
        handlerKey: "corpus.setAcceptedCorpusLifecycleStatus",
        operationId: "setAcceptedCorpusLifecycleStatus",
        requestBody: {
          contentType: "application/json",
          required: true,
          schemaRef: "#/components/requestBodies/LifecycleStatus",
        },
      },
      criterionStatus: {
        csrf: true,
        handlerKey: "corpus.setAcceptedAssessmentCriterionLifecycleStatus",
        operationId: "setAcceptedAssessmentCriterionLifecycleStatus",
        requestBody: {
          contentType: "application/json",
          required: true,
          schemaRef: "#/components/requestBodies/LifecycleStatus",
        },
      },
      deleteSource: {
        csrf: true,
        handlerKey: "corpus.deleteProgramSource",
        operationId: "deleteProgramSource",
      },
      navigationRelationshipStatus: {
        csrf: true,
        handlerKey: "corpus.setAcceptedNavigationRelationshipLifecycleStatus",
        operationId: "setAcceptedNavigationRelationshipLifecycleStatus",
        requestBody: {
          contentType: "application/json",
          required: true,
          schemaRef: "#/components/requestBodies/LifecycleStatus",
        },
      },
      quickCheckStatus: {
        csrf: true,
        handlerKey: "corpus.setAcceptedQuickCheckLifecycleStatus",
        operationId: "setAcceptedQuickCheckLifecycleStatus",
        requestBody: {
          contentType: "application/json",
          required: true,
          schemaRef: "#/components/requestBodies/LifecycleStatus",
        },
      },
      openAnswerStatus: {
        csrf: true,
        handlerKey: "corpus.setAcceptedOpenAnswerCheckLifecycleStatus",
        operationId: "setAcceptedOpenAnswerCheckLifecycleStatus",
        requestBody: {
          contentType: "application/json",
          required: true,
          schemaRef: "#/components/requestBodies/LifecycleStatus",
        },
      },
      readinessStatus: {
        csrf: true,
        handlerKey: "corpus.setAcceptedReadinessCheckLifecycleStatus",
        operationId: "setAcceptedReadinessCheckLifecycleStatus",
        requestBody: {
          contentType: "application/json",
          required: true,
          schemaRef: "#/components/requestBodies/LifecycleStatus",
        },
      },
      setSourceStatus: {
        csrf: true,
        handlerKey: "corpus.setProgramSourceLifecycleStatus",
        operationId: "setProgramSourceLifecycleStatus",
        requestBody: {
          contentType: "application/json",
          required: true,
          schemaRef: "#/components/requestBodies/LifecycleStatus",
        },
      },
    },
  );
});

test("routeContracts_shouldDeclareResponsesForEveryPublicStatus", () => {
  const missingResponses = routeContracts
    .filter($0 => $0.responses.length === 0 || $0.responses.some(response => !response.status || !response.envelope))
    .map(formatRouteContract);

  assert.deepEqual(missingResponses, []);
});

test("routeContracts_shouldUseSharedRejectionReasonSchema", () => {
  const routeLocalRejections = routeContracts
    .flatMap((route) => route.responses
      .filter(response => response.envelope === "rejected")
      .filter(response => response.schema?.ref !== "#/components/responses/Rejected")
      .map(() => formatRouteContract(route)));

  assert.deepEqual(routeLocalRejections, []);
});

test("openApiMetadata_shouldResolveLocalComponentRefs", () => {
  const refs = collectRefs(openApiContractMetadata);
  const unresolvedRefs = refs
    .filter($0 => $0.ref.startsWith("#/"))
    .filter($0 => !hasLocalRef(generateOpenApiDocument(), $0.ref))
    .map(formatRefFailure);

  assert.deepEqual(unresolvedRefs, []);
});

test("generateOpenApi_shouldBeDeterministic", () => {
  assert.equal(generateOpenApiYaml(), generateOpenApiYaml());
});

test("generateOpenApi_shouldMatchRouteContracts", () => {
  const generatedRoutes = collectOpenApiRoutes(generateOpenApiDocument().paths);
  const registryRoutes = routeContracts.map(formatRouteContract).sort();

  assert.deepEqual(generatedRoutes, registryRoutes);
});

test("generateOpenApi_shouldOmitServerOnlyFields", () => {
  const generated = generateOpenApiYaml();

  assert.equal(generated.includes("handlerKey"), false);
});

test("generateOpenApiCheck_shouldPass_whenCommittedContractMatchesGeneratedOutput", () => {
  const tempPath = writeTempOpenApi(generateOpenApiYaml());
  const result = runGeneratorCheck(tempPath);

  assert.deepEqual(
    { status: result.status, stderr: result.stderr },
    { status: 0, stderr: "" },
  );
});

test("generateOpenApiCheck_shouldFail_whenCommittedContractDiffersFromGeneratedOutput", () => {
  const tempPath = writeTempOpenApi("openapi: 3.1.0\n");
  const result = runGeneratorCheck(tempPath);

  assert.deepEqual(
    {
      status: result.status,
      unchanged: readFileSync(tempPath, "utf8"),
      stderrIncludesCommand: result.stderr.includes("node scripts/generate-agonara-openapi.mjs"),
    },
    {
      status: 1,
      unchanged: "openapi: 3.1.0\n",
      stderrIncludesCommand: true,
    },
  );
});

test("serverRouting_shouldUseRouteContractsForImplementedRoutes", () => {
  const unmatchedRoutes = routeContracts
    .filter((route) => matchRoute({ method: route.method, pathname: examplePath(route.path) }).status !== "matched")
    .map(formatRouteContract);

  assert.deepEqual(unmatchedRoutes, []);
});

test("serverRouting_shouldRejectMethodMismatches", () => {
  const route = routeContracts.find($0 => $0.method === "POST" && $0.path === "/programs");
  const matched = matchRoute({ method: "GET", pathname: route.path });

  assert.equal(matched.contract.operationId, "listPrograms");
});

test("serverRouting_shouldCoverEveryHandlerKeyPrefix", () => {
  const handlerKeyPrefixes = collectServerHandlerKeyPrefixes(readFileSync(serverPath, "utf8"));
  const unhandledHandlerKeys = routeContracts
    .filter(route => !handlerKeyPrefixes.some(prefix => route.handlerKey.startsWith(prefix)))
    .map($0 => $0.handlerKey);

  assert.deepEqual(unhandledHandlerKeys, []);
});

test("agonaraTestGate_shouldRunOpenApiGenerationCheck", () => {
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

  assert.equal(packageJson.scripts.test.includes("npm run openapi:check"), true);
});

function readOpenApiContract() {
  const document = parseDocument(readFileSync(openApiPath, "utf8"), { prettyErrors: false });
  return document.toJS();
}

function collectHttpStatusReasons(serverSource) {
  const httpStatusFunction = serverSource.match(/function httpStatusFor\(reason\) \{(?<body>[\s\S]*?)\n\}/)?.groups.body;

  assert.notEqual(httpStatusFunction, undefined);

  return [...httpStatusFunction.matchAll(/case "([^"]+)":/g)]
    .map($0 => $0[1])
    .sort();
}

function collectServerHandlerKeyPrefixes(serverSource) {
  return [...serverSource.matchAll(/hasHandlerKey\(routeMatch, "([^"]+)"\)/g)]
    .map($0 => $0[1])
    .sort();
}

function collectOpenApiRoutes(paths) {
  return Object.entries(paths)
    .flatMap(([path, pathItem]) => openApiRouteMethods
      .filter(method => Object.hasOwn(pathItem, method))
      .map(method => `${method.toUpperCase()} ${path}`))
    .sort();
}

function collectRefs(value, path = []) {
  if (Array.isArray(value)) {
    return value.flatMap(($0, index) => collectRefs($0, [...path, String(index)]));
  }

  if (isRecord(value)) {
    return Object.entries(value).flatMap(([key, child]) => {
      const childPath = [...path, key];

      if (key === "$ref" && typeof child === "string") {
        return [{ path: childPath, ref: child }];
      }

      return collectRefs(child, childPath);
    });
  }

  return [];
}

function hasLocalRef(contract, ref) {
  let current = contract;
  const segments = ref
    .slice(2)
    .split("/")
    .map(decodePointerSegment);

  for (const segment of segments) {
    if (!isRecord(current) && !Array.isArray(current)) {
      return false;
    }

    if (!Object.hasOwn(current, segment)) {
      return false;
    }

    current = current[segment];
  }

  return true;
}

function formatRefFailure({ path, ref }) {
  return `#/${path.map(escapePointerSegment).join("/")}: ${ref}`;
}

function escapePointerSegment(segment) {
  return segment.replaceAll("~", "~0").replaceAll("/", "~1");
}

function decodePointerSegment(segment) {
  return decodeURIComponent(segment).replaceAll("~1", "/").replaceAll("~0", "~");
}

function isRecord(value) {
  return typeof value === "object" && value !== null;
}

function formatRouteContract(route) {
  return `${route.method} ${route.path}`;
}

function routeContract(method, path) {
  return routeContracts.find($0 => $0.method === method && $0.path === path);
}

function requestBodyProjection(route) {
  return {
    contentType: route.requestBody?.contentType,
    required: route.requestBody?.required,
    schemaRef: route.requestBody?.schema?.ref,
  };
}

function mutationRouteProjection(route) {
  return {
    csrf: route.auth?.csrf,
    handlerKey: route.handlerKey,
    operationId: route.operationId,
  };
}

function contentQueryProjection(route) {
  return Object.fromEntries((route.queryParameters ?? [])
    .map($0 => [$0.name, $0.schema])
    .sort(([left], [right]) => left.localeCompare(right)));
}

function examplePath(path) {
  return path.replaceAll(/\{[^}]+\}/g, "example-id");
}

function writeTempOpenApi(content) {
  const directory = mkdtempSync(join(tmpdir(), "agonara-openapi-"));
  const path = join(directory, "openapi.yml");
  writeFileSync(path, content);
  return path;
}

function runGeneratorCheck(tempPath) {
  return spawnSync(
    process.execPath,
    [generatorPath, "--check"],
    {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      encoding: "utf8",
      env: {
        ...process.env,
        AGONARA_OPENAPI_PATH: pathToFileURL(tempPath).href,
      },
    },
  );
}
