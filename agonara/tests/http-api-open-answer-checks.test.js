import assert from "node:assert/strict";
import test from "node:test";
import {
  acceptAssessmentCriterionCandidate,
  acceptOpenAnswerCheckCandidate,
  acceptedOpenAnswerCheckProjection,
  bootstrapAdmin,
  createAcceptedOpenAnswerCheck,
  createAssessmentCriterionCandidate,
  createIdentitySession,
  createOpenAnswerCheckCandidate,
  createProgram,
  listenWithIdentityProgramAndCorpus,
  manyIds,
} from "./support/http-api.js";

test("openAnswerChecksList_shouldRejectDisabledSessionIdentity_withIdentityDisabled", async () => {
  const { baseUrl, close, database } = await listenWithIdentityProgramAndCorpus();

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    database
      .prepare("update identities set state = 'disabled', disabled_at = ? where id = ?")
      .run("2026-05-27T10:00:00.000Z", bootstrap.body.value.identity.id);
    const response = await fetch(`${baseUrl}/programs/program-1/open-answer-checks`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        statusCode: response.status,
        body: await response.json(),
      },
      {
        statusCode: 403,
        body: { status: "rejected", reason: "identity_disabled" },
      },
    );
  } finally {
    await close();
  }
});

test("openAnswerCheckCandidates_shouldCreateAndListDraftCandidate_onAcceptedCriterion", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({ ids: manyIds(60) });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    const criterionCandidate = await createAssessmentCriterionCandidate(baseUrl, bootstrap, programId, {
      body: "Explain closure under addition.",
      title: "Vector-space closure",
    });
    const criterionCandidateId = (await criterionCandidate.json()).value.assessmentCriterionCandidate.candidateId;
    const acceptedCriterion = await acceptAssessmentCriterionCandidate(
      baseUrl,
      bootstrap,
      criterionCandidateId,
      {},
    );
    const criterionEntityId = (await acceptedCriterion.json()).value.acceptedAssessmentCriterion.entityId;
    const createdCheck = await createOpenAnswerCheckCandidate(baseUrl, bootstrap, programId, {
      checkKind: "open_answer",
      criterionEntityIds: [criterionEntityId],
      prompt: "Why is closure under addition required?",
      title: "Closure check",
    });
    const listedChecks = await fetch(`${baseUrl}/programs/${programId}/open-answer-checks/candidates?status=draft`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        created: openAnswerCheckCandidateProjection(await createdCheck.json()),
        createdStatusCode: createdCheck.status,
        listed: openAnswerCheckCandidateListProjection(await listedChecks.json()),
        listedStatusCode: listedChecks.status,
      },
      {
        created: {
          checkKind: "open_answer",
          criterionEntityIds: [criterionEntityId],
          programId,
          prompt: "Why is closure under addition required?",
          status: "draft",
          title: "Closure check",
        },
        createdStatusCode: 200,
        listed: ["Closure check"],
        listedStatusCode: 200,
      },
    );
  } finally {
    await close();
  }
});

test("openAnswerCheckAcceptance_shouldSnapshotCriterionRevision_onCuratorSession", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({ ids: manyIds(60) });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    const criterionCandidate = await createAssessmentCriterionCandidate(baseUrl, bootstrap, programId, {
      body: "Explain closure under addition.",
      title: "Vector-space closure",
    });
    const criterionCandidateId = (await criterionCandidate.json()).value.assessmentCriterionCandidate.candidateId;
    const acceptedCriterion = await acceptAssessmentCriterionCandidate(
      baseUrl,
      bootstrap,
      criterionCandidateId,
      {},
    );
    const acceptedCriterionBody = (await acceptedCriterion.json()).value.acceptedAssessmentCriterion;
    const checkCandidate = await createOpenAnswerCheckCandidate(baseUrl, bootstrap, programId, {
      checkKind: "open_answer",
      criterionEntityIds: [acceptedCriterionBody.entityId],
      prompt: "Why is closure under addition required?",
      title: "Closure check",
    });
    const checkCandidateId = (await checkCandidate.json()).value.openAnswerCheckCandidate.candidateId;
    const acceptedCheck = await acceptOpenAnswerCheckCandidate(baseUrl, bootstrap, checkCandidateId, {});

    assert.deepEqual(
      {
        body: acceptedOpenAnswerCheckProjection(await acceptedCheck.json()),
        statusCode: acceptedCheck.status,
      },
      {
        body: {
          acceptedFromCandidateId: checkCandidateId,
          criterionRevisionIds: [acceptedCriterionBody.revisionId],
          programId,
          title: "Closure check",
        },
        statusCode: 200,
      },
    );
  } finally {
    await close();
  }
});

