import assert from "node:assert/strict";
import test from "node:test";
import {
  bootstrapAdmin,
  createIdentitySession,
  createProgram,
  getHttpResponse,
  listenWithIdentityProgramAndCorpus,
  manyIds,
} from "./support/http-api.js";

test("assessmentRoutes_shouldMapAssessmentRejections_toHttpStatuses", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    corpusCommandsOverride: {
      listAcceptedAssessmentCriteria: ({ programId }) => ({ status: "rejected", reason: programId }),
    },
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const cases = [
      ["identity_not_active", 403],
      ["criterion_candidate_not_found", 404],
      ["criterion_entity_not_found", 404],
      ["criterion_revision_not_found", 404],
      ["check_candidate_not_found", 404],
      ["check_entity_not_found", 404],
      ["check_revision_not_found", 404],
      ["criterion_candidate_already_accepted", 409],
      ["criterion_candidate_already_rejected", 409],
      ["criterion_entity_program_mismatch", 409],
      ["check_candidate_already_accepted", 409],
      ["check_candidate_already_rejected", 409],
      ["check_entity_program_mismatch", 409],
    ];
    const responses = [];
    for (const [reason] of cases) {
      const response = await fetch(`${baseUrl}/programs/${reason}/assessment-criteria`, {
        headers: { cookie: bootstrap.cookie },
      });
      responses.push({ body: await response.json(), statusCode: response.status });
    }

    assert.deepEqual(
      responses,
      cases.map(([reason, statusCode]) => ({
        body: { status: "rejected", reason },
        statusCode,
      })),
    );
  } finally {
    await close();
  }
});

test("assessmentAcceptance_shouldRejectBlankTargetEntityIds_withValidationFailed", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus();

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const cases = [
      "/assessment-criteria/candidates/candidate-1/acceptance",
      "/open-answer-checks/candidates/candidate-1/acceptance",
    ];
    const responses = [];
    for (const route of cases) {
      const response = await fetch(`${baseUrl}${route}`, {
        body: JSON.stringify({ targetEntityId: "   " }),
        headers: {
          cookie: bootstrap.cookie,
          "content-type": "application/json",
          "x-agonara-csrf": bootstrap.csrfToken,
        },
        method: "POST",
      });
      responses.push({ body: await response.json(), statusCode: response.status });
    }

    assert.deepEqual(
      responses,
      cases.map(() => ({
        body: { status: "rejected", reason: "validation_failed" },
        statusCode: 400,
      })),
    );
  } finally {
    await close();
  }
});

test("assessmentLists_shouldRejectInvalidQueriesAndRouteMismatchedCursors", async () => {
  const acceptedAssessmentCriteria = Array.from({ length: 51 }, (_, index) => ({
    entityId: `criterion-${index + 1}`,
  }));
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    corpusCommandsOverride: {
      listAcceptedAssessmentCriteria: () => ({
        status: "accepted",
        value: { acceptedAssessmentCriteria },
      }),
      listAcceptedOpenAnswerChecks: () => ({
        status: "accepted",
        value: { acceptedOpenAnswerChecks: [] },
      }),
      listAssessmentCriterionCandidates: () => ({
        status: "accepted",
        value: {
          assessmentCriterionCandidates: [
            { candidateId: "criterion-candidate-1" },
            { candidateId: "criterion-candidate-2" },
          ],
        },
      }),
      listOpenAnswerCheckCandidates: () => ({
        status: "accepted",
        value: { openAnswerCheckCandidates: [] },
      }),
    },
    ids: manyIds(20),
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const invalidCases = [
      "/programs/program-1/assessment-criteria/candidates?status=queued",
      "/programs/program-1/assessment-criteria/candidates?limit=0",
      "/programs/program-1/assessment-criteria?limit=101",
      "/programs/program-1/open-answer-checks/candidates?limit=abc",
      "/programs/program-1/open-answer-checks?cursor=unknown",
    ];
    const invalidResponses = [];
    for (const route of invalidCases) {
      const response = await fetch(`${baseUrl}${route}`, {
        headers: { cookie: bootstrap.cookie },
      });
      invalidResponses.push({ body: await response.json(), statusCode: response.status });
    }
    const defaultPage = await fetch(`${baseUrl}/programs/program-1/assessment-criteria`, {
      headers: { cookie: bootstrap.cookie },
    });
    const defaultBody = await defaultPage.json();
    const candidatePage = await fetch(
      `${baseUrl}/programs/program-1/assessment-criteria/candidates?limit=1`,
      { headers: { cookie: bootstrap.cookie } },
    );
    const candidateBody = await candidatePage.json();
    const routeMismatch = await fetch(
      `${baseUrl}/programs/program-1/open-answer-checks/candidates?cursor=${candidateBody.value.nextCursor}`,
      { headers: { cookie: bootstrap.cookie } },
    );

    assert.deepEqual(
      {
        defaultPage: {
          count: defaultBody.value.acceptedAssessmentCriteria.length,
          hasNextCursor: typeof defaultBody.value.nextCursor === "string",
          statusCode: defaultPage.status,
        },
        invalidResponses,
        routeMismatch: {
          body: await routeMismatch.json(),
          statusCode: routeMismatch.status,
        },
        cursorHasSecrets: [
          bootstrap.csrfToken,
          "operator-secret",
          "session",
          "select ",
          "/Users/",
        ].some($0 => candidateBody.value.nextCursor?.includes($0)),
      },
      {
        defaultPage: {
          count: 50,
          hasNextCursor: true,
          statusCode: 200,
        },
        invalidResponses: invalidCases.map(() => ({
          body: { status: "rejected", reason: "validation_failed" },
          statusCode: 400,
        })),
        routeMismatch: {
          body: { status: "rejected", reason: "validation_failed" },
          statusCode: 400,
        },
        cursorHasSecrets: false,
      },
    );
  } finally {
    await close();
  }
});

