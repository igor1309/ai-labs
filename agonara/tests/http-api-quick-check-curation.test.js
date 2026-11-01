import assert from "node:assert/strict";
import test from "node:test";
import {
  acceptQuickCheckCandidate,
  bootstrapAdmin,
  createIdentitySession,
  createProgram,
  createProgramSource,
  createQuickCheckCandidate,
  hasSensitiveCompletionLogDetail,
  listenWithIdentityProgramAndCorpus,
  manyIds,
} from "./support/http-api.js";

test("quickCheckCandidateRoutes_shouldRejectMissingSession_withSessionNotFound", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus();

  try {
    const response = await fetch(`${baseUrl}/programs/program-1/quick-checks/candidates`, {
      body: JSON.stringify({
        answerKeyOptionIndex: 0,
        checkKind: "single_select_quick_check",
        options: ["Yes", "No"],
        prompt: "Does the invariant hold?",
        title: "Invariant check",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    assert.deepEqual(
      {
        statusCode: response.status,
        body: await response.json(),
      },
      {
        statusCode: 401,
        body: { status: "rejected", reason: "session_not_found" },
      },
    );
  } finally {
    await close();
  }
});

test("quickCheckCandidateRoutes_shouldRejectMissingAndInvalidCsrf_beforeMutation", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    corpusCommandsOverride: {
      createQuickCheckCandidate: () => {
        throw new Error("quick check candidate command should not run before CSRF passes");
      },
    },
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const cases = [
      {},
      { "x-agonara-csrf": "wrong-token" },
    ];
    const results = [];
    for (const headers of cases) {
      const response = await fetch(`${baseUrl}/programs/program-1/quick-checks/candidates`, {
        body: JSON.stringify({
          answerKeyOptionIndex: 0,
          checkKind: "single_select_quick_check",
          options: ["Yes", "No"],
          prompt: "Does the invariant hold?",
          title: "Invariant check",
        }),
        headers: {
          cookie: bootstrap.cookie,
          "content-type": "application/json",
          ...headers,
        },
        method: "POST",
      });
      results.push({
        statusCode: response.status,
        body: await response.json(),
      });
    }

    assert.deepEqual(
      results,
      [
        {
          statusCode: 403,
          body: { status: "rejected", reason: "csrf_required" },
        },
        {
          statusCode: 403,
          body: { status: "rejected", reason: "csrf_invalid" },
        },
      ],
    );
  } finally {
    await close();
  }
});

test("quickCheckCandidateRoutes_shouldRedactFaultResponsesAndLogs", async () => {
  const logEvents = [];
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    corpusCommandsOverride: {
      createQuickCheckCandidate: () => {
        throw new Error(
          "answer-key-secret session-1 csrf-token-1 idempotency-key cookie sql stack /tmp/db.sqlite postgres://db",
        );
      },
    },
    log: $0 => logEvents.push($0),
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const response = await fetch(`${baseUrl}/programs/program-1/quick-checks/candidates`, {
      body: JSON.stringify({
        answerKeyOptionIndex: 0,
        checkKind: "single_select_quick_check",
        options: ["Yes", "No"],
        prompt: "Does the invariant hold?",
        title: "Invariant check",
      }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
        "x-request-id": "quick-check-fault-log",
      },
      method: "POST",
    });
    const logEvent = logEvents.find($0 => $0.requestId === "quick-check-fault-log");

    assert.deepEqual(
      {
        statusCode: response.status,
        responseRequestId: response.headers.get("x-request-id"),
        body: await response.json(),
        log: {
          errorKind: logEvent?.errorKind,
          hasSensitiveDetail: hasSensitiveCompletionLogDetail(logEvent),
          operation: logEvent?.operation,
          outcome: logEvent?.outcome,
          requestId: logEvent?.requestId,
          severity: logEvent?.severity,
        },
      },
      {
        statusCode: 500,
        responseRequestId: "quick-check-fault-log",
        body: { status: "fault", reason: "internal_error" },
        log: {
          errorKind: "unexpected",
          hasSensitiveDetail: false,
          operation: "POST /programs/program-1/quick-checks/candidates",
          outcome: "fault",
          requestId: "quick-check-fault-log",
          severity: "error",
        },
      },
    );
  } finally {
    await close();
  }
});

