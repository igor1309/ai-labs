import assert from "node:assert/strict";
import test from "node:test";
import {
  listAcceptedCorpusEntityRecords,
  listCorpusEventRecords,
} from "../src/storage.js";
import {
  bootstrapAdmin,
  createCorpusCandidate,
  createIdentitySession,
  createProgram,
  createProgramSource,
  listenWithIdentityProgramAndCorpus,
} from "./support/http-api.js";

test("corpusCandidatesList_shouldReturnOnlyRequestedProgramCandidates_forCurator", async () => {
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
      "source-1",
      "corpus-event-1",
      "candidate-1",
      "corpus-event-2",
      "program-2",
      "membership-2",
      "program-event-2",
      "membership-event-2",
      "source-2",
      "corpus-event-3",
      "candidate-2",
      "corpus-event-4",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const programA = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programAId = (await programA.json()).value.program.programId;
    await createProgramSource(baseUrl, bootstrap, programAId, {
      sourceKind: "textbook",
      title: "Program A source",
    });
    await createCorpusCandidate(baseUrl, bootstrap, programAId, {
      candidateKind: "topic",
      sourceIds: ["source-1"],
      title: "Program A topic",
    });
    const programB = await createProgram(baseUrl, bootstrap, { title: "Discrete Math" });
    const programBId = (await programB.json()).value.program.programId;
    await createProgramSource(baseUrl, bootstrap, programBId, {
      sourceKind: "article",
      title: "Program B source",
    });
    await createCorpusCandidate(baseUrl, bootstrap, programBId, {
      candidateKind: "concept",
      sourceIds: ["source-2"],
      title: "Program B concept",
    });
    const response = await fetch(`${baseUrl}/programs/${programAId}/corpus-candidates`, {
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
            corpusCandidates: [
              {
                candidateId: "candidate-1",
                candidateKind: "topic",
                createdAt: "2026-05-27T10:00:00.000Z",
                createdByIdentityId: "identity-1",
                programId: programAId,
                sourceIds: ["source-1"],
                status: "draft",
                title: "Program A topic",
                updatedAt: "2026-05-27T10:00:00.000Z",
              },
            ],
          },
        },
      },
    );
  } finally {
    await close();
  }
});

