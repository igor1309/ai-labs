import assert from "node:assert/strict";
import test from "node:test";
import {
  acceptAssessmentCriterionCandidate,
  bootstrapAdmin,
  createAssessmentCriterionCandidate,
  createIdentitySession,
  createProgram,
  createProgramSource,
  listenWithIdentityProgramAndCorpus,
  manyIds,
} from "./support/http-api.js";

test("assessmentCriteriaList_shouldRejectMissingSession_withSessionNotFound", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus();

  try {
    const response = await fetch(`${baseUrl}/programs/program-1/assessment-criteria`);

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

test("assessmentCriteriaList_shouldDelegateToCorpusCommands_onActiveSession", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    corpusCommandsOverride: {
      listAcceptedAssessmentCriteria: ({ actingIdentityId, programId }) => ({
        status: "accepted",
        value: {
          acceptedAssessmentCriteria: [{ actingIdentityId, programId }],
        },
      }),
    },
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const response = await fetch(`${baseUrl}/programs/program-1/assessment-criteria`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        statusCode: response.status,
        body: await response.json(),
      },
      {
        statusCode: 200,
        body: {
          status: "accepted",
          value: {
            acceptedAssessmentCriteria: [{ actingIdentityId: "identity-1", programId: "program-1" }],
          },
        },
      },
    );
  } finally {
    await close();
  }
});

test("assessmentCriterionCandidates_shouldCreateAndListDraftCandidate_onCuratorSession", async () => {
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
    const createdCandidate = await createAssessmentCriterionCandidate(baseUrl, bootstrap, programId, {
      body: "Explain why a vector space is closed under addition.",
      sourceIds: [sourceId],
      title: "Vector-space closure",
    });
    const listedCandidates = await fetch(
      `${baseUrl}/programs/${programId}/assessment-criteria/candidates?status=draft`,
      { headers: { cookie: bootstrap.cookie } },
    );

    assert.deepEqual(
      {
        created: assessmentCriterionCandidateProjection(await createdCandidate.json()),
        createdStatusCode: createdCandidate.status,
        listed: assessmentCriterionCandidateListProjection(await listedCandidates.json()),
        listedStatusCode: listedCandidates.status,
      },
      {
        created: {
          body: "Explain why a vector space is closed under addition.",
          programId,
          sourceIds: [sourceId],
          status: "draft",
          title: "Vector-space closure",
        },
        createdStatusCode: 200,
        listed: ["Vector-space closure"],
        listedStatusCode: 200,
      },
    );
  } finally {
    await close();
  }
});

test("assessmentCriterionAcceptance_shouldCreateAcceptedRevision_onCuratorSession", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({ ids: manyIds(50) });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    const createdSource = await createProgramSource(baseUrl, bootstrap, programId, {
      sourceKind: "textbook",
      title: "Linear Algebra Done Right",
    });
    const sourceId = (await createdSource.json()).value.programSource.sourceId;
    const firstCandidate = await createAssessmentCriterionCandidate(baseUrl, bootstrap, programId, {
      body: "Explain closure under addition.",
      sourceIds: [sourceId],
      title: "Vector-space closure",
    });
    const firstCandidateId = (await firstCandidate.json()).value.assessmentCriterionCandidate.candidateId;
    const firstAccepted = await acceptAssessmentCriterionCandidate(baseUrl, bootstrap, firstCandidateId, {});

    assert.deepEqual(
      {
        body: acceptedAssessmentCriterionProjection(await firstAccepted.json()),
        statusCode: firstAccepted.status,
      },
      {
        body: {
          acceptedFromCandidateId: firstCandidateId,
          programId,
          sourceIds: [sourceId],
          title: "Vector-space closure",
        },
        statusCode: 200,
      },
    );
  } finally {
    await close();
  }
});

test("assessmentCriterionRejection_shouldRejectDraftCandidate_onCuratorSession", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({ ids: manyIds(30) });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    const candidate = await createAssessmentCriterionCandidate(baseUrl, bootstrap, programId, {
      body: "Explain rejected criterion.",
      title: "Rejected criterion",
    });
    const candidateId = (await candidate.json()).value.assessmentCriterionCandidate.candidateId;
    const rejected = await rejectAssessmentCriterionCandidate(baseUrl, bootstrap, candidateId);

    assert.deepEqual(
      {
        body: assessmentCriterionCandidateProjection(await rejected.json()),
        statusCode: rejected.status,
      },
      {
        body: {
          body: "Explain rejected criterion.",
          programId,
          sourceIds: [],
          status: "rejected",
          title: "Rejected criterion",
        },
        statusCode: 200,
      },
    );
  } finally {
    await close();
  }
});