test("assessmentCandidateCreation_shouldRejectCsrfAndInvalidBodies", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({ ids: manyIds(40) });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const program = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await program.json()).value.program.programId;
    const criterionRoute = `/programs/${programId}/assessment-criteria/candidates`;
    const checkRoute = `/programs/${programId}/open-answer-checks/candidates`;
    const stateMutationCases = [
      [criterionRoute, JSON.stringify({ body: "Explain closure.", title: "Closure" })],
      [checkRoute, JSON.stringify({
        checkKind: "open_answer",
        criterionEntityIds: ["criterion-1"],
        prompt: "Why?",
        title: "Closure check",
      })],
      ["/assessment-criteria/candidates/candidate-missing/acceptance", undefined],
      ["/assessment-criteria/candidates/candidate-missing/rejection", undefined],
      ["/open-answer-checks/candidates/candidate-missing/acceptance", undefined],
      ["/open-answer-checks/candidates/candidate-missing/rejection", undefined],
    ];
    const csrfResponses = [];
    for (const [route, body] of stateMutationCases) {
      for (const csrfToken of [undefined, "wrong-token"]) {
        const response = await fetch(`${baseUrl}${route}`, {
          body,
          headers: {
            cookie: bootstrap.cookie,
            "content-type": "application/json",
            ...(csrfToken ? { "x-agonara-csrf": csrfToken } : {}),
          },
          method: "POST",
        });
        csrfResponses.push({ body: await response.json(), statusCode: response.status });
      }
    }
    const invalidCases = [
      [criterionRoute, undefined],
      [criterionRoute, "not valid json{{{"],
      [criterionRoute, JSON.stringify([])],
      [criterionRoute, JSON.stringify({})],
      [criterionRoute, JSON.stringify({ body: "Body", extra: true, title: "Title" })],
      [criterionRoute, JSON.stringify({ body: "   ", title: "Title" })],
      [criterionRoute, JSON.stringify({ body: "Body", title: "   " })],
      [criterionRoute, JSON.stringify({ body: "Body", rationale: 42, title: "Title" })],
      [criterionRoute, JSON.stringify({ body: "Body", sourceIds: "source-1", title: "Title" })],
      [criterionRoute, JSON.stringify({ body: "Body", sourceIds: [1], title: "Title" })],
      [checkRoute, undefined],
      [checkRoute, "not valid json{{{"],
      [checkRoute, JSON.stringify([])],
      [checkRoute, JSON.stringify({})],
      [checkRoute, JSON.stringify({ criterionEntityIds: ["criterion-1"], extra: true })],
      [checkRoute, JSON.stringify({
        checkKind: "multiple_choice",
        criterionEntityIds: ["criterion-1"],
        prompt: "Prompt",
        title: "Title",
      })],
      [checkRoute, JSON.stringify({
        checkKind: "open_answer",
        criterionEntityIds: [],
        prompt: "Prompt",
        title: "Title",
      })],
      [checkRoute, JSON.stringify({
        checkKind: "open_answer",
        criterionEntityIds: ["criterion-1"],
        title: "Title",
      })],
      [checkRoute, JSON.stringify({
        checkKind: "open_answer",
        criterionEntityIds: ["criterion-1"],
        prompt: "   ",
        title: "Title",
      })],
      [checkRoute, JSON.stringify({
        checkKind: "open_answer",
        criterionEntityIds: ["criterion-1"],
        prompt: "Prompt",
        rationale: 42,
        title: "Title",
      })],
      [checkRoute, JSON.stringify({
        checkKind: "open_answer",
        criterionEntityIds: "criterion-1",
        prompt: "Prompt",
        title: "Title",
      })],
      [checkRoute, JSON.stringify({
        checkKind: "open_answer",
        criterionEntityIds: [1],
        prompt: "Prompt",
        title: "Title",
      })],
    ];
    const invalidResponses = [];
    for (const [route, body] of invalidCases) {
      const response = await fetch(`${baseUrl}${route}`, {
        body,
        headers: {
          cookie: bootstrap.cookie,
          "content-type": "application/json",
          "x-agonara-csrf": bootstrap.csrfToken,
        },
        method: "POST",
      });
      invalidResponses.push({ body: await response.json(), statusCode: response.status });
    }

    assert.deepEqual(
      {
        csrfResponses,
        invalidResponses,
      },
      {
        csrfResponses: stateMutationCases.flatMap(() => [
          {
            body: { status: "rejected", reason: "csrf_required" },
            statusCode: 403,
          },
          {
            body: { status: "rejected", reason: "csrf_invalid" },
            statusCode: 403,
          },
        ]),
        invalidResponses: invalidCases.map(() => ({
          body: { status: "rejected", reason: "validation_failed" },
          statusCode: 400,
        })),
      },
    );
  } finally {
    await close();
  }
});