test("openAnswerCheckRejection_shouldRejectDraftCandidate_onCuratorSession", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({ ids: manyIds(60) });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    const criterionCandidate = await createAssessmentCriterionCandidate(baseUrl, bootstrap, programId, {
      body: "Explain closure under addition.",
      title: "Vector-space closure",
    });
    const criterionCandidateId = (await criterionCandidate.json()).value.assessmentCriterionCandidate.candidateId;
    const acceptedCriterion = await acceptAssessmentCriterionCandidate(
      baseUrl,
      bootstrap,
      criterionCandidateId,
      {},
    );
    const criterionEntityId = (await acceptedCriterion.json()).value.acceptedAssessmentCriterion.entityId;
    const checkCandidate = await createOpenAnswerCheckCandidate(baseUrl, bootstrap, programId, {
      checkKind: "open_answer",
      criterionEntityIds: [criterionEntityId],
      prompt: "Why is closure under addition required?",
      title: "Rejected closure check",
    });
    const checkCandidateId = (await checkCandidate.json()).value.openAnswerCheckCandidate.candidateId;
    const rejectedCheck = await rejectOpenAnswerCheckCandidate(baseUrl, bootstrap, checkCandidateId);

    assert.deepEqual(
      {
        body: openAnswerCheckCandidateProjection(await rejectedCheck.json()),
        statusCode: rejectedCheck.status,
      },
      {
        body: {
          checkKind: "open_answer",
          criterionEntityIds: [criterionEntityId],
          programId,
          prompt: "Why is closure under addition required?",
          status: "rejected",
          title: "Rejected closure check",
        },
        statusCode: 200,
      },
    );
  } finally {
    await close();
  }
});

test("acceptedOpenAnswerChecks_shouldListCurrentAndPreserveCriterionSnapshot_onCriterionRevision", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({ ids: manyIds(80) });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    const criterionCandidate = await createAssessmentCriterionCandidate(baseUrl, bootstrap, programId, {
      body: "Explain closure under addition.",
      title: "Vector-space closure",
    });
    const criterionCandidateId = (await criterionCandidate.json()).value.assessmentCriterionCandidate.candidateId;
    const acceptedCriterion = await acceptAssessmentCriterionCandidate(
      baseUrl,
      bootstrap,
      criterionCandidateId,
      {},
    );
    const acceptedCriterionBody = (await acceptedCriterion.json()).value.acceptedAssessmentCriterion;
    const checkCandidate = await createOpenAnswerCheckCandidate(baseUrl, bootstrap, programId, {
      checkKind: "open_answer",
      criterionEntityIds: [acceptedCriterionBody.entityId],
      prompt: "Why is closure under addition required?",
      title: "Closure check",
    });
    const checkCandidateId = (await checkCandidate.json()).value.openAnswerCheckCandidate.candidateId;
    const acceptedCheck = await acceptOpenAnswerCheckCandidate(baseUrl, bootstrap, checkCandidateId, {});
    const acceptedCheckBody = (await acceptedCheck.json()).value.acceptedOpenAnswerCheck;
    const replacementCriterionCandidate = await createAssessmentCriterionCandidate(baseUrl, bootstrap, programId, {
      body: "Explain closure under addition and scalar multiplication.",
      title: "Vector-space closure revised",
    });
    const replacementCriterionCandidateId =
      (await replacementCriterionCandidate.json()).value.assessmentCriterionCandidate.candidateId;
    await acceptAssessmentCriterionCandidate(baseUrl, bootstrap, replacementCriterionCandidateId, {
      targetEntityId: acceptedCriterionBody.entityId,
    });
    const listed = await fetch(`${baseUrl}/programs/${programId}/open-answer-checks`, {
      headers: { cookie: bootstrap.cookie },
    });
    const historical = await fetch(`${baseUrl}/open-answer-checks/revisions/${acceptedCheckBody.revisionId}`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        historical: acceptedOpenAnswerCheckProjection(await historical.json()),
        historicalStatusCode: historical.status,
        listed: acceptedOpenAnswerCheckListProjection(await listed.json()),
        listedStatusCode: listed.status,
      },
      {
        historical: {
          acceptedFromCandidateId: checkCandidateId,
          criterionRevisionIds: [acceptedCriterionBody.revisionId],
          programId,
          title: "Closure check",
        },
        historicalStatusCode: 200,
        listed: ["Closure check"],
        listedStatusCode: 200,
      },
    );
  } finally {
    await close();
  }
});

