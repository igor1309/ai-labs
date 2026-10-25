import assert from "node:assert/strict";
import test from "node:test";
import {
  listAcceptedCorpusEntityRecords,
  listAcceptedCorpusRevisionRecords,
  listCorpusEventRecords,
} from "../src/storage.js";
import {
  acceptCorpusCandidate,
  bootstrapAdmin,
  createCorpusCandidate,
  createIdentitySession,
  createProgram,
  createProgramSource,
  listenWithIdentityProgramAndCorpus,
  rejectCorpusCandidate,
} from "./support/http-api.js";

test("corpusCandidateAcceptance_shouldCreateAcceptedCorpusAndEvent_onMissingBody", async () => {
  const { baseUrl, close, database } = await listenWithIdentityProgramAndCorpus({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
      "source-1",
      "corpus-event-1",
      "candidate-1",
      "corpus-event-2",
      "accepted-entity-1",
      "accepted-revision-1",
      "corpus-event-3",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    await createProgramSource(baseUrl, bootstrap, programId, {
      sourceKind: "textbook",
      title: "Program source",
    });
    await createCorpusCandidate(baseUrl, bootstrap, programId, {
      body: "Graph body",
      candidateKind: "topic",
      rationale: "Source rationale",
      sourceIds: ["source-1"],
      title: "Graph traversal",
    });
    const response = await acceptCorpusCandidate(baseUrl, bootstrap, "candidate-1");

    assert.deepEqual(
      {
        statusCode: response.status,
        body: await response.json(),
        candidateEvents: listCorpusEventRecords(database, { programId })
          .filter($0 => $0.eventType === "corpus_candidate_accepted")
          .map($0 => ({
            eventType: $0.eventType,
            outcome: $0.outcome,
            targetId: $0.targetId,
          })),
        entities: listAcceptedCorpusEntityRecords(database, { programId }),
        revisions: listAcceptedCorpusRevisionRecords(database).map($0 => $0.id),
      },
      {
        statusCode: 200,
        body: {
          status: "accepted",
          value: {
            acceptedCorpus: {
              acceptedAt: "2026-05-27T10:00:00.000Z",
              acceptedByIdentityId: "identity-1",
              acceptedFromCandidateId: "candidate-1",
              acceptedKind: "topic",
              body: "Graph body",
              entityId: "accepted-entity-1",
              programId,
              rationale: "Source rationale",
              revisionId: "accepted-revision-1",
              sourceIds: ["source-1"],
              title: "Graph traversal",
            },
          },
        },
        candidateEvents: [
          {
            eventType: "corpus_candidate_accepted",
            outcome: "accepted",
            targetId: "candidate-1",
          },
        ],
        entities: [
          {
            acceptedKind: "topic",
            currentRevisionId: "accepted-revision-1",
            id: "accepted-entity-1",
            programId,
          },
        ],
        revisions: ["accepted-revision-1"],
      },
    );
  } finally {
    await close();
  }
});

test("corpusCandidateAcceptance_shouldReplaceCurrentRevision_onTargetEntity", async () => {
  const { baseUrl, close, database } = await listenWithIdentityProgramAndCorpus({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
      "candidate-1",
      "corpus-event-1",
      "accepted-entity-1",
      "accepted-revision-1",
      "corpus-event-2",
      "candidate-2",
      "corpus-event-3",
      "accepted-revision-2",
      "corpus-event-4",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    await createCorpusCandidate(baseUrl, bootstrap, programId, {
      candidateKind: "topic",
      title: "First accepted",
    });
    await acceptCorpusCandidate(baseUrl, bootstrap, "candidate-1", {});
    await createCorpusCandidate(baseUrl, bootstrap, programId, {
      candidateKind: "topic",
      title: "Second accepted",
    });
    const response = await acceptCorpusCandidate(baseUrl, bootstrap, "candidate-2", {
      targetEntityId: "accepted-entity-1",
    });

    assert.deepEqual(
      {
        statusCode: response.status,
        body: await response.json(),
        entity: listAcceptedCorpusEntityRecords(database, { programId }),
        revisions: listAcceptedCorpusRevisionRecords(database).map($0 => ({
          acceptedFromCandidateId: $0.acceptedFromCandidateId,
          id: $0.id,
          title: $0.title,
        })),
      },
      {
        statusCode: 200,
        body: {
          status: "accepted",
          value: {
            acceptedCorpus: {
              acceptedAt: "2026-05-27T10:00:00.000Z",
              acceptedByIdentityId: "identity-1",
              acceptedFromCandidateId: "candidate-2",
              acceptedKind: "topic",
              entityId: "accepted-entity-1",
              programId,
              revisionId: "accepted-revision-2",
              sourceIds: [],
              title: "Second accepted",
            },
          },
        },
        entity: [
          {
            acceptedKind: "topic",
            currentRevisionId: "accepted-revision-2",
            id: "accepted-entity-1",
            programId,
          },
        ],
        revisions: [
          {
            acceptedFromCandidateId: "candidate-1",
            id: "accepted-revision-1",
            title: "First accepted",
          },
          {
            acceptedFromCandidateId: "candidate-2",
            id: "accepted-revision-2",
            title: "Second accepted",
          },
        ],
      },
    );
  } finally {
    await close();
  }
});

test("corpusCandidateAcceptance_shouldRejectCsrfAndInvalidBodies_beforeDomainMutation", async () => {
  const { baseUrl, close, database } = await listenWithIdentityProgramAndCorpus({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
      "candidate-1",
      "corpus-event-1",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    await createCorpusCandidate(baseUrl, bootstrap, programId, {
      candidateKind: "topic",
      title: "Program topic",
    });
    const missingCsrf = await fetch(`${baseUrl}/corpus-candidates/candidate-1/acceptance`, {
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
      },
      method: "POST",
    });
    const invalidBodyCases = [
      "not valid json{{{",
      JSON.stringify([]),
      JSON.stringify({ note: "ignored" }),
      JSON.stringify({ targetEntityId: 42 }),
    ];
    const invalidBodyResponses = [];
    for (const body of invalidBodyCases) {
      const response = await fetch(`${baseUrl}/corpus-candidates/candidate-1/acceptance`, {
        body,
        headers: {
          cookie: bootstrap.cookie,
          "content-type": "application/json",
          "x-agonara-csrf": bootstrap.csrfToken,
        },
        method: "POST",
      });
      invalidBodyResponses.push({ body: await response.json(), statusCode: response.status });
    }

    assert.deepEqual(
      {
        missingCsrf: { body: await missingCsrf.json(), statusCode: missingCsrf.status },
        invalidBodyResponses,
        acceptedEntities: listAcceptedCorpusEntityRecords(database, { programId }),
        acceptedEvents: listCorpusEventRecords(database, { programId })
          .filter($0 => $0.eventType === "corpus_candidate_accepted"),
      },
      {
        missingCsrf: {
          body: { status: "rejected", reason: "csrf_required" },
          statusCode: 403,
        },
        invalidBodyResponses: invalidBodyCases.map(() => ({
          body: { status: "rejected", reason: "validation_failed" },
          statusCode: 400,
        })),
        acceptedEntities: [],
        acceptedEvents: [],
      },
    );
  } finally {
    await close();
  }
});

test("corpusCandidateAcceptance_shouldMapStateTargetAndAuthorizationRejections", async () => {
  const { baseUrl, close, database } = await listenWithIdentityProgramAndCorpus({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "identity-2",
      "audit-2",
      "credential-2",
      "audit-3",
      "session-2",
      "audit-4",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
      "candidate-1",
      "corpus-event-1",
      "accepted-entity-1",
      "accepted-revision-1",
      "corpus-event-2",
      "candidate-2",
      "corpus-event-3",
      "corpus-event-4",
      "program-2",
      "membership-2",
      "program-event-2",
      "membership-event-2",
      "candidate-3",
      "corpus-event-5",
      "accepted-entity-2",
      "accepted-revision-2",
      "corpus-event-6",
      "candidate-4",
      "corpus-event-7",
      "candidate-5",
      "corpus-event-8",
      "accepted-entity-3",
      "accepted-revision-3",
      "corpus-event-9",
      "candidate-6",
      "corpus-event-10",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const ordinary = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Ordinary Identity",
      login: "ordinary@example.test",
    });
    const programA = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programAId = (await programA.json()).value.program.programId;
    const alreadyAcceptedCandidate = await createCorpusCandidate(baseUrl, bootstrap, programAId, {
      candidateKind: "topic",
      title: "Already accepted",
    });
    const alreadyAcceptedCandidateId = (await alreadyAcceptedCandidate.json()).value.corpusCandidate.candidateId;
    await acceptCorpusCandidate(baseUrl, bootstrap, alreadyAcceptedCandidateId, {});
    const alreadyRejectedCandidate = await createCorpusCandidate(baseUrl, bootstrap, programAId, {
      candidateKind: "topic",
      title: "Already rejected",
    });
    const alreadyRejectedCandidateId = (await alreadyRejectedCandidate.json()).value.corpusCandidate.candidateId;
    await rejectCorpusCandidate(baseUrl, bootstrap, alreadyRejectedCandidateId);
    const programB = await createProgram(baseUrl, bootstrap, { title: "Discrete Math" });
    const programBId = (await programB.json()).value.program.programId;
    const crossProgramCandidate = await createCorpusCandidate(baseUrl, bootstrap, programBId, {
      candidateKind: "topic",
      title: "Other program accepted",
    });
    const crossProgramCandidateId = (await crossProgramCandidate.json()).value.corpusCandidate.candidateId;
    const crossProgramAccepted = await acceptCorpusCandidate(baseUrl, bootstrap, crossProgramCandidateId, {});
    const crossProgramEntityId = (await crossProgramAccepted.json()).value.acceptedCorpus.entityId;
    const targetCandidate = await createCorpusCandidate(baseUrl, bootstrap, programAId, {
      candidateKind: "topic",
      title: "Target candidate",
    });
    const targetCandidateId = (await targetCandidate.json()).value.corpusCandidate.candidateId;
    const conceptCandidate = await createCorpusCandidate(baseUrl, bootstrap, programAId, {
      candidateKind: "concept",
      title: "Concept accepted",
    });
    const conceptCandidateId = (await conceptCandidate.json()).value.corpusCandidate.candidateId;
    const conceptAccepted = await acceptCorpusCandidate(baseUrl, bootstrap, conceptCandidateId, {});
    const conceptEntityId = (await conceptAccepted.json()).value.acceptedCorpus.entityId;
    const unauthorizedCandidate = await createCorpusCandidate(baseUrl, bootstrap, programAId, {
      candidateKind: "topic",
      title: "Unauthorized target",
    });
    const unauthorizedCandidateId = (await unauthorizedCandidate.json()).value.corpusCandidate.candidateId;
    const cases = [
      ["candidate-missing", bootstrap, {}, "candidate_not_found", 404],
      [alreadyAcceptedCandidateId, bootstrap, {}, "candidate_already_accepted", 409],
      [alreadyRejectedCandidateId, bootstrap, {}, "candidate_already_rejected", 409],
      [targetCandidateId, bootstrap, { targetEntityId: "entity-missing" }, "accepted_entity_not_found", 404],
      [targetCandidateId, bootstrap, { targetEntityId: crossProgramEntityId }, "accepted_entity_program_mismatch", 409],
      [targetCandidateId, bootstrap, { targetEntityId: conceptEntityId }, "accepted_kind_mismatch", 409],
      [unauthorizedCandidateId, ordinary, {}, "admin_or_curator_required", 403],
    ];
    const responses = [];
    for (const [candidateId, session, body, reason, statusCode] of cases) {
      const response = await acceptCorpusCandidate(baseUrl, session, candidateId, body);
      responses.push({ body: await response.json(), reason, statusCode: response.status, expectedStatus: statusCode });
    }

    assert.deepEqual(
      {
        responses,
        rejectedEvents: listCorpusEventRecords(database, { programId: programAId })
          .filter($0 => $0.eventType === "corpus_candidate_accepted" && $0.outcome === "rejected")
          .map($0 => ({
            reason: $0.reason,
            targetId: $0.targetId,
          }))
          .toSorted((left, right) => left.reason.localeCompare(right.reason)),
      },
      {
        responses: cases.map(([, , , reason, statusCode]) => ({
          body: { status: "rejected", reason },
          reason,
          statusCode,
          expectedStatus: statusCode,
        })),
        rejectedEvents: [
          {
            reason: "accepted_entity_not_found",
            targetId: targetCandidateId,
          },
          {
            reason: "accepted_entity_program_mismatch",
            targetId: targetCandidateId,
          },
          {
            reason: "accepted_kind_mismatch",
            targetId: targetCandidateId,
          },
          {
            reason: "admin_or_curator_required",
            targetId: unauthorizedCandidateId,
          },
          {
            reason: "candidate_already_accepted",
            targetId: alreadyAcceptedCandidateId,
          },
          {
            reason: "candidate_already_rejected",
            targetId: alreadyRejectedCandidateId,
          },
        ],
      },
    );
  } finally {
    await close();
  }
});

test("corpusCandidateRejection_shouldRejectDraftCandidateAndRecordEvent_onMissingBody", async () => {
  const { baseUrl, close, database } = await listenWithIdentityProgramAndCorpus({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
      "candidate-1",
      "corpus-event-1",
      "corpus-event-2",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    await createCorpusCandidate(baseUrl, bootstrap, programId, {
      candidateKind: "topic",
      title: "Rejected topic",
    });
    const response = await rejectCorpusCandidate(baseUrl, bootstrap, "candidate-1");

    assert.deepEqual(
      {
        statusCode: response.status,
        body: await response.json(),
        rejectionEvents: listCorpusEventRecords(database, { programId })
          .filter($0 => $0.eventType === "corpus_candidate_rejected")
          .map($0 => ({
            eventType: $0.eventType,
            outcome: $0.outcome,
            targetId: $0.targetId,
          })),
      },
      {
        statusCode: 200,
        body: {
          status: "accepted",
          value: {
            corpusCandidate: {
              candidateId: "candidate-1",
              candidateKind: "topic",
              createdAt: "2026-05-27T10:00:00.000Z",
              createdByIdentityId: "identity-1",
              programId,
              sourceIds: [],
              status: "rejected",
              title: "Rejected topic",
              updatedAt: "2026-05-27T10:00:00.000Z",
            },
          },
        },
        rejectionEvents: [
          {
            eventType: "corpus_candidate_rejected",
            outcome: "accepted",
            targetId: "candidate-1",
          },
        ],
      },
    );
  } finally {
    await close();
  }
});

test("corpusCandidateRejection_shouldAcceptEmptyObjectAndRejectInvalidBodies", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
      "candidate-1",
      "corpus-event-1",
      "corpus-event-2",
      "candidate-2",
      "corpus-event-3",
      "candidate-3",
      "corpus-event-4",
      "candidate-4",
      "corpus-event-5",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    await createCorpusCandidate(baseUrl, bootstrap, programId, {
      candidateKind: "topic",
      title: "Empty object rejection",
    });
    const emptyObject = await rejectCorpusCandidate(baseUrl, bootstrap, "candidate-1", {});
    const invalidBodies = [
      "not valid json{{{",
      JSON.stringify([]),
      JSON.stringify({ reason: "duplicate" }),
    ];
    const invalidBodyResponses = [];
    for (const [index, body] of invalidBodies.entries()) {
      await createCorpusCandidate(baseUrl, bootstrap, programId, {
        candidateKind: "topic",
        title: `Invalid body ${index}`,
      });
      const response = await fetch(`${baseUrl}/corpus-candidates/candidate-${index + 2}/rejection`, {
        body,
        headers: {
          cookie: bootstrap.cookie,
          "content-type": "application/json",
          "x-agonara-csrf": bootstrap.csrfToken,
        },
        method: "POST",
      });
      invalidBodyResponses.push({ body: await response.json(), statusCode: response.status });
    }

    assert.deepEqual(
      {
        emptyObjectStatusCode: emptyObject.status,
        emptyObjectStatus: (await emptyObject.json()).status,
        invalidBodyResponses,
      },
      {
        emptyObjectStatusCode: 200,
        emptyObjectStatus: "accepted",
        invalidBodyResponses: invalidBodies.map(() => ({
          body: { status: "rejected", reason: "validation_failed" },
          statusCode: 400,
        })),
      },
    );
  } finally {
    await close();
  }
});

