import assert from "node:assert/strict";
import test from "node:test";
import {
  acceptCorpusCandidate,
  bootstrapAdmin,
  createCorpusCandidate,
  createIdentitySession,
  createProgram,
  joinStudentProgram,
  listenWithIdentityProgramAndCorpus,
  manyIds,
  rejectCorpusCandidate,
  updateAcceptedCorpusStatus,
} from "./support/http-api.js";

test("acceptedCorpusList_shouldAllowSignedInPreviewWithoutMembership", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    ids: manyIds(80),
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const curator = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Program Curator",
      login: "curator@example.test",
    });
    const student = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Program Student",
      login: "student@example.test",
    });
    const outsider = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Program Outsider",
      login: "outsider@example.test",
    });
    const createdProgram = await createProgram(baseUrl, curator, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    const candidate = await createCorpusCandidate(baseUrl, curator, programId, {
      candidateKind: "topic",
      title: "Accepted topic",
    });
    const candidateId = (await candidate.json()).value.corpusCandidate.candidateId;
    await acceptCorpusCandidate(baseUrl, curator, candidateId, {});
    await joinStudentProgram(baseUrl, student, programId);
    const studentResponse = await fetch(`${baseUrl}/programs/${programId}/accepted-corpus`, {
      headers: { cookie: student.cookie },
    });
    const curatorResponse = await fetch(`${baseUrl}/programs/${programId}/accepted-corpus`, {
      headers: { cookie: curator.cookie },
    });
    const adminResponse = await fetch(`${baseUrl}/programs/${programId}/accepted-corpus`, {
      headers: { cookie: bootstrap.cookie },
    });
    const previewResponse = await fetch(`${baseUrl}/programs/${programId}/accepted-corpus`, {
      headers: { cookie: outsider.cookie },
    });

    assert.deepEqual(
      {
        student: acceptedCorpusListProjection(await studentResponse.json(), studentResponse.status),
        curator: acceptedCorpusListProjection(await curatorResponse.json(), curatorResponse.status),
        admin: acceptedCorpusListProjection(await adminResponse.json(), adminResponse.status),
        preview: acceptedCorpusListProjection(await previewResponse.json(), previewResponse.status),
      },
      {
        student: { statusCode: 200, titles: ["Accepted topic"] },
        curator: { statusCode: 200, titles: ["Accepted topic"] },
        admin: { statusCode: 200, titles: ["Accepted topic"] },
        preview: { statusCode: 200, titles: ["Accepted topic"] },
      },
    );
  } finally {
    await close();
  }
});

test("acceptedCorpusList_shouldRejectDisabledSessionAndUnknownProgram", async () => {
  const { baseUrl, close, database } = await listenWithIdentityProgramAndCorpus({
    ids: manyIds(40),
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    database
      .prepare("update identities set state = 'disabled', disabled_at = ? where id = ?")
      .run("2026-05-27T10:00:00.000Z", bootstrap.body.value.identity.id);
    const disabled = await fetch(`${baseUrl}/programs/${programId}/accepted-corpus`, {
      headers: { cookie: bootstrap.cookie },
    });
    database
      .prepare("update identities set state = 'active', disabled_at = null where id = ?")
      .run(bootstrap.body.value.identity.id);
    const unknownProgram = await fetch(`${baseUrl}/programs/program-ghost/accepted-corpus`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        disabled: { body: await disabled.json(), statusCode: disabled.status },
        unknownProgram: { body: await unknownProgram.json(), statusCode: unknownProgram.status },
      },
      {
        disabled: {
          body: { status: "rejected", reason: "identity_disabled" },
          statusCode: 403,
        },
        unknownProgram: {
          body: { status: "rejected", reason: "program_not_found" },
          statusCode: 404,
        },
      },
    );
  } finally {
    await close();
  }
});