test("assessmentAcceptanceAndRejection_shouldEnforceBodyContracts", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus();

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const acceptanceRoutes = [
      "/assessment-criteria/candidates/candidate-missing/acceptance",
      "/open-answer-checks/candidates/candidate-missing/acceptance",
    ];
    const rejectionRoutes = [
      "/assessment-criteria/candidates/candidate-missing/rejection",
      "/open-answer-checks/candidates/candidate-missing/rejection",
    ];
    const invalidCases = [
      ...acceptanceRoutes.flatMap(route => [
        [route, "not valid json{{{"],
        [route, JSON.stringify([])],
        [route, JSON.stringify({ note: "ignored" })],
        [route, JSON.stringify({ targetEntityId: 42 })],
      ]),
      ...rejectionRoutes.flatMap(route => [
        [route, "not valid json{{{"],
        [route, JSON.stringify([])],
        [route, JSON.stringify({ reason: "duplicate" })],
      ]),
    ];
    const invalidResponses = [];
    for (const [route, body] of invalidCases) {
      const response = await fetch(`${baseUrl}${route}`, {
        body,
        headers: {
          cookie: bootstrap.cookie,
          "content-type": "application/json",
          "x-agonara-csrf": bootstrap.csrfToken,
        },
        method: "POST",
      });
      invalidResponses.push({ body: await response.json(), statusCode: response.status });
    }
    const missingBodyResponses = [];
    for (const route of [...acceptanceRoutes, ...rejectionRoutes]) {
      const response = await fetch(`${baseUrl}${route}`, {
        headers: {
          cookie: bootstrap.cookie,
          "x-agonara-csrf": bootstrap.csrfToken,
        },
        method: "POST",
      });
      missingBodyResponses.push({ body: await response.json(), statusCode: response.status });
    }

    assert.deepEqual(
      {
        invalidResponses,
        missingBodyResponses,
      },
      {
        invalidResponses: invalidCases.map(() => ({
          body: { status: "rejected", reason: "validation_failed" },
          statusCode: 400,
        })),
        missingBodyResponses: [
          {
            body: { status: "rejected", reason: "criterion_candidate_not_found" },
            statusCode: 404,
          },
          {
            body: { status: "rejected", reason: "check_candidate_not_found" },
            statusCode: 404,
          },
          {
            body: { status: "rejected", reason: "criterion_candidate_not_found" },
            statusCode: 404,
          },
          {
            body: { status: "rejected", reason: "check_candidate_not_found" },
            statusCode: 404,
          },
        ],
      },
    );
  } finally {
    await close();
  }
});