test("quickCheckCandidates_shouldCreateAndListDraftCandidate_onCuratorSession", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({ ids: manyIds(30) });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    const createdSource = await createProgramSource(baseUrl, bootstrap, programId, {
      sourceKind: "textbook",
      title: "Linear Algebra Done Right",
    });
    const sourceId = (await createdSource.json()).value.programSource.sourceId;
    const createdCandidate = await createQuickCheckCandidate(baseUrl, bootstrap, programId, {
      answerKeyOptionIndex: 1,
      checkKind: "single_select_quick_check",
      options: ["A set with addition only", "A set closed under addition and scalar multiplication"],
      prompt: "Which statement describes a vector space?",
      sourceIds: [sourceId],
      title: "Vector-space definition",
    });
    const listedCandidates = await fetch(
      `${baseUrl}/programs/${programId}/quick-checks/candidates?status=draft`,
      { headers: { cookie: bootstrap.cookie } },
    );

    assert.deepEqual(
      {
        created: quickCheckCandidateProjection(await createdCandidate.json()),
        createdStatusCode: createdCandidate.status,
        listed: quickCheckCandidateListProjection(await listedCandidates.json()),
        listedStatusCode: listedCandidates.status,
      },
      {
        created: {
          answerKeyText: "A set closed under addition and scalar multiplication",
          checkKind: "single_select_quick_check",
          optionTexts: ["A set with addition only", "A set closed under addition and scalar multiplication"],
          programId,
          prompt: "Which statement describes a vector space?",
          sourceIds: [sourceId],
          status: "draft",
          title: "Vector-space definition",
        },
        createdStatusCode: 200,
        listed: ["Vector-space definition"],
        listedStatusCode: 200,
      },
    );
  } finally {
    await close();
  }
});

test("quickCheckAcceptanceAndRejection_shouldExposeCuratorRevisionAndRejectedCandidate", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({ ids: manyIds(50) });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    const firstCandidate = await createQuickCheckCandidate(baseUrl, bootstrap, programId, {
      answerKeyOptionIndex: 0,
      checkKind: "single_select_quick_check",
      options: ["Closure under addition", "Finite dimension"],
      prompt: "Which property is required for a vector space?",
      title: "Closure check",
    });
    const firstCandidateId = (await firstCandidate.json()).value.quickCheckCandidate.candidateId;
    const firstAccepted = await acceptQuickCheckCandidate(baseUrl, bootstrap, firstCandidateId, {});
    const acceptedQuickCheck = (await firstAccepted.json()).value.acceptedQuickCheck;
    const curationRevision = await fetch(
      `${baseUrl}/quick-checks/revisions/${acceptedQuickCheck.revisionId}/curation`,
      { headers: { cookie: bootstrap.cookie } },
    );
    const rejectedCandidate = await createQuickCheckCandidate(baseUrl, bootstrap, programId, {
      answerKeyOptionIndex: 1,
      checkKind: "single_select_quick_check",
      options: ["No closure", "Closure under scalar multiplication"],
      prompt: "Which property is also required?",
      title: "Scalar closure check",
    });
    const rejectedCandidateId = (await rejectedCandidate.json()).value.quickCheckCandidate.candidateId;
    const rejected = await rejectQuickCheckCandidate(baseUrl, bootstrap, rejectedCandidateId);

    assert.deepEqual(
      {
        accepted: acceptedQuickCheckForCurationProjection({ status: "accepted", value: { acceptedQuickCheck } }),
        acceptedStatusCode: firstAccepted.status,
        curation: acceptedQuickCheckForCurationProjection(await curationRevision.json()),
        curationStatusCode: curationRevision.status,
        rejected: quickCheckCandidateProjection(await rejected.json()),
        rejectedStatusCode: rejected.status,
      },
      {
        accepted: {
          acceptedFromCandidateId: firstCandidateId,
          answerKeyText: "Closure under addition",
          optionTexts: ["Closure under addition", "Finite dimension"],
          programId,
          prompt: "Which property is required for a vector space?",
          title: "Closure check",
        },
        acceptedStatusCode: 200,
        curation: {
          acceptedFromCandidateId: firstCandidateId,
          answerKeyText: "Closure under addition",
          optionTexts: ["Closure under addition", "Finite dimension"],
          programId,
          prompt: "Which property is required for a vector space?",
          title: "Closure check",
        },
        curationStatusCode: 200,
        rejected: {
          answerKeyText: "Closure under scalar multiplication",
          checkKind: "single_select_quick_check",
          optionTexts: ["No closure", "Closure under scalar multiplication"],
          programId,
          prompt: "Which property is also required?",
          sourceIds: [],
          status: "rejected",
          title: "Scalar closure check",
        },
        rejectedStatusCode: 200,
      },
    );
  } finally {
    await close();
  }
});

