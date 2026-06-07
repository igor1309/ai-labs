import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parseDocument } from "yaml";

const openApiPath = fileURLToPath(new URL("../docs/api/openapi.yml", import.meta.url));
const serverPath = fileURLToPath(new URL("../src/server.js", import.meta.url));
const openApiRouteMethods = Object.freeze(["delete", "get", "patch", "post"]);
const expectedOpenApiRoutes = Object.freeze([
  "DELETE /identity/identities/{identityId}/admin",
  "DELETE /identity/session",
  "DELETE /learner-state-target-links/{targetLinkId}",
  "DELETE /programs/{programId}/curator-membership",
  "DELETE /programs/{programId}/participants/student/{identityId}",
  "DELETE /programs/{programId}/student-membership",
  "GET /accepted-corpus-revisions/{revisionId}",
  "GET /admin",
  "GET /assessment-criteria/revisions/{revisionId}",
  "GET /identity/audit-events",
  "GET /identity/bootstrap/status",
  "GET /identity/identities",
  "GET /identity/identities/{identityId}/operational-access",
  "GET /identity/session",
  "GET /learn",
  "GET /learner-state/targets/{targetKind}/{targetId}",
  "GET /llm-curation-suggestions/{suggestionId}",
  "GET /navigation/entities/{entityId}",
  "GET /navigation/revisions/{revisionId}",
  "GET /open-answer-attempts/{attemptId}",
  "GET /open-answer-checks/revisions/{revisionId}",
  "GET /operations/diagnostics",
  "GET /operations/health",
  "GET /program-invitations/me",
  "GET /program-memberships/me",
  "GET /programs",
  "GET /programs/{programId}",
  "GET /programs/{programId}/accepted-corpus",
  "GET /programs/{programId}/assessment-criteria",
  "GET /programs/{programId}/assessment-criteria/candidates",
  "GET /programs/{programId}/corpus-candidates",
  "GET /programs/{programId}/corpus-events",
  "GET /programs/{programId}/coverage-gaps",
  "GET /programs/{programId}/events",
  "GET /programs/{programId}/invitations",
  "GET /programs/{programId}/learner-state",
  "GET /programs/{programId}/learner-state-target-links",
  "GET /programs/{programId}/llm-curation-suggestions",
  "GET /programs/{programId}/membership-events",
  "GET /programs/{programId}/navigation",
  "GET /programs/{programId}/navigation-candidates",
  "GET /programs/{programId}/open-answer-attempts",
  "GET /programs/{programId}/open-answer-checks",
  "GET /programs/{programId}/open-answer-checks/candidates",
  "GET /programs/{programId}/participants",
  "GET /programs/{programId}/participation/{participationKind}",
  "GET /programs/{programId}/quick-check-attempts",
  "GET /programs/{programId}/quick-checks",
  "GET /programs/{programId}/quick-checks/candidates",
  "GET /programs/{programId}/readiness-check-attempts",
  "GET /programs/{programId}/readiness-checks",
  "GET /programs/{programId}/readiness-checks/candidates",
  "GET /programs/{programId}/sources",
  "GET /quick-check-attempts/{attemptId}",
  "GET /quick-checks/revisions/{revisionId}",
  "GET /quick-checks/revisions/{revisionId}/curation",
  "GET /readiness-check-attempts/{attemptId}",
  "GET /readiness-checks/revisions/{revisionId}/curation",
  "PATCH /programs/{programId}/admission-policy",
  "POST /admin/program-memberships/recovery",
  "POST /admin/program-memberships/revocation",
  "POST /assessment-criteria/candidates/{candidateId}/acceptance",
  "POST /assessment-criteria/candidates/{candidateId}/rejection",
  "POST /corpus-candidates/{candidateId}/acceptance",
  "POST /corpus-candidates/{candidateId}/rejection",
  "POST /identity/bootstrap/admin",
  "POST /identity/identities",
  "POST /identity/identities/{identityId}/admin",
  "POST /identity/identities/{identityId}/disable",
  "POST /identity/identities/{identityId}/local-password",
  "POST /identity/sessions",
  "POST /llm-curation-suggestions/{suggestionId}/acceptance",
  "POST /llm-curation-suggestions/{suggestionId}/rejection",
  "POST /navigation-candidates/{candidateId}/acceptance",
  "POST /navigation-candidates/{candidateId}/rejection",
  "POST /open-answer-checks/candidates/{candidateId}/acceptance",
  "POST /open-answer-checks/candidates/{candidateId}/rejection",
  "POST /operations/open-answer-evaluator/tick",
  "POST /program-invitations/{invitationId}/acceptance",
  "POST /program-invitations/{invitationId}/decline",
  "POST /program-invitations/{invitationId}/revocation",
  "POST /programs",
  "POST /programs/{programId}/assessment-criteria/candidates",
  "POST /programs/{programId}/corpus-candidates",
  "POST /programs/{programId}/invitations",
  "POST /programs/{programId}/learner-state-target-links",
  "POST /programs/{programId}/llm-curation-suggestions",
  "POST /programs/{programId}/navigation-candidates",
  "POST /programs/{programId}/open-answer-attempts",
  "POST /programs/{programId}/open-answer-checks/candidates",
  "POST /programs/{programId}/quick-check-attempts",
  "POST /programs/{programId}/quick-checks/candidates",
  "POST /programs/{programId}/readiness-check-attempts",
  "POST /programs/{programId}/readiness-checks/candidates",
  "POST /programs/{programId}/sources",
  "POST /programs/{programId}/student-membership",
  "POST /quick-checks/candidates/{candidateId}/acceptance",
  "POST /quick-checks/candidates/{candidateId}/rejection",
  "POST /readiness-checks/candidates/{candidateId}/acceptance",
  "POST /readiness-checks/candidates/{candidateId}/rejection",
]);

test("openApiContract_shouldResolveLocalRefs_onHandEditedContract", () => {
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

test("openApiContract_shouldMatchHttpStatusRejectionReasons_onHandEditedContract", () => {
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

test("openApiContract_shouldMatchExplicitRouteInventory_onHandEditedContract", () => {
  const contract = readOpenApiContract();
  const openApiRoutes = collectOpenApiRoutes(contract.paths);

  assert.deepEqual(openApiRoutes, expectedOpenApiRoutes);
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
