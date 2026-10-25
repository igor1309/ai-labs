import assert from "node:assert/strict";
import test from "node:test";
import {
  bootstrapAdmin,
  createAcceptedQuickCheck,
  createIdentitySession,
  createProgram,
  getHttpResponse,
  joinStudentProgram,
  listenWithIdentityProgramAndCorpus,
  manyIds,
  updateQuickCheckStatus,
} from "./support/http-api.js";

test("quickCheckDeliveries_shouldListAndReturnStudentSafeRevision_onEffectiveStudent", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({ ids: manyIds(50) });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const curator = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Program Curator",
      login: "delivery-curator@example.test",
    });
    const student = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Program Student",
      login: "delivery-student@example.test",
    });
    const program = await createProgram(baseUrl, curator, { title: "Linear Algebra" });
    const programId = (await program.json()).value.program.programId;
    await joinStudentProgram(baseUrl, student, programId);
    const acceptedQuickCheck = await createAcceptedQuickCheck(baseUrl, curator, programId, {
      answerKeyOptionIndex: 1,
      options: ["Only addition", "Addition and scalar multiplication"],
      prompt: "Which statement describes a vector space?",
      title: "Vector-space definition",
    });
    const list = await fetch(`${baseUrl}/programs/${programId}/quick-checks`, {
      headers: { cookie: student.cookie },
    });
    const detail = await fetch(`${baseUrl}/quick-checks/revisions/${acceptedQuickCheck.revisionId}`, {
      headers: { cookie: student.cookie },
    });
    const serializedStudentResponses = JSON.stringify([await list.clone().json(), await detail.clone().json()]);

    assert.deepEqual(
      {
        detail: quickCheckDeliveryProjection(await detail.json()),
        detailStatusCode: detail.status,
        hasStudentLeaks: containsQuickCheckStudentDeliveryLeaks(serializedStudentResponses),
        list: quickCheckDeliveryListProjection(await list.json()),
        listStatusCode: list.status,
      },
      {
        detail: {
          checkKind: "single_select_quick_check",
          optionTexts: ["Only addition", "Addition and scalar multiplication"],
          programId,
          prompt: "Which statement describes a vector space?",
          title: "Vector-space definition",
        },
        detailStatusCode: 200,
        hasStudentLeaks: false,
        list: ["Vector-space definition"],
        listStatusCode: 200,
      },
    );
  } finally {
    await close();
  }
});

test("quickCheckStatus_shouldRequireCsrfCuratorAndKeepHistoricalRevisionReadable", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({ ids: manyIds(80) });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const ordinary = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Ordinary Identity",
      login: "ordinary-quick-status@example.test",
    });
    const student = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Program Student",
      login: "quick-status-student@example.test",
    });
    const program = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await program.json()).value.program.programId;
    await joinStudentProgram(baseUrl, student, programId);
    const quickCheck = await createAcceptedQuickCheck(baseUrl, bootstrap, programId, {
      title: "Withdrawn quick check",
    });
    const missingCsrf = await fetch(`${baseUrl}/quick-checks/${quickCheck.entityId}/status`, {
      body: JSON.stringify({ status: "withdrawn" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
      },
      method: "PUT",
    });
    const nonCurator = await updateQuickCheckStatus(baseUrl, ordinary, quickCheck.entityId, {
      status: "withdrawn",
    });
    const invalid = await updateQuickCheckStatus(baseUrl, bootstrap, quickCheck.entityId, {
      status: "retired",
    });
    const withdrawn = await updateQuickCheckStatus(baseUrl, bootstrap, quickCheck.entityId, {
      status: "withdrawn",
    });
    const list = await fetch(`${baseUrl}/programs/${programId}/quick-checks`, {
      headers: { cookie: student.cookie },
    });
    const detail = await fetch(`${baseUrl}/quick-checks/revisions/${quickCheck.revisionId}`, {
      headers: { cookie: student.cookie },
    });

    assert.deepEqual(
      {
        missingCsrf: { body: await missingCsrf.json(), statusCode: missingCsrf.status },
        nonCurator: { body: await nonCurator.json(), statusCode: nonCurator.status },
        invalid: { body: await invalid.json(), statusCode: invalid.status },
        withdrawn: { body: await withdrawn.json(), statusCode: withdrawn.status },
        list: { body: quickCheckDeliveryListProjection(await list.json()), statusCode: list.status },
        detail: { body: quickCheckDeliveryProjection(await detail.json()), statusCode: detail.status },
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
                id: quickCheck.entityId,
                status: "withdrawn",
                updatedByIdentityId: "id-1",
                updatedAt: "2026-05-27T10:00:00.000Z",
              },
            },
          },
          statusCode: 200,
        },
        list: { body: [], statusCode: 200 },
        detail: {
          body: {
            checkKind: "single_select_quick_check",
            optionTexts: ["Closed under addition", "Only finite dimension"],
            programId,
            prompt: "Which property is required for a vector space?",
            title: "Withdrawn quick check",
          },
          statusCode: 200,
        },
      },
    );
  } finally {
    await close();
  }
});