test("listAcceptedQuickChecksForCuration_shouldExposeCuratorListWithEntityRevisionAndAnswerKey", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({ ids: manyIds(50) });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    const candidate = await createQuickCheckCandidate(baseUrl, bootstrap, programId, {
      answerKeyOptionIndex: 0,
      checkKind: "single_select_quick_check",
      options: ["Closure under addition", "Finite dimension"],
      prompt: "Which property is required for a vector space?",
      title: "Closure check",
    });
    const candidateId = (await candidate.json()).value.quickCheckCandidate.candidateId;
    const accepted = await acceptQuickCheckCandidate(baseUrl, bootstrap, candidateId, {});
    const acceptedQuickCheck = (await accepted.json()).value.acceptedQuickCheck;

    const listResponse = await fetch(`${baseUrl}/programs/${programId}/quick-checks/curation`, {
      headers: { cookie: bootstrap.cookie },
    });
    const listBody = await listResponse.json();
    const item = listBody.value?.acceptedQuickChecks?.[0];

    assert.deepEqual(
      {
        statusCode: listResponse.status,
        entityId: item?.entityId,
        revisionId: item?.revisionId,
        answerKeyOptionId: item?.answerKeyOptionId,
        programId: item?.programId,
        title: item?.title,
      },
      {
        statusCode: 200,
        entityId: acceptedQuickCheck.entityId,
        revisionId: acceptedQuickCheck.revisionId,
        answerKeyOptionId: acceptedQuickCheck.answerKeyOptionId,
        programId,
        title: "Closure check",
      },
    );
  } finally {
    await close();
  }
});