test("corpusCandidateRejection_shouldMapStateAndAuthorizationRejections", async () => {
  const { baseUrl, close, database } = await listenWithIdentityProgramAndCorpus({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "identity-2",
      "audit-2",
      "credential-2",
      "audit-3",
      "session-2",
      "audit-4",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
      "candidate-1",
      "corpus-event-1",
      "accepted-entity-1",
      "accepted-revision-1",
      "corpus-event-2",
      "candidate-2",
      "corpus-event-3",
      "corpus-event-4",
      "candidate-3",
      "corpus-event-5",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const ordinary = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Ordinary Identity",
      login: "ordinary@example.test",
    });
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    const alreadyAcceptedCandidate = await createCorpusCandidate(baseUrl, bootstrap, programId, {
      candidateKind: "topic",
      title: "Accepted topic",
    });
    const alreadyAcceptedCandidateId = (await alreadyAcceptedCandidate.json()).value.corpusCandidate.candidateId;
    await acceptCorpusCandidate(baseUrl, bootstrap, alreadyAcceptedCandidateId, {});
    const alreadyRejectedCandidate = await createCorpusCandidate(baseUrl, bootstrap, programId, {
      candidateKind: "topic",
      title: "Rejected topic",
    });
    const alreadyRejectedCandidateId = (await alreadyRejectedCandidate.json()).value.corpusCandidate.candidateId;
    await rejectCorpusCandidate(baseUrl, bootstrap, alreadyRejectedCandidateId);
    const unauthorizedCandidate = await createCorpusCandidate(baseUrl, bootstrap, programId, {
      candidateKind: "topic",
      title: "Unauthorized topic",
    });
    const unauthorizedCandidateId = (await unauthorizedCandidate.json()).value.corpusCandidate.candidateId;
    const cases = [
      ["candidate-missing", bootstrap, "candidate_not_found", 404],
      [alreadyAcceptedCandidateId, bootstrap, "candidate_already_accepted", 409],
      [alreadyRejectedCandidateId, bootstrap, "candidate_already_rejected", 409],
      [unauthorizedCandidateId, ordinary, "admin_or_curator_required", 403],
    ];
    const responses = [];
    for (const [candidateId, session, reason, statusCode] of cases) {
      const response = await rejectCorpusCandidate(baseUrl, session, candidateId);
      responses.push({ body: await response.json(), reason, statusCode: response.status, expectedStatus: statusCode });
    }

    assert.deepEqual(
      {
        responses,
        rejectedEvents: listCorpusEventRecords(database, { programId })
          .filter($0 => $0.eventType === "corpus_candidate_rejected" && $0.outcome === "rejected")
          .map($0 => ({
            reason: $0.reason,
            targetId: $0.targetId,
          }))
          .toSorted((left, right) => left.reason.localeCompare(right.reason)),
      },
      {
        responses: cases.map(([, , reason, statusCode]) => ({
          body: { status: "rejected", reason },
          reason,
          statusCode,
          expectedStatus: statusCode,
        })),
        rejectedEvents: [
          {
            reason: "admin_or_curator_required",
            targetId: unauthorizedCandidateId,
          },
          {
            reason: "candidate_already_accepted",
            targetId: alreadyAcceptedCandidateId,
          },
          {
            reason: "candidate_already_rejected",
            targetId: alreadyRejectedCandidateId,
          },
        ],
      },
    );
  } finally {
    await close();
  }
});
