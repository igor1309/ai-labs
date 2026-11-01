import assert from "node:assert/strict";
import test from "node:test";
import {
  acceptNavigationCandidate,
  bootstrapAdmin,
  createAcceptedNavigationCandidate,
  createIdentitySession,
  createNavigationCandidate,
  createProgram,
  createProgramSource,
  getHttpResponse,
  joinStudentProgram,
  listenWithIdentityProgramAndCorpus,
  manyIds,
  navigationNodeProjection,
  navigationSummaryProjection,
} from "./support/http-api.js";

test("navigationCandidatesHttp_shouldCreateListAcceptRejectAndPaginate_onCuratorSession", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    ids: manyIds(120),
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const program = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await program.json()).value.program.programId;
    await createProgramSource(baseUrl, bootstrap, programId, {
      sourceKind: "article",
      title: "Program source",
    });
    const first = await createNavigationCandidate(baseUrl, bootstrap, programId, {
      candidateKind: "topic",
      title: "Vector spaces",
    });
    const second = await createNavigationCandidate(baseUrl, bootstrap, programId, {
      candidateKind: "concept",
      title: "Basis",
    });
    const firstCandidateId = (await first.json()).value.navigationCandidate.candidateId;
    const secondCandidateId = (await second.json()).value.navigationCandidate.candidateId;
    const firstPage = await fetch(`${baseUrl}/programs/${programId}/navigation-candidates?status=draft&limit=1`, {
      headers: { cookie: bootstrap.cookie },
    });
    const firstPageBody = await firstPage.json();
    const secondPage = await fetch(
      `${baseUrl}/programs/${programId}/navigation-candidates?status=draft&cursor=${firstPageBody.value.nextCursor}`,
      { headers: { cookie: bootstrap.cookie } },
    );
    const acceptedResponse = await acceptNavigationCandidate(baseUrl, bootstrap, firstCandidateId, {});
    const rejectedResponse = await rejectNavigationCandidate(baseUrl, bootstrap, secondCandidateId, {});
    const acceptedList = await fetch(`${baseUrl}/programs/${programId}/navigation-candidates?status=accepted`, {
      headers: { cookie: bootstrap.cookie },
    });
    const rejectedList = await fetch(`${baseUrl}/programs/${programId}/navigation-candidates?status=rejected`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        acceptedKind: (await acceptedResponse.json()).value.navigationChange.acceptedCorpus.acceptedKind,
        acceptedListTitles: (await acceptedList.json()).value.navigationCandidates.map($0 => $0.title),
        acceptedStatusCode: acceptedResponse.status,
        createStatusCodes: [first.status, second.status],
        firstPage: navigationCandidateListProjection(firstPageBody, firstPage.status),
        rejectedListTitles: (await rejectedList.json()).value.navigationCandidates.map($0 => $0.title),
        rejectedStatus: (await rejectedResponse.json()).value.navigationCandidate.status,
        secondPage: navigationCandidateListProjection(await secondPage.json(), secondPage.status),
      },
      {
        acceptedKind: "topic",
        acceptedListTitles: ["Vector spaces"],
        acceptedStatusCode: 200,
        createStatusCodes: [200, 200],
        firstPage: {
          hasNextCursor: true,
          statusCode: 200,
          titles: ["Vector spaces"],
        },
        rejectedListTitles: ["Basis"],
        rejectedStatus: "rejected",
        secondPage: {
          statusCode: 200,
          titles: ["Basis"],
        },
      },
    );
  } finally {
    await close();
  }
});

test("navigationReadsHttp_shouldReturnStudentSafeGraphAndHistoricalRevision_onAcceptedNavigation", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    ids: manyIds(160),
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const student = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Program Student",
      login: "navigation-student@example.test",
    });
    const program = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await program.json()).value.program.programId;
    await joinStudentProgram(baseUrl, student, programId);
    const topic = await createAcceptedNavigationCandidate(baseUrl, bootstrap, programId, {
      candidateKind: "topic",
      title: "Vector spaces",
    });
    await createAcceptedNavigationCandidate(baseUrl, bootstrap, programId, {
      candidateKind: "topic",
      targetEntityId: topic.entityId,
      title: "Vector spaces current",
    });
    const concept = await createAcceptedNavigationCandidate(baseUrl, bootstrap, programId, {
      candidateKind: "concept",
      relationshipDrafts: [
        {
          relationshipKind: "topic_includes_concept",
          fromEntityId: topic.entityId,
          toCandidateRef: "self",
        },
      ],
      title: "Basis",
    });
    await createAcceptedNavigationCandidate(baseUrl, bootstrap, programId, {
      candidateKind: "material_reference",
      locator: "https://example.test/basis",
      materialReferenceKind: "article",
      relationshipDrafts: [
        {
          relationshipKind: "concept_uses_material",
          fromEntityId: concept.entityId,
          toCandidateRef: "self",
        },
      ],
      title: "Basis reading",
    });

    const navigation = await getHttpResponse(baseUrl, `/programs/${programId}/navigation`, student);
    const detail = await getHttpResponse(baseUrl, `/navigation/entities/${concept.entityId}`, student);
    const historical = await getHttpResponse(baseUrl, `/navigation/revisions/${topic.revisionId}`, student);

    assert.deepEqual(
      {
        detail: navigationNodeProjection(detail.body, detail.statusCode),
        forbiddenLeak: containsNavigationForbiddenHttpDetail([navigation.body, detail.body, historical.body]),
        historical: historical.body,
        navigation: navigationSummaryProjection(navigation.body, navigation.statusCode),
      },
      {
        detail: {
          incomingKinds: ["topic_includes_concept"],
          outgoingKinds: ["concept_uses_material"],
          statusCode: 200,
          title: "Basis",
        },
        forbiddenLeak: false,
        historical: {
          status: "accepted",
          value: {
            navigationRevision: {
              acceptedKind: "topic",
              entityId: topic.entityId,
              isCurrentRevision: false,
              programId,
              revisionId: topic.revisionId,
              title: "Vector spaces",
            },
          },
        },
        navigation: {
          statusCode: 200,
          topics: ["Vector spaces current"],
          ungroupedConcepts: [],
          ungroupedMaterials: [],
        },
      },
    );
  } finally {
    await close();
  }
});