test("acceptedCorpusList_shouldReturnCurrentScopedFilteredAndPaginatedAcceptedCorpusOnly", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    ids: manyIds(120),
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const programA = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programAId = (await programA.json()).value.program.programId;
    const firstTopic = await createAcceptedCandidate(baseUrl, bootstrap, programAId, {
      candidateKind: "topic",
      title: "Old topic",
    });
    await createAcceptedCandidate(baseUrl, bootstrap, programAId, {
      candidateKind: "topic",
      targetEntityId: firstTopic.entityId,
      title: "Current topic",
    });
    await createAcceptedCandidate(baseUrl, bootstrap, programAId, {
      candidateKind: "concept",
      title: "Current concept",
    });
    await createCorpusCandidate(baseUrl, bootstrap, programAId, {
      candidateKind: "topic",
      title: "Draft topic",
    });
    const rejectedCandidate = await createCorpusCandidate(baseUrl, bootstrap, programAId, {
      candidateKind: "topic",
      title: "Rejected topic",
    });
    await rejectCorpusCandidate(
      baseUrl,
      bootstrap,
      (await rejectedCandidate.json()).value.corpusCandidate.candidateId,
    );
    const programB = await createProgram(baseUrl, bootstrap, { title: "Discrete Math" });
    const programBId = (await programB.json()).value.program.programId;
    await createAcceptedCandidate(baseUrl, bootstrap, programBId, {
      candidateKind: "topic",
      title: "Other program topic",
    });
    const all = await fetch(`${baseUrl}/programs/${programAId}/accepted-corpus?limit=1`, {
      headers: { cookie: bootstrap.cookie },
    });
    const allBody = await all.json();
    const pageTwo = await fetch(
      `${baseUrl}/programs/${programAId}/accepted-corpus?cursor=${allBody.value?.nextCursor ?? "missing"}`,
      { headers: { cookie: bootstrap.cookie } },
    );
    const topics = await fetch(`${baseUrl}/programs/${programAId}/accepted-corpus?acceptedKind=topic`, {
      headers: { cookie: bootstrap.cookie },
    });
    const concepts = await fetch(`${baseUrl}/programs/${programAId}/accepted-corpus?acceptedKind=concept`, {
      headers: { cookie: bootstrap.cookie },
    });
    const invalid = await fetch(`${baseUrl}/programs/${programAId}/accepted-corpus?acceptedKind=lesson`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        all: acceptedCorpusListProjection(allBody, all.status),
        pageTwo: acceptedCorpusListProjection(await pageTwo.json(), pageTwo.status),
        topics: acceptedCorpusListProjection(await topics.json(), topics.status),
        concepts: acceptedCorpusListProjection(await concepts.json(), concepts.status),
        invalid: { body: await invalid.json(), statusCode: invalid.status },
      },
      {
        all: { statusCode: 200, titles: ["Current topic"], hasNextCursor: true },
        pageTwo: { statusCode: 200, titles: ["Current concept"] },
        topics: { statusCode: 200, titles: ["Current topic"] },
        concepts: { statusCode: 200, titles: ["Current concept"] },
        invalid: {
          body: { status: "rejected", reason: "validation_failed" },
          statusCode: 400,
        },
      },
    );
  } finally {
    await close();
  }
});