test("quickCheckDeliveries_shouldRejectNonStudentsUnknownsAndCursorScopeMismatch", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({ ids: manyIds(60) });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const curator = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Program Curator",
      login: "delivery-curator-denied@example.test",
    });
    const student = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Program Student",
      login: "delivery-student-denied@example.test",
    });
    const program = await createProgram(baseUrl, curator, { title: "Linear Algebra" });
    const programId = (await program.json()).value.program.programId;
    await joinStudentProgram(baseUrl, student, programId);
    await createAcceptedQuickCheck(baseUrl, curator, programId, { title: "First check" });
    await createAcceptedQuickCheck(baseUrl, curator, programId, { title: "Second check" });
    const firstPage = await fetch(`${baseUrl}/programs/${programId}/quick-checks/candidates?limit=1`, {
      headers: { cookie: curator.cookie },
    });
    const firstPageBody = await firstPage.json();
    const cursorScopeMismatch = await fetch(
      `${baseUrl}/programs/${programId}/quick-checks?cursor=${firstPageBody.value.nextCursor}`,
      { headers: { cookie: student.cookie } },
    );
    const responses = [
      await getHttpResponse(baseUrl, `/programs/${programId}/quick-checks`, curator),
      await getHttpResponse(baseUrl, `/programs/program-missing/quick-checks`, student),
      await getHttpResponse(baseUrl, "/quick-checks/revisions/revision-missing", student),
      { body: await cursorScopeMismatch.json(), statusCode: cursorScopeMismatch.status },
    ];

    assert.deepEqual(
      responses,
      [
        {
          body: { status: "rejected", reason: "participation_required" },
          statusCode: 403,
        },
        {
          body: { status: "rejected", reason: "program_not_found" },
          statusCode: 404,
        },
        {
          body: { status: "rejected", reason: "quick_check_revision_not_found" },
          statusCode: 404,
        },
        {
          body: { status: "rejected", reason: "validation_failed" },
          statusCode: 400,
        },
      ],
    );
  } finally {
    await close();
  }
});

function quickCheckDeliveryProjection(body) {
  const delivery = body.value?.quickCheckDelivery;
  return {
    checkKind: delivery?.checkKind,
    optionTexts: delivery?.options?.map($0 => $0.text),
    programId: delivery?.programId,
    prompt: delivery?.prompt,
    title: delivery?.title,
  };
}

function quickCheckDeliveryListProjection(body) {
  return body.value?.quickCheckDeliveries?.map($0 => $0.title) ?? [];
}

function containsQuickCheckStudentDeliveryLeaks(serialized) {
  return [
    "answerKey",
    "answer_key",
    "acceptedFromCandidateId",
    "candidateId",
    "acceptedByIdentityId",
    "acceptedAt",
    "rationale",
    "correct",
    "idempotency",
  ].some($0 => serialized.includes($0));
}