test("navigationRelationshipStatus_shouldRequireCsrfCuratorAndLeaveActiveGraphReads", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    ids: manyIds(120),
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const ordinary = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Ordinary Identity",
      login: "ordinary-navigation-relationship-status@example.test",
    });
    const student = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Program Student",
      login: "navigation-relationship-status-student@example.test",
    });
    const program = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await program.json()).value.program.programId;
    await joinStudentProgram(baseUrl, student, programId);
    const topic = await createAcceptedNavigationCandidate(baseUrl, bootstrap, programId, {
      candidateKind: "topic",
      title: "Vector spaces",
    });
    const conceptCandidate = await createNavigationCandidate(baseUrl, bootstrap, programId, {
      candidateKind: "concept",
      relationshipDrafts: [
        {
          relationshipKind: "topic_includes_concept",
          fromEntityId: topic.entityId,
          toCandidateRef: "self",
        },
      ],
      title: "Basis",
    });
    const conceptCandidateId = (await conceptCandidate.json()).value.navigationCandidate.candidateId;
    const acceptedConcept = await acceptNavigationCandidate(baseUrl, bootstrap, conceptCandidateId, {});
    const navigationChange = (await acceptedConcept.json()).value.navigationChange;
    const concept = navigationChange.acceptedCorpus;
    const relationship = navigationChange.acceptedRelationships[0];
    const missingCsrf = await fetch(`${baseUrl}/navigation-relationships/${relationship.relationshipId}/status`, {
      body: JSON.stringify({ status: "withdrawn" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
      },
      method: "PUT",
    });
    const nonCurator = await updateNavigationRelationshipStatus(baseUrl, ordinary, relationship.relationshipId, {
      status: "withdrawn",
    });
    const invalid = await updateNavigationRelationshipStatus(baseUrl, bootstrap, relationship.relationshipId, {
      status: "retired",
    });
    const withdrawn = await updateNavigationRelationshipStatus(baseUrl, bootstrap, relationship.relationshipId, {
      status: "withdrawn",
    });
    const navigation = await getHttpResponse(baseUrl, `/programs/${programId}/navigation`, student);
    const detail = await getHttpResponse(baseUrl, `/navigation/entities/${concept.entityId}`, student);

    assert.deepEqual(
      {
        missingCsrf: { body: await missingCsrf.json(), statusCode: missingCsrf.status },
        nonCurator: { body: await nonCurator.json(), statusCode: nonCurator.status },
        invalid: { body: await invalid.json(), statusCode: invalid.status },
        withdrawn: { body: await withdrawn.json(), statusCode: withdrawn.status },
        navigation: navigationSummaryProjection(navigation.body, navigation.statusCode),
        detail: navigationNodeProjection(detail.body, detail.statusCode),
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
                id: relationship.relationshipId,
                status: "withdrawn",
                updatedByIdentityId: "id-1",
                updatedAt: "2026-05-27T10:00:00.000Z",
              },
            },
          },
          statusCode: 200,
        },
        navigation: {
          statusCode: 200,
          topics: ["Vector spaces"],
          ungroupedConcepts: ["Basis"],
          ungroupedMaterials: [],
        },
        detail: {
          incomingKinds: [],
          outgoingKinds: [],
          statusCode: 200,
          title: "Basis",
        },
      },
    );
  } finally {
    await close();
  }
});