test("acceptedCorpusStatus_shouldRequireCsrfCuratorAndKeepHistoricalRevisionReadable", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({ ids: manyIds(80) });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const ordinary = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Ordinary Identity",
      login: "ordinary-corpus-status@example.test",
    });
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    const acceptedCorpus = await createAcceptedCandidate(baseUrl, bootstrap, programId, {
      candidateKind: "topic",
      title: "Withdrawn topic",
    });
    const missingCsrf = await fetch(`${baseUrl}/corpus/${acceptedCorpus.entityId}/status`, {
      body: JSON.stringify({ status: "withdrawn" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
      },
      method: "PUT",
    });
    const nonCurator = await updateAcceptedCorpusStatus(baseUrl, ordinary, acceptedCorpus.entityId, {
      status: "withdrawn",
    });
    const invalid = await updateAcceptedCorpusStatus(baseUrl, bootstrap, acceptedCorpus.entityId, {
      status: "retired",
    });
    const withdrawn = await updateAcceptedCorpusStatus(baseUrl, bootstrap, acceptedCorpus.entityId, {
      status: "withdrawn",
    });
    const listed = await fetch(`${baseUrl}/programs/${programId}/accepted-corpus`, {
      headers: { cookie: bootstrap.cookie },
    });
    const historical = await fetch(`${baseUrl}/accepted-corpus-revisions/${acceptedCorpus.revisionId}`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        missingCsrf: { body: await missingCsrf.json(), statusCode: missingCsrf.status },
        nonCurator: { body: await nonCurator.json(), statusCode: nonCurator.status },
        invalid: { body: await invalid.json(), statusCode: invalid.status },
        withdrawn: { body: await withdrawn.json(), statusCode: withdrawn.status },
        listed: acceptedCorpusListProjection(await listed.json(), listed.status),
        historical: acceptedCorpusRevisionProjection(await historical.json(), historical.status),
      },
      {
        missingCsrf: {
          body: { status: "rejected", reason: "csrf_required" },
          statusCode: 403,
        },
        nonCurator: {
          body: { status: "rejected", reason: "admin_or_curator_required" },
          statusCode: 403,
        },
        invalid: {
          body: { status: "rejected", reason: "validation_failed" },
          statusCode: 400,
        },
        withdrawn: {
          body: {
            status: "accepted",
            value: {
              entity: {
                id: acceptedCorpus.entityId,
                status: "withdrawn",
                updatedByIdentityId: "id-1",
                updatedAt: "2026-05-27T10:00:00.000Z",
              },
            },
          },
          statusCode: 200,
        },
        listed: { statusCode: 200, titles: [] },
        historical: {
          statusCode: 200,
          title: "Withdrawn topic",
          revisionId: acceptedCorpus.revisionId,
        },
      },
    );
  } finally {
    await close();
  }
});

test("acceptedCorpusList_shouldDefaultLimitAndRejectInvalidQueries", async () => {
  const acceptedCorpus = Array.from({ length: 51 }, (_, index) => ({
    entityId: `entity-${index + 1}`,
    title: `Accepted ${index + 1}`,
  }));
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    corpusCommandsOverride: {
      listAcceptedCorpus: () => ({
        status: "accepted",
        value: { acceptedCorpus },
      }),
    },
    ids: ["identity-1", "credential-1", "session-1", "audit-1", "cursor-1"],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const defaultPage = await fetch(`${baseUrl}/programs/program-1/accepted-corpus`, {
      headers: { cookie: bootstrap.cookie },
    });
    const defaultBody = await defaultPage.json();
    const cases = ["limit=0", "limit=101", "limit=abc", "cursor=unknown"];
    const invalidQueries = [];
    for (const query of cases) {
      const response = await fetch(`${baseUrl}/programs/program-1/accepted-corpus?${query}`, {
        headers: { cookie: bootstrap.cookie },
      });
      invalidQueries.push({ body: await response.json(), statusCode: response.status });
    }
    const filteredPage = await fetch(`${baseUrl}/programs/program-1/accepted-corpus?acceptedKind=topic&limit=1`, {
      headers: { cookie: bootstrap.cookie },
    });
    const filteredBody = await filteredPage.json();
    const crossFilterCursor = await fetch(
      `${baseUrl}/programs/program-1/accepted-corpus?acceptedKind=concept&cursor=${filteredBody.value.nextCursor}`,
      { headers: { cookie: bootstrap.cookie } },
    );

    assert.deepEqual(
      {
        defaultPage: {
          firstTitle: defaultBody.value?.acceptedCorpus?.[0]?.title,
          hasNextCursor: typeof defaultBody.value?.nextCursor === "string",
          lastTitle: defaultBody.value?.acceptedCorpus?.at(-1)?.title,
          statusCode: defaultPage.status,
          titleCount: defaultBody.value?.acceptedCorpus?.length ?? 0,
        },
        invalidQueries,
        crossFilterCursor: {
          body: await crossFilterCursor.json(),
          statusCode: crossFilterCursor.status,
        },
      },
      {
        defaultPage: {
          firstTitle: "Accepted 1",
          hasNextCursor: true,
          lastTitle: "Accepted 50",
          statusCode: 200,
          titleCount: 50,
        },
        invalidQueries: cases.map(() => ({
          body: { status: "rejected", reason: "validation_failed" },
          statusCode: 400,
        })),
        crossFilterCursor: {
          body: { status: "rejected", reason: "validation_failed" },
          statusCode: 400,
        },
      },
    );
  } finally {
    await close();
  }
});