test("acceptedAssessmentCriteria_shouldListCurrentAndReturnHistoricalRevision_onCuratorSession", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({ ids: manyIds(50) });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    const firstCandidate = await createAssessmentCriterionCandidate(baseUrl, bootstrap, programId, {
      body: "Explain closure under addition.",
      title: "Vector-space closure",
    });
    const firstCandidateId = (await firstCandidate.json()).value.assessmentCriterionCandidate.candidateId;
    const firstAccepted = await acceptAssessmentCriterionCandidate(baseUrl, bootstrap, firstCandidateId, {});
    const firstAcceptedCriterion = (await firstAccepted.json()).value.acceptedAssessmentCriterion;
    const replacementCandidate = await createAssessmentCriterionCandidate(baseUrl, bootstrap, programId, {
      body: "Explain closure under addition and scalar multiplication.",
      title: "Vector-space closure revised",
    });
    const replacementCandidateId = (await replacementCandidate.json()).value.assessmentCriterionCandidate.candidateId;
    await acceptAssessmentCriterionCandidate(baseUrl, bootstrap, replacementCandidateId, {
      targetEntityId: firstAcceptedCriterion.entityId,
    });
    const listed = await fetch(`${baseUrl}/programs/${programId}/assessment-criteria`, {
      headers: { cookie: bootstrap.cookie },
    });
    const historical = await fetch(`${baseUrl}/assessment-criteria/revisions/${firstAcceptedCriterion.revisionId}`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        historical: acceptedAssessmentCriterionProjection(await historical.json()),
        historicalStatusCode: historical.status,
        listedTitles: (await listed.json()).value.acceptedAssessmentCriteria.map($0 => $0.title),
        listedStatusCode: listed.status,
      },
      {
        historical: {
          acceptedFromCandidateId: firstCandidateId,
          programId,
          sourceIds: [],
          title: "Vector-space closure",
        },
        historicalStatusCode: 200,
        listedTitles: ["Vector-space closure revised"],
        listedStatusCode: 200,
      },
    );
  } finally {
    await close();
  }
});

test("assessmentCriterionStatus_shouldRequireCsrfCuratorAndKeepHistoricalRevisionReadable", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({ ids: manyIds(60) });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const ordinary = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Ordinary Identity",
      login: "ordinary-criterion-status@example.test",
    });
    const program = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await program.json()).value.program.programId;
    const criterion = await createAcceptedAssessmentCriterion(baseUrl, bootstrap, programId, {
      title: "Withdrawn criterion",
    });
    const missingCsrf = await fetch(`${baseUrl}/assessment-criteria/${criterion.entityId}/status`, {
      body: JSON.stringify({ status: "withdrawn" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
      },
      method: "PUT",
    });
    const nonCurator = await updateAssessmentCriterionStatus(baseUrl, ordinary, criterion.entityId, {
      status: "withdrawn",
    });
    const invalid = await updateAssessmentCriterionStatus(baseUrl, bootstrap, criterion.entityId, {
      status: "retired",
    });
    const withdrawn = await updateAssessmentCriterionStatus(baseUrl, bootstrap, criterion.entityId, {
      status: "withdrawn",
    });
    const list = await fetch(`${baseUrl}/programs/${programId}/assessment-criteria`, {
      headers: { cookie: bootstrap.cookie },
    });
    const detail = await fetch(`${baseUrl}/assessment-criteria/revisions/${criterion.revisionId}`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        missingCsrf: { body: await missingCsrf.json(), statusCode: missingCsrf.status },
        nonCurator: { body: await nonCurator.json(), statusCode: nonCurator.status },
        invalid: { body: await invalid.json(), statusCode: invalid.status },
        withdrawn: { body: await withdrawn.json(), statusCode: withdrawn.status },
        list: { body: acceptedAssessmentCriterionListProjection(await list.json()), statusCode: list.status },
        detail: { body: acceptedAssessmentCriterionProjection(await detail.json()), statusCode: detail.status },
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
                id: criterion.entityId,
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
            acceptedFromCandidateId: criterion.acceptedFromCandidateId,
            programId,
            sourceIds: [],
            title: "Withdrawn criterion",
          },
          statusCode: 200,
        },
      },
    );
  } finally {
    await close();
  }
});

async function updateAssessmentCriterionStatus(baseUrl, session, entityId, body) {
  return fetch(`${baseUrl}/assessment-criteria/${entityId}/status`, {
    body: JSON.stringify(body),
    headers: {
      cookie: session.cookie,
      "content-type": "application/json",
      "x-agonara-csrf": session.csrfToken,
    },
    method: "PUT",
  });
}

async function rejectAssessmentCriterionCandidate(baseUrl, session, candidateId, body) {
  return fetch(`${baseUrl}/assessment-criteria/candidates/${candidateId}/rejection`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      cookie: session.cookie,
      "content-type": "application/json",
      "x-agonara-csrf": session.csrfToken,
    },
    method: "POST",
  });
}

async function createAcceptedAssessmentCriterion(
  baseUrl,
  session,
  programId,
  { body = "Explain closure under addition.", title = "Vector-space closure" } = {},
) {
  const candidate = await createAssessmentCriterionCandidate(baseUrl, session, programId, {
    body,
    title,
  });
  const candidateId = (await candidate.json()).value.assessmentCriterionCandidate.candidateId;
  const acceptedCriterion = await acceptAssessmentCriterionCandidate(baseUrl, session, candidateId, {});
  return (await acceptedCriterion.json()).value.acceptedAssessmentCriterion;
}

function assessmentCriterionCandidateProjection(body) {
  const candidate = body.value?.assessmentCriterionCandidate;
  return {
    body: candidate?.body,
    programId: candidate?.programId,
    sourceIds: candidate?.sourceIds,
    status: candidate?.status,
    title: candidate?.title,
  };
}

function assessmentCriterionCandidateListProjection(body) {
  return body.value?.assessmentCriterionCandidates?.map($0 => $0.title) ?? [];
}

function acceptedAssessmentCriterionProjection(body) {
  const criterion = body.value?.acceptedAssessmentCriterion;
  return {
    acceptedFromCandidateId: criterion?.acceptedFromCandidateId,
    programId: criterion?.programId,
    sourceIds: criterion?.sourceIds,
    title: criterion?.title,
  };
}

function acceptedAssessmentCriterionListProjection(body) {
  return body.value?.acceptedAssessmentCriteria?.map($0 => $0.title) ?? [];
}
