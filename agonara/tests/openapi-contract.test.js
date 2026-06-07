import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parseDocument } from "yaml";

const openApiPath = fileURLToPath(new URL("../docs/api/openapi.yml", import.meta.url));
const serverPath = fileURLToPath(new URL("../src/server.js", import.meta.url));
const expectedOpenApiPaths = Object.freeze([
  "/accepted-corpus-revisions/{revisionId}",
  "/admin",
  "/admin/program-memberships/recovery",
  "/admin/program-memberships/revocation",
  "/assessment-criteria/candidates/{candidateId}/acceptance",
  "/assessment-criteria/candidates/{candidateId}/rejection",
  "/assessment-criteria/revisions/{revisionId}",
  "/corpus-candidates/{candidateId}/acceptance",
  "/corpus-candidates/{candidateId}/rejection",
  "/identity/audit-events",
  "/identity/bootstrap/admin",
  "/identity/bootstrap/status",
  "/identity/identities",
  "/identity/identities/{identityId}/admin",
  "/identity/identities/{identityId}/disable",
  "/identity/identities/{identityId}/local-password",
  "/identity/identities/{identityId}/operational-access",
  "/identity/session",
  "/identity/sessions",
  "/learn",
  "/learner-state-target-links/{targetLinkId}",
  "/learner-state/targets/{targetKind}/{targetId}",
  "/llm-curation-suggestions/{suggestionId}",
  "/llm-curation-suggestions/{suggestionId}/acceptance",
  "/llm-curation-suggestions/{suggestionId}/rejection",
  "/navigation-candidates/{candidateId}/acceptance",
  "/navigation-candidates/{candidateId}/rejection",
  "/navigation/entities/{entityId}",
  "/navigation/revisions/{revisionId}",
  "/open-answer-attempts/{attemptId}",
  "/open-answer-checks/candidates/{candidateId}/acceptance",
  "/open-answer-checks/candidates/{candidateId}/rejection",
  "/open-answer-checks/revisions/{revisionId}",
  "/operations/diagnostics",
  "/operations/health",
  "/operations/open-answer-evaluator/tick",
  "/program-invitations/me",
  "/program-invitations/{invitationId}/acceptance",
  "/program-invitations/{invitationId}/decline",
  "/program-invitations/{invitationId}/revocation",
  "/program-memberships/me",
  "/programs",
  "/programs/{programId}",
  "/programs/{programId}/accepted-corpus",
  "/programs/{programId}/admission-policy",
  "/programs/{programId}/assessment-criteria",
  "/programs/{programId}/assessment-criteria/candidates",
  "/programs/{programId}/corpus-candidates",
  "/programs/{programId}/corpus-events",
  "/programs/{programId}/coverage-gaps",
  "/programs/{programId}/curator-membership",
  "/programs/{programId}/events",
  "/programs/{programId}/invitations",
  "/programs/{programId}/learner-state",
  "/programs/{programId}/learner-state-target-links",
  "/programs/{programId}/llm-curation-suggestions",
  "/programs/{programId}/membership-events",
  "/programs/{programId}/navigation",
  "/programs/{programId}/navigation-candidates",
  "/programs/{programId}/open-answer-attempts",
  "/programs/{programId}/open-answer-checks",
  "/programs/{programId}/open-answer-checks/candidates",
  "/programs/{programId}/participants",
  "/programs/{programId}/participants/student/{identityId}",
  "/programs/{programId}/participation/{participationKind}",
  "/programs/{programId}/quick-check-attempts",
  "/programs/{programId}/quick-checks",
  "/programs/{programId}/quick-checks/candidates",
  "/programs/{programId}/readiness-check-attempts",
  "/programs/{programId}/readiness-checks",
  "/programs/{programId}/readiness-checks/candidates",
  "/programs/{programId}/sources",
  "/programs/{programId}/student-membership",
  "/quick-check-attempts/{attemptId}",
  "/quick-checks/candidates/{candidateId}/acceptance",
  "/quick-checks/candidates/{candidateId}/rejection",
  "/quick-checks/revisions/{revisionId}",
  "/quick-checks/revisions/{revisionId}/curation",
  "/readiness-check-attempts/{attemptId}",
  "/readiness-checks/candidates/{candidateId}/acceptance",
  "/readiness-checks/candidates/{candidateId}/rejection",
  "/readiness-checks/revisions/{revisionId}/curation",
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

test("openApiContract_shouldMatchExplicitRoutePathInventory_onHandEditedContract", () => {
  const contract = readOpenApiContract();
  const openApiPaths = Object.keys(contract.paths).sort();

  assert.deepEqual(openApiPaths, expectedOpenApiPaths);
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