test("navigationHttpRoutes_shouldEnforceSessionCsrfAndAllowPreviewReads", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    ids: manyIds(100),
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const student = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Program Student",
      login: "navigation-auth-student@example.test",
    });
    const outsider = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Program Outsider",
      login: "navigation-auth-outsider@example.test",
    });
    const program = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await program.json()).value.program.programId;
    await joinStudentProgram(baseUrl, student, programId);
    const acceptedTopic = await createAcceptedNavigationCandidate(baseUrl, bootstrap, programId, {
      candidateKind: "topic",
      title: "Vector spaces",
    });

    const missingSession = await fetch(`${baseUrl}/programs/${programId}/navigation-candidates`);
    const missingCsrf = await fetch(`${baseUrl}/programs/${programId}/navigation-candidates`, {
      body: JSON.stringify({ candidateKind: "topic", title: "Rejected" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
      },
      method: "POST",
    });
    const invalidCsrf = await fetch(`${baseUrl}/navigation-candidates/${acceptedTopic.acceptedFromCandidateId}/rejection`, {
      body: JSON.stringify({}),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": "wrong-token",
      },
      method: "POST",
    });
    const studentMutation = await createNavigationCandidate(baseUrl, student, programId, {
      candidateKind: "topic",
      title: "Student draft",
    });
    const malformedRelationshipDraft = await createNavigationCandidate(baseUrl, bootstrap, programId, {
      candidateKind: "relationship_update",
      relationshipDrafts: [
        {
          relationshipKind: 1,
          fromEntityId: acceptedTopic.entityId,
          toEntityId: acceptedTopic.entityId,
        },
      ],
      title: "Malformed relationship draft",
    });
    const previewRead = await fetch(`${baseUrl}/programs/${programId}/navigation`, {
      headers: { cookie: outsider.cookie },
    });
    const missingEntity = await fetch(`${baseUrl}/navigation/entities/entity-missing`, {
      headers: { cookie: student.cookie },
    });

    assert.deepEqual(
      {
        invalidCsrf: { body: await invalidCsrf.json(), statusCode: invalidCsrf.status },
        malformedRelationshipDraft: {
          body: await malformedRelationshipDraft.json(),
          statusCode: malformedRelationshipDraft.status,
        },
        missingCsrf: { body: await missingCsrf.json(), statusCode: missingCsrf.status },
        missingEntity: { body: await missingEntity.json(), statusCode: missingEntity.status },
        missingSession: { body: await missingSession.json(), statusCode: missingSession.status },
        previewRead: navigationSummaryProjection(await previewRead.json(), previewRead.status),
        studentMutation: { body: await studentMutation.json(), statusCode: studentMutation.status },
      },
      {
        invalidCsrf: { body: { status: "rejected", reason: "csrf_invalid" }, statusCode: 403 },
        malformedRelationshipDraft: { body: { status: "rejected", reason: "validation_failed" }, statusCode: 400 },
        missingCsrf: { body: { status: "rejected", reason: "csrf_required" }, statusCode: 403 },
        missingEntity: { body: { status: "rejected", reason: "navigation_entity_not_found" }, statusCode: 404 },
        missingSession: { body: { status: "rejected", reason: "session_not_found" }, statusCode: 401 },
        previewRead: { statusCode: 200, topics: ["Vector spaces"], ungroupedConcepts: [], ungroupedMaterials: [] },
        studentMutation: { body: { status: "rejected", reason: "admin_or_curator_required" }, statusCode: 403 },
      },
    );
  } finally {
    await close();
  }
});

async function updateNavigationRelationshipStatus(baseUrl, session, relationshipId, body) {
  return fetch(`${baseUrl}/navigation-relationships/${relationshipId}/status`, {
    body: JSON.stringify(body),
    headers: {
      cookie: session.cookie,
      "content-type": "application/json",
      "x-agonara-csrf": session.csrfToken,
    },
    method: "PUT",
  });
}

async function rejectNavigationCandidate(baseUrl, session, candidateId, body) {
  return fetch(`${baseUrl}/navigation-candidates/${candidateId}/rejection`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      cookie: session.cookie,
      "content-type": "application/json",
      "x-agonara-csrf": session.csrfToken,
    },
    method: "POST",
  });
}

function navigationCandidateListProjection(body, statusCode) {
  return {
    statusCode,
    titles: body.value?.navigationCandidates?.map($0 => $0.title) ?? [],
    ...(body.value?.nextCursor ? { hasNextCursor: typeof body.value.nextCursor === "string" } : {}),
  };
}

function containsNavigationForbiddenHttpDetail(values) {
  const serialized = JSON.stringify(values).toLowerCase();
  return [
    "sourceids",
    "acceptedfromcandidateid",
    "acceptedbyidentityid",
    "acceptedat",
    "rationale",
    "candidateid",
    "createdbyidentityid",
    "relationshipdrafts",
    "session",
    "csrf",
    "cookie",
    "authorization",
    "select ",
    "stack",
    "/tmp",
    "postgres://",
    "database-url",
  ].some($0 => serialized.includes($0));
}