test("openAnswerCheckStatus_shouldRequireCsrfCuratorAndKeepHistoricalRevisionReadable", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({ ids: manyIds(80) });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const ordinary = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Ordinary Identity",
      login: "ordinary-open-answer-status@example.test",
    });
    const program = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await program.json()).value.program.programId;
    const openAnswerCheck = await createAcceptedOpenAnswerCheck(baseUrl, bootstrap, programId, {
      checkTitle: "Withdrawn open answer check",
    });
    const missingCsrf = await fetch(`${baseUrl}/open-answer-checks/${openAnswerCheck.entityId}/status`, {
      body: JSON.stringify({ status: "withdrawn" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
      },
      method: "PUT",
    });
    const nonCurator = await updateOpenAnswerCheckStatus(baseUrl, ordinary, openAnswerCheck.entityId, {
      status: "withdrawn",
    });
    const invalid = await updateOpenAnswerCheckStatus(baseUrl, bootstrap, openAnswerCheck.entityId, {
      status: "retired",
    });
    const withdrawn = await updateOpenAnswerCheckStatus(baseUrl, bootstrap, openAnswerCheck.entityId, {
      status: "withdrawn",
    });
    const list = await fetch(`${baseUrl}/programs/${programId}/open-answer-checks`, {
      headers: { cookie: bootstrap.cookie },
    });
    const detail = await fetch(`${baseUrl}/open-answer-checks/revisions/${openAnswerCheck.revisionId}`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        missingCsrf: { body: await missingCsrf.json(), statusCode: missingCsrf.status },
        nonCurator: { body: await nonCurator.json(), statusCode: nonCurator.status },
        invalid: { body: await invalid.json(), statusCode: invalid.status },
        withdrawn: { body: await withdrawn.json(), statusCode: withdrawn.status },
        list: { body: acceptedOpenAnswerCheckListProjection(await list.json()), statusCode: list.status },
        detail: { body: acceptedOpenAnswerCheckProjection(await detail.json()), statusCode: detail.status },
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
                id: openAnswerCheck.entityId,
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
            acceptedFromCandidateId: openAnswerCheck.acceptedFromCandidateId,
            criterionRevisionIds: openAnswerCheck.criterionRevisionIds,
            programId,
            title: "Withdrawn open answer check",
          },
          statusCode: 200,
        },
      },
    );
  } finally {
    await close();
  }
});

async function updateOpenAnswerCheckStatus(baseUrl, session, entityId, body) {
  return fetch(`${baseUrl}/open-answer-checks/${entityId}/status`, {
    body: JSON.stringify(body),
    headers: {
      cookie: session.cookie,
      "content-type": "application/json",
      "x-agonara-csrf": session.csrfToken,
    },
    method: "PUT",
  });
}

async function rejectOpenAnswerCheckCandidate(baseUrl, session, candidateId, body) {
  return fetch(`${baseUrl}/open-answer-checks/candidates/${candidateId}/rejection`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      cookie: session.cookie,
      "content-type": "application/json",
      "x-agonara-csrf": session.csrfToken,
    },
    method: "POST",
  });
}

function openAnswerCheckCandidateProjection(body) {
  const candidate = body.value?.openAnswerCheckCandidate;
  return {
    checkKind: candidate?.checkKind,
    criterionEntityIds: candidate?.criterionEntityIds,
    programId: candidate?.programId,
    prompt: candidate?.prompt,
    status: candidate?.status,
    title: candidate?.title,
  };
}

function openAnswerCheckCandidateListProjection(body) {
  return body.value?.openAnswerCheckCandidates?.map($0 => $0.title) ?? [];
}

function acceptedOpenAnswerCheckListProjection(body) {
  return body.value?.acceptedOpenAnswerChecks?.map($0 => $0.title) ?? [];
}