test("corpusCandidatesList_shouldApplyStatusFiltersAndRejectCursorAcrossFilters", async () => {
  const calls = [];
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    corpusCommandsOverride: {
      listCorpusCandidates: ({ status }) => {
        calls.push(status ?? null);
        return {
          status: "accepted",
          value: {
            corpusCandidates: [
              {
                candidateId: `candidate-${status ?? "all"}-1`,
                status: status ?? "draft",
              },
              {
                candidateId: `candidate-${status ?? "all"}-2`,
                status: status ?? "draft",
              },
            ],
          },
        };
      },
    },
    ids: ["identity-1", "credential-1", "session-1", "audit-1", "cursor-1"],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const draft = await fetch(`${baseUrl}/programs/program-1/corpus-candidates?status=draft&limit=1`, {
      headers: { cookie: bootstrap.cookie },
    });
    const draftBody = await draft.json();
    const accepted = await fetch(`${baseUrl}/programs/program-1/corpus-candidates?status=accepted`, {
      headers: { cookie: bootstrap.cookie },
    });
    const rejected = await fetch(`${baseUrl}/programs/program-1/corpus-candidates?status=rejected`, {
      headers: { cookie: bootstrap.cookie },
    });
    const crossFilterCursor = await fetch(
      `${baseUrl}/programs/program-1/corpus-candidates?status=accepted&cursor=${draftBody.value.nextCursor}`,
      { headers: { cookie: bootstrap.cookie } },
    );

    assert.deepEqual(
      {
        calls,
        draft: {
          candidateIds: draftBody.value.corpusCandidates.map($0 => $0.candidateId),
          hasNextCursor: typeof draftBody.value.nextCursor === "string",
          statusCode: draft.status,
        },
        accepted: { body: await accepted.json(), statusCode: accepted.status },
        rejected: { body: await rejected.json(), statusCode: rejected.status },
        crossFilterCursor: {
          body: await crossFilterCursor.json(),
          statusCode: crossFilterCursor.status,
        },
      },
      {
        calls: ["draft", "accepted", "rejected"],
        draft: {
          candidateIds: ["candidate-draft-1"],
          hasNextCursor: true,
          statusCode: 200,
        },
        accepted: {
          body: {
            status: "accepted",
            value: {
              corpusCandidates: [
                { candidateId: "candidate-accepted-1", status: "accepted" },
                { candidateId: "candidate-accepted-2", status: "accepted" },
              ],
            },
          },
          statusCode: 200,
        },
        rejected: {
          body: {
            status: "accepted",
            value: {
              corpusCandidates: [
                { candidateId: "candidate-rejected-1", status: "rejected" },
                { candidateId: "candidate-rejected-2", status: "rejected" },
              ],
            },
          },
          statusCode: 200,
        },
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

test("corpusCandidatesList_shouldDefaultLimitToFifty", async () => {
  const corpusCandidates = Array.from({ length: 51 }, (_, index) => ({
    candidateId: `candidate-${index + 1}`,
    status: "draft",
  }));
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    corpusCommandsOverride: {
      listCorpusCandidates: () => ({
        status: "accepted",
        value: { corpusCandidates },
      }),
    },
    ids: ["identity-1", "credential-1", "session-1", "audit-1", "cursor-1"],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const response = await fetch(`${baseUrl}/programs/program-1/corpus-candidates`, {
      headers: { cookie: bootstrap.cookie },
    });
    const body = await response.json();

    assert.deepEqual(
      {
        statusCode: response.status,
        candidateCount: body.value.corpusCandidates.length,
        firstCandidateId: body.value.corpusCandidates[0].candidateId,
        lastCandidateId: body.value.corpusCandidates.at(-1).candidateId,
        hasNextCursor: typeof body.value.nextCursor === "string",
      },
      {
        statusCode: 200,
        candidateCount: 50,
        firstCandidateId: "candidate-1",
        lastCandidateId: "candidate-50",
        hasNextCursor: true,
      },
    );
  } finally {
    await close();
  }
});

test("corpusCandidatesList_shouldRejectInvalidQueriesNonCuratorsAndUnknownPrograms", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
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
    const cases = ["status=queued", "limit=0", "limit=101", "limit=abc", "cursor=unknown"];
    const invalidQueries = [];
    for (const query of cases) {
      const response = await fetch(`${baseUrl}/programs/${programId}/corpus-candidates?${query}`, {
        headers: { cookie: bootstrap.cookie },
      });
      invalidQueries.push({ body: await response.json(), statusCode: response.status });
    }
    const nonCurator = await fetch(`${baseUrl}/programs/${programId}/corpus-candidates`, {
      headers: { cookie: ordinary.cookie },
    });
    const unknownProgram = await fetch(`${baseUrl}/programs/program-ghost/corpus-candidates`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        invalidQueries,
        nonCurator: { body: await nonCurator.json(), statusCode: nonCurator.status },
        unknownProgram: { body: await unknownProgram.json(), statusCode: unknownProgram.status },
      },
      {
        invalidQueries: cases.map(() => ({
          body: { status: "rejected", reason: "validation_failed" },
          statusCode: 400,
        })),
        nonCurator: {
          body: { status: "rejected", reason: "admin_or_curator_required" },
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

test("corpusCandidatesCreate_shouldRejectCsrfBeforeDomainMutation", async () => {
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
    const missing = await fetch(`${baseUrl}/programs/${programId}/corpus-candidates`, {
      body: JSON.stringify({
        candidateKind: "topic",
        sourceIds: ["source-1"],
        title: "Program topic",
      }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
      },
      method: "POST",
    });
    const invalid = await fetch(`${baseUrl}/programs/${programId}/corpus-candidates`, {
      body: JSON.stringify({
        candidateKind: "topic",
        sourceIds: ["source-1"],
        title: "Program topic",
      }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": "wrong-token",
      },
      method: "POST",
    });

    assert.deepEqual(
      {
        missing: { body: await missing.json(), statusCode: missing.status },
        invalid: { body: await invalid.json(), statusCode: invalid.status },
        corpusEvents: listCorpusEventRecords(database, { programId }).map($0 => $0.eventType),
      },
      {
        missing: {
          body: { status: "rejected", reason: "csrf_required" },
          statusCode: 403,
        },
        invalid: {
          body: { status: "rejected", reason: "csrf_invalid" },
          statusCode: 403,
        },
        corpusEvents: ["program_source_recorded"],
      },
    );
  } finally {
    await close();
  }
});

test("corpusCandidatesCreate_shouldReturnDraftCandidateAndRecordEventWithoutAcceptedCorpus", async () => {
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
    const response = await createCorpusCandidate(baseUrl, bootstrap, programId, {
      body: " Visit vertices ",
      candidateKind: "topic",
      rationale: " From source ",
      sourceIds: ["source-1"],
      title: " Graph traversal ",
    });

    assert.deepEqual(
      {
        statusCode: response.status,
        body: await response.json(),
        acceptedCorpusEntities: listAcceptedCorpusEntityRecords(database, { programId }),
        corpusEvents: listCorpusEventRecords(database, { programId }).map($0 => ({
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
              body: "Visit vertices",
              candidateId: "candidate-1",
              candidateKind: "topic",
              createdAt: "2026-05-27T10:00:00.000Z",
              createdByIdentityId: "identity-1",
              programId,
              rationale: "From source",
              sourceIds: ["source-1"],
              status: "draft",
              title: "Graph traversal",
              updatedAt: "2026-05-27T10:00:00.000Z",
            },
          },
        },
        acceptedCorpusEntities: [],
        corpusEvents: [
          {
            eventType: "program_source_recorded",
            outcome: "accepted",
            targetId: "source-1",
          },
          {
            eventType: "corpus_candidate_created",
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

test("corpusCandidatesCreate_shouldRejectInvalidBodiesAndFields_withValidationFailed", async () => {
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
      "corpus-event-1",
      "corpus-event-2",
      "corpus-event-3",
      "corpus-event-4",
      "corpus-event-5",
      "corpus-event-6",
      "corpus-event-7",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    const invalidBodies = [
      undefined,
      "not valid json{{{",
      JSON.stringify([]),
    ];
    const invalidFields = [
      { candidateKind: "unsupported", title: "Program topic" },
      { candidateKind: "topic" },
      { candidateKind: "topic", title: "" },
      { candidateKind: "topic", title: " " },
      { candidateKind: "topic", title: 42 },
      { body: " ", candidateKind: "topic", title: "Program topic" },
      { candidateKind: "topic", rationale: " ", title: "Program topic" },
      { candidateKind: "topic", sourceIds: "source-1", title: "Program topic" },
      { candidateKind: "topic", sourceIds: [42], title: "Program topic" },
    ];
    const responses = [];
    for (const body of invalidBodies) {
      const response = await fetch(`${baseUrl}/programs/${programId}/corpus-candidates`, {
        body,
        headers: {
          cookie: bootstrap.cookie,
          "content-type": "application/json",
          "x-agonara-csrf": bootstrap.csrfToken,
        },
        method: "POST",
      });
      responses.push({ body: await response.json(), statusCode: response.status });
    }
    for (const body of invalidFields) {
      const response = await createCorpusCandidate(baseUrl, bootstrap, programId, body);
      responses.push({ body: await response.json(), statusCode: response.status });
    }

    assert.deepEqual(
      responses,
      [...invalidBodies, ...invalidFields].map(() => ({
        body: { status: "rejected", reason: "validation_failed" },
        statusCode: 400,
      })),
    );
  } finally {
    await close();
  }
});

test("corpusCandidatesCreate_shouldRejectUnknownAndCrossProgramSources", async () => {
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
      "source-1",
      "corpus-event-1",
      "program-2",
      "membership-2",
      "program-event-2",
      "membership-event-2",
      "source-2",
      "corpus-event-2",
      "candidate-1",
      "corpus-event-3",
      "candidate-2",
      "corpus-event-4",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const programA = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programAId = (await programA.json()).value.program.programId;
    await createProgramSource(baseUrl, bootstrap, programAId, {
      sourceKind: "textbook",
      title: "Program A source",
    });
    const programB = await createProgram(baseUrl, bootstrap, { title: "Discrete Math" });
    const programBId = (await programB.json()).value.program.programId;
    await createProgramSource(baseUrl, bootstrap, programBId, {
      sourceKind: "article",
      title: "Program B source",
    });
    const unknownSource = await createCorpusCandidate(baseUrl, bootstrap, programAId, {
      candidateKind: "topic",
      sourceIds: ["source-ghost"],
      title: "Program topic",
    });
    const crossProgramSource = await createCorpusCandidate(baseUrl, bootstrap, programAId, {
      candidateKind: "topic",
      sourceIds: ["source-2"],
      title: "Program topic",
    });

    assert.deepEqual(
      {
        unknownSource: { body: await unknownSource.json(), statusCode: unknownSource.status },
        crossProgramSource: {
          body: await crossProgramSource.json(),
          statusCode: crossProgramSource.status,
        },
      },
      {
        unknownSource: {
          body: { status: "rejected", reason: "source_not_found" },
          statusCode: 409,
        },
        crossProgramSource: {
          body: { status: "rejected", reason: "source_program_mismatch" },
          statusCode: 409,
        },
      },
    );
  } finally {
    await close();
  }
});
