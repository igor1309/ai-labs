import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "../src/server.js";
import {
  bootstrapAdmin,
  close,
  createAcceptedNavigationCandidate,
  createIdentitySession,
  createProgram,
  createProgramSource,
  deleteJson,
  fetchJson,
  getHttpResponse,
  joinStudentProgram,
  listen,
  listenWithIdentityProgramAndCorpus,
  manyIds,
} from "./support/http-api.js";

test("materialContentHttp_shouldServeRoleGatedContentAndNavigationSignal_onRealSessions", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    ids: manyIds(160),
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const student = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Material Student",
      login: "material-student@example.test",
    });
    const outsider = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Material Outsider",
      login: "material-outsider@example.test",
    });
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    await joinStudentProgram(baseUrl, student, programId);
    const source = await createProgramSource(baseUrl, bootstrap, programId, {
      sourceKind: "article",
      title: "Program source",
    });
    const sourceId = (await source.json()).value.programSource.sourceId;
    const material = await createAcceptedNavigationCandidate(baseUrl, bootstrap, programId, {
      candidateKind: "material_reference",
      locator: "https://example.test/basis",
      materialReferenceKind: "article",
      sourceIds: [sourceId],
      title: "Basis reading",
    });
    const emptyMaterial = await createAcceptedNavigationCandidate(baseUrl, bootstrap, programId, {
      candidateKind: "material_reference",
      locator: "https://example.test/empty",
      materialReferenceKind: "article",
      title: "Empty reading",
    });
    const acceptedContent = "abcdef";
    await putJson(`${baseUrl}/sources/${sourceId}/content`, {
      content: "# source",
      contentFormat: "markdown",
    }, { cookie: bootstrap.cookie, csrfToken: bootstrap.csrfToken });
    await putJson(`${baseUrl}/materials/revisions/${material.revisionId}/content`, {
      content: acceptedContent,
      contentFormat: "markdown",
      sourceContentProvenance: { sourceId },
    }, { cookie: bootstrap.cookie, csrfToken: bootstrap.csrfToken });

    const curatorSourceRead = await getHttpResponse(baseUrl, `/sources/${sourceId}/content`, bootstrap);
    const studentSourceRead = await getHttpResponse(baseUrl, `/sources/${sourceId}/content`, student);
    const sourceWriteWithoutCsrf = await putJson(`${baseUrl}/sources/${sourceId}/content`, {
      content: "# changed",
      contentFormat: "markdown",
    }, { cookie: bootstrap.cookie });
    const sourceDeleteByStudent = await deleteJson(`${baseUrl}/sources/${sourceId}/content`, {
      cookie: student.cookie,
      csrfToken: student.csrfToken,
    });
    const studentFull = await getHttpResponse(baseUrl, `/materials/${material.entityId}/content`, student);
    const curatorRevisionPage = await getHttpResponse(
      baseUrl,
      `/materials/revisions/${material.revisionId}/content?limit=2`,
      bootstrap,
    );
    const studentRevisionNextPage = await getHttpResponse(
      baseUrl,
      `/materials/revisions/${material.revisionId}/content?limit=2&cursor=${curatorRevisionPage.body.value.nextCursor}`,
      student,
    );
    const outsiderMaterialRead = await getHttpResponse(baseUrl, `/materials/${material.entityId}/content`, outsider);
    const missingContent = await getHttpResponse(baseUrl, `/materials/${emptyMaterial.entityId}/content`, student);
    const badCursor = await getHttpResponse(
      baseUrl,
      `/materials/revisions/${material.revisionId}/content?limit=2&cursor=99`,
      student,
    );
    const navigation = await getHttpResponse(baseUrl, `/programs/${programId}/navigation`, student);

    assert.deepEqual(
      {
        badCursor: materialContentRejectionProjection(badCursor),
        curatorRevisionPage: materialContentPageProjection(curatorRevisionPage),
        curatorSourceRead: materialContentPageProjection(curatorSourceRead),
        missingContent: materialContentRejectionProjection(missingContent),
        navigationSignals: materialContentNavigationSignals(navigation.body),
        navigationTraversalIncludesContent: JSON.stringify(navigation.body).includes(acceptedContent),
        outsiderMaterialRead: materialContentRejectionProjection(outsiderMaterialRead),
        sourceDeleteByStudent: materialContentRejectionProjection(sourceDeleteByStudent),
        sourceWriteWithoutCsrf: materialContentRejectionProjection(sourceWriteWithoutCsrf),
        studentFull: materialContentPageProjection(studentFull),
        studentRevisionNextPage: materialContentPageProjection(studentRevisionNextPage),
        studentSourceRead: materialContentRejectionProjection(studentSourceRead),
      },
      {
        badCursor: { reason: "validation_failed", status: "rejected", statusCode: 400 },
        curatorRevisionPage: {
          byteSize: Buffer.byteLength(acceptedContent, "utf8"),
          content: "ab",
          contentFormat: "markdown",
          hasNextCursor: true,
          status: "accepted",
          statusCode: 200,
        },
        curatorSourceRead: {
          byteSize: Buffer.byteLength("# source", "utf8"),
          content: "# source",
          contentFormat: "markdown",
          status: "accepted",
          statusCode: 200,
        },
        missingContent: { reason: "content_not_found", status: "rejected", statusCode: 404 },
        navigationSignals: [
          { contentBytes: Buffer.byteLength(acceptedContent, "utf8"), contentFormat: "markdown", hasContent: true, title: "Basis reading" },
          { hasContent: false, title: "Empty reading" },
        ],
        navigationTraversalIncludesContent: false,
        outsiderMaterialRead: { reason: "participation_required", status: "rejected", statusCode: 403 },
        sourceDeleteByStudent: { reason: "admin_or_curator_required", status: "rejected", statusCode: 403 },
        sourceWriteWithoutCsrf: { reason: "csrf_required", status: "rejected", statusCode: 403 },
        studentFull: {
          byteSize: Buffer.byteLength(acceptedContent, "utf8"),
          content: acceptedContent,
          contentFormat: "markdown",
          status: "accepted",
          statusCode: 200,
        },
        studentRevisionNextPage: {
          byteSize: Buffer.byteLength(acceptedContent, "utf8"),
          content: "cd",
          contentFormat: "markdown",
          hasNextCursor: true,
          status: "accepted",
          statusCode: 200,
        },
        studentSourceRead: { reason: "admin_or_curator_required", status: "rejected", statusCode: 403 },
      },
    );
  } finally {
    await close();
  }
});