test("assessmentRoutes_shouldKeepAdminReadsSeparateFromCuratorWrites", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({ ids: manyIds(80) });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const curator = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Program Curator",
      login: "curator@example.test",
    });
    const outsider = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Program Outsider",
      login: "outsider@example.test",
    });
    const program = await createProgram(baseUrl, curator, { title: "Linear Algebra" });
    const programId = (await program.json()).value.program.programId;
    const candidateRoutes = [
      `/programs/${programId}/assessment-criteria/candidates`,
      `/programs/${programId}/open-answer-checks/candidates`,
    ];
    const acceptedRoutes = [
      `/programs/${programId}/assessment-criteria`,
      `/programs/${programId}/open-answer-checks`,
    ];
    const responses = [];
    for (const route of candidateRoutes) {
      responses.push(await getHttpResponse(baseUrl, route, bootstrap));
    }
    for (const route of acceptedRoutes) {
      responses.push(await getHttpResponse(baseUrl, route, bootstrap));
    }
    for (const route of candidateRoutes) {
      responses.push(await getHttpResponse(baseUrl, route, curator));
    }
    for (const route of acceptedRoutes) {
      responses.push(await getHttpResponse(baseUrl, route, outsider));
    }
    responses.push(await getHttpResponse(baseUrl, "/programs/program-missing/assessment-criteria", bootstrap));
    responses.push(await getHttpResponse(
      baseUrl,
      "/programs/program-missing/open-answer-checks/candidates",
      bootstrap,
    ));

    assert.deepEqual(
      responses,
      [
        ...candidateRoutes.map(() => ({
          body: { status: "rejected", reason: "admin_or_curator_required" },
          statusCode: 403,
        })),
        {
          body: { status: "accepted", value: { acceptedAssessmentCriteria: [] } },
          statusCode: 200,
        },
        {
          body: { status: "accepted", value: { acceptedOpenAnswerChecks: [] } },
          statusCode: 200,
        },
        {
          body: { status: "accepted", value: { assessmentCriterionCandidates: [] } },
          statusCode: 200,
        },
        {
          body: { status: "accepted", value: { openAnswerCheckCandidates: [] } },
          statusCode: 200,
        },
        ...acceptedRoutes.map(() => ({
          body: { status: "rejected", reason: "participation_required" },
          statusCode: 403,
        })),
        {
          body: { status: "rejected", reason: "program_not_found" },
          statusCode: 404,
        },
        {
          body: { status: "rejected", reason: "program_not_found" },
          statusCode: 404,
        },
      ],
    );
  } finally {
    await close();
  }
});

test("assessmentRoutes_shouldRedactFaultResponses", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    corpusCommandsOverride: {
      listAcceptedOpenAnswerChecks: () => {
        throw new Error(
          "authorization='bearer token' csrf='csrf-secret' cookie='session-1' " +
          "password='NON_SECRET_TEST_VALUE' sql='select * from secrets' " +
          "path='/Users/operator/private' database='file:agonara.sqlite'",
        );
      },
    },
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const response = await fetch(`${baseUrl}/programs/program-1/open-answer-checks`, {
      headers: { cookie: bootstrap.cookie },
    });
    const text = await response.text();

    assert.deepEqual(
      {
        body: JSON.parse(text),
        redaction: {
          hasAuthorization: text.includes("authorization"),
          hasCookie: text.includes("cookie"),
          hasCsrf: text.includes("csrf"),
          hasDatabaseUrl: text.includes("file:"),
          hasFilesystemPath: text.includes("/Users/"),
          hasPassword: text.includes("password"),
          hasSession: text.includes("session-1"),
          hasSql: text.toLowerCase().includes("select "),
        },
        statusCode: response.status,
      },
      {
        body: { status: "fault", reason: "internal_error" },
        redaction: {
          hasAuthorization: false,
          hasCookie: false,
          hasCsrf: false,
          hasDatabaseUrl: false,
          hasFilesystemPath: false,
          hasPassword: false,
          hasSession: false,
          hasSql: false,
        },
        statusCode: 500,
      },
    );
  } finally {
    await close();
  }
});