test("acceptedCorpusRevisionGet_shouldReturnHistoricalRevisionForAuthorizedCallers", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    ids: manyIds(120),
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const curator = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Program Curator",
      login: "curator@example.test",
    });
    const student = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Program Student",
      login: "student@example.test",
    });
    const createdProgram = await createProgram(baseUrl, curator, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    const firstTopic = await createAcceptedCandidate(baseUrl, curator, programId, {
      candidateKind: "topic",
      title: "Historical topic",
    });
    await createAcceptedCandidate(baseUrl, curator, programId, {
      candidateKind: "topic",
      targetEntityId: firstTopic.entityId,
      title: "Current topic",
    });
    await joinStudentProgram(baseUrl, student, programId);
    const studentResponse = await fetch(`${baseUrl}/accepted-corpus-revisions/${firstTopic.revisionId}`, {
      headers: { cookie: student.cookie },
    });
    const curatorResponse = await fetch(`${baseUrl}/accepted-corpus-revisions/${firstTopic.revisionId}`, {
      headers: { cookie: curator.cookie },
    });
    const adminResponse = await fetch(`${baseUrl}/accepted-corpus-revisions/${firstTopic.revisionId}`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        student: acceptedCorpusRevisionProjection(await studentResponse.json(), studentResponse.status),
        curator: acceptedCorpusRevisionProjection(await curatorResponse.json(), curatorResponse.status),
        admin: acceptedCorpusRevisionProjection(await adminResponse.json(), adminResponse.status),
      },
      {
        student: { statusCode: 200, title: "Historical topic", revisionId: firstTopic.revisionId },
        curator: { statusCode: 200, title: "Historical topic", revisionId: firstTopic.revisionId },
        admin: { statusCode: 200, title: "Historical topic", revisionId: firstTopic.revisionId },
      },
    );
  } finally {
    await close();
  }
});

test("acceptedCorpusRevisionGet_shouldRejectUnknownAndUnauthorizedCallers", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    ids: manyIds(80),
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const outsider = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Program Outsider",
      login: "outsider@example.test",
    });
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    const accepted = await createAcceptedCandidate(baseUrl, bootstrap, programId, {
      candidateKind: "topic",
      title: "Accepted topic",
    });
    const unknown = await fetch(`${baseUrl}/accepted-corpus-revisions/revision-ghost`, {
      headers: { cookie: bootstrap.cookie },
    });
    const unauthorized = await fetch(`${baseUrl}/accepted-corpus-revisions/${accepted.revisionId}`, {
      headers: { cookie: outsider.cookie },
    });

    assert.deepEqual(
      {
        unknown: { body: await unknown.json(), statusCode: unknown.status },
        unauthorized: { body: await unauthorized.json(), statusCode: unauthorized.status },
      },
      {
        unknown: {
          body: { status: "rejected", reason: "revision_not_found" },
          statusCode: 404,
        },
        unauthorized: {
          body: { status: "rejected", reason: "participation_required" },
          statusCode: 403,
        },
      },
    );
  } finally {
    await close();
  }
});

async function createAcceptedCandidate(baseUrl, session, programId, body) {
  const { targetEntityId, ...candidateBody } = body;
  const candidate = await createCorpusCandidate(baseUrl, session, programId, candidateBody);
  const candidateId = (await candidate.json()).value.corpusCandidate.candidateId;
  const acceptedResponse = await acceptCorpusCandidate(
    baseUrl,
    session,
    candidateId,
    targetEntityId === undefined ? {} : { targetEntityId },
  );
  return (await acceptedResponse.json()).value.acceptedCorpus;
}

function acceptedCorpusListProjection(body, statusCode) {
  return {
    statusCode,
    titles: body.value?.acceptedCorpus?.map($0 => $0.title) ?? [],
    ...(body.value?.nextCursor ? { hasNextCursor: typeof body.value.nextCursor === "string" } : {}),
  };
}

function acceptedCorpusRevisionProjection(body, statusCode) {
  return {
    statusCode,
    revisionId: body.value?.acceptedCorpus?.revisionId,
    title: body.value?.acceptedCorpus?.title,
  };
}