test("quickCheckCuratorRoutes_shouldRejectInvalidBodiesAndUnauthorizedCallers", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({ ids: manyIds(50) });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const curator = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Program Curator",
      login: "quick-check-curator@example.test",
    });
    const outsider = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Program Outsider",
      login: "quick-check-outsider@example.test",
    });
    const program = await createProgram(baseUrl, curator, { title: "Linear Algebra" });
    const programId = (await program.json()).value.program.programId;
    const route = `/programs/${programId}/quick-checks/candidates`;
    const candidate = await createQuickCheckCandidate(baseUrl, curator, programId, {
      answerKeyOptionIndex: 0,
      checkKind: "single_select_quick_check",
      options: ["Closed", "Open"],
      prompt: "Which property is required?",
      title: "Closure check",
    });
    const candidateId = (await candidate.json()).value.quickCheckCandidate.candidateId;
    const mutationRoutes = [
      route,
      `/quick-checks/candidates/${candidateId}/acceptance`,
      `/quick-checks/candidates/${candidateId}/rejection`,
    ];
    const missingSessionResponses = [];
    const invalidSessionResponses = [];
    for (const mutationRoute of mutationRoutes) {
      const response = await fetch(`${baseUrl}${mutationRoute}`, {
        body: mutationRoute === route ? JSON.stringify({
          answerKeyOptionIndex: 0,
          checkKind: "single_select_quick_check",
          options: ["Closed", "Open"],
          prompt: "Which property is required?",
          title: "Closure check",
        }) : undefined,
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      missingSessionResponses.push({ body: await response.json(), statusCode: response.status });
      const invalidSession = await fetch(`${baseUrl}${mutationRoute}`, {
        body: mutationRoute === route ? JSON.stringify({
          answerKeyOptionIndex: 0,
          checkKind: "single_select_quick_check",
          options: ["Closed", "Open"],
          prompt: "Which property is required?",
          title: "Closure check",
        }) : undefined,
        headers: {
          cookie: "agonara_session=session-missing",
          "content-type": "application/json",
        },
        method: "POST",
      });
      invalidSessionResponses.push({ body: await invalidSession.json(), statusCode: invalidSession.status });
    }
    const invalidBodies = [
      undefined,
      "not valid json{{{",
      JSON.stringify([]),
      JSON.stringify({}),
      JSON.stringify({
        answerKeyOptionIndex: 0,
        checkKind: "single_select_quick_check",
        extra: true,
        options: ["Closed", "Open"],
        prompt: "Which property is required?",
        title: "Closure check",
      }),
      JSON.stringify({
        answerKeyOptionIndex: 0,
        checkKind: "open_answer",
        options: ["Closed", "Open"],
        prompt: "Which property is required?",
        title: "Closure check",
      }),
      JSON.stringify({
        answerKeyOptionIndex: 0,
        checkKind: "single_select_quick_check",
        options: ["Closed"],
        prompt: "Which property is required?",
        title: "Closure check",
      }),
      JSON.stringify({
        answerKeyOptionIndex: 2,
        checkKind: "single_select_quick_check",
        options: ["Closed", "Open"],
        prompt: "Which property is required?",
        title: "Closure check",
      }),
      JSON.stringify({
        answerKeyOptionIndex: 0,
        checkKind: "single_select_quick_check",
        options: ["Closed", " closed "],
        prompt: "Which property is required?",
        title: "Closure check",
      }),
    ];
    const invalidResponses = [];
    for (const body of invalidBodies) {
      const response = await fetch(`${baseUrl}${route}`, {
        body,
        headers: {
          cookie: curator.cookie,
          "content-type": "application/json",
          "x-agonara-csrf": curator.csrfToken,
        },
        method: "POST",
      });
      invalidResponses.push({ body: await response.json(), statusCode: response.status });
    }
    const unauthorizedResponses = [];
    for (const session of [bootstrap, outsider]) {
      const response = await fetch(`${baseUrl}${route}`, { headers: { cookie: session.cookie } });
      unauthorizedResponses.push({ body: await response.json(), statusCode: response.status });
    }
    const unknownProgram = await fetch(`${baseUrl}/programs/program-missing/quick-checks/candidates`, {
      headers: { cookie: curator.cookie },
    });

    assert.deepEqual(
      {
        invalidResponses,
        invalidSessionResponses,
        missingSessionResponses,
        unauthorizedResponses,
        unknownProgram: { body: await unknownProgram.json(), statusCode: unknownProgram.status },
      },
      {
        invalidResponses: invalidBodies.map(() => ({
          body: { status: "rejected", reason: "validation_failed" },
          statusCode: 400,
        })),
        invalidSessionResponses: mutationRoutes.map(() => ({
          body: { status: "rejected", reason: "session_not_found" },
          statusCode: 401,
        })),
        missingSessionResponses: mutationRoutes.map(() => ({
          body: { status: "rejected", reason: "session_not_found" },
          statusCode: 401,
        })),
        unauthorizedResponses: [
          {
            body: { status: "rejected", reason: "admin_or_curator_required" },
            statusCode: 403,
          },
          {
            body: { status: "rejected", reason: "admin_or_curator_required" },
            statusCode: 403,
          },
        ],
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

async function rejectQuickCheckCandidate(baseUrl, session, candidateId, body) {
  return fetch(`${baseUrl}/quick-checks/candidates/${candidateId}/rejection`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      cookie: session.cookie,
      "content-type": "application/json",
      "x-agonara-csrf": session.csrfToken,
    },
    method: "POST",
  });
}

function quickCheckCandidateProjection(body) {
  const candidate = body.value?.quickCheckCandidate;
  const answerKeyOption = candidate?.options?.find($0 => $0.optionId === candidate.answerKeyOptionId);
  return {
    answerKeyText: answerKeyOption?.text,
    checkKind: candidate?.checkKind,
    optionTexts: candidate?.options?.map($0 => $0.text),
    programId: candidate?.programId,
    prompt: candidate?.prompt,
    sourceIds: candidate?.sourceIds,
    status: candidate?.status,
    title: candidate?.title,
  };
}

function quickCheckCandidateListProjection(body) {
  return body.value?.quickCheckCandidates?.map($0 => $0.title) ?? [];
}

function acceptedQuickCheckForCurationProjection(body) {
  const quickCheck = body.value?.acceptedQuickCheck;
  const answerKeyOption = quickCheck?.options?.find($0 => $0.optionId === quickCheck.answerKeyOptionId);
  return {
    acceptedFromCandidateId: quickCheck?.acceptedFromCandidateId,
    answerKeyText: answerKeyOption?.text,
    optionTexts: quickCheck?.options?.map($0 => $0.text),
    programId: quickCheck?.programId,
    prompt: quickCheck?.prompt,
    title: quickCheck?.title,
  };
}