test("materialContentHttp_shouldWhitelistReadProjectionFields_onCommandResult", async () => {
  const server = createServer({
    identityCommands: {
      resolveSession: ({ sessionId }) => ({
        status: "accepted",
        value: { identity: { id: "id", state: "active" }, session: { id: sessionId } },
      }),
    },
    corpusCommands: {
      readMaterialContent: () => ({
        status: "accepted",
        value: {
          acceptedAt: "2026-05-27T10:00:00.000Z",
          acceptedByIdentityId: "identity-secret",
          candidateId: "candidate-secret",
          content: "allowed",
          contentFormat: "markdown",
          byteSize: Buffer.byteLength("allowed", "utf8"),
          nextCursor: "7",
          sessionId: "session-secret",
          sourceContentProvenance: { sourceId: "source-secret" },
        },
      }),
      readSourceContent: () => ({
        status: "accepted",
        value: {
          content: "source",
          contentFormat: "markdown",
          byteSize: Buffer.byteLength("source", "utf8"),
          recordedAt: "2026-05-27T10:00:00.000Z",
          recordedByIdentityId: "identity-secret",
          sourceId: "source-secret",
        },
      }),
    },
    log: () => {},
  });
  const baseUrl = await listen(server);

  try {
    const materialRead = await fetch(`${baseUrl}/materials/entity-a/content`, {
      headers: { cookie: "agonara_session=s" },
    });
    const sourceRead = await fetch(`${baseUrl}/sources/source-a/content`, {
      headers: { cookie: "agonara_session=s" },
    });
    const materialBody = await materialRead.json();
    const sourceBody = await sourceRead.json();

    assert.deepEqual(
      {
        materialKeys: Object.keys(materialBody.value).sort(),
        sourceKeys: Object.keys(sourceBody.value).sort(),
      },
      {
        materialKeys: ["byteSize", "content", "contentFormat", "nextCursor"],
        sourceKeys: ["byteSize", "content", "contentFormat"],
      },
    );
  } finally {
    await close(server);
  }
});

async function putJson(url, body, { cookie = null, csrfToken = null } = {}) {
  return fetchJson(url, {
    body: JSON.stringify(body),
    headers: {
      ...(cookie ? { cookie } : {}),
      "content-type": "application/json",
      ...(csrfToken ? { "x-agonara-csrf": csrfToken } : {}),
    },
    method: "PUT",
  });
}

function materialContentPageProjection(response) {
  return {
    status: response.body.status,
    statusCode: response.statusCode,
    content: response.body.value?.content,
    contentFormat: response.body.value?.contentFormat,
    byteSize: response.body.value?.byteSize,
    ...(response.body.value?.nextCursor ? { hasNextCursor: typeof response.body.value.nextCursor === "string" } : {}),
  };
}

function materialContentRejectionProjection(response) {
  return {
    status: response.body.status,
    reason: response.body.reason,
    statusCode: response.statusCode,
  };
}

function materialContentNavigationSignals(body) {
  return body.value.navigation.ungroupedMaterials.map($0 => ({
    title: $0.title,
    hasContent: $0.hasContent,
    ...($0.contentBytes === undefined ? {} : { contentBytes: $0.contentBytes }),
    ...($0.contentFormat === undefined ? {} : { contentFormat: $0.contentFormat }),
  }));
}
