import assert from "node:assert/strict";
import test from "node:test";
import { createCorpusCommands } from "../src/corpus.js";
import { createIdentityCommands } from "../src/identity.js";
import { createProgramCommands } from "../src/program.js";
import { createServer } from "../src/server.js";
import {
  initializeIdentityStorage,
  listAcceptedCorpusEntityRecords,
  listAcceptedCorpusRevisionRecords,
  listCorpusEventRecords,
  listProgramMembershipEventRecords,
  openIdentityDatabase,
  updateProgramMembershipStatus,
} from "../src/storage.js";

test("identityBootstrap_shouldSetCookieAndHideSessionId_onAcceptedBootstrap", async () => {
  const { baseUrl, close } = await listenWithIdentity();

  try {
    const response = await fetch(`${baseUrl}/identity/bootstrap/admin`, {
      body: JSON.stringify({
        bootstrapSecret: "operator-secret",
        displayName: "Root Admin",
        login: "admin@example.test",
        password: "correct horse battery staple",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const body = await response.json();

    assert.deepEqual(
      {
        statusCode: response.status,
        hasSessionCookie: response.headers.get("set-cookie")?.includes("agonara_session="),
        hasSessionIdInBody: JSON.stringify(body).includes("session-1"),
        bodyStatus: body.status,
        identityId: body.value.identity.id,
        isAdmin: body.value.identity.isAdmin,
        hasCsrfToken: typeof body.value.csrfToken === "string",
      },
      {
        statusCode: 200,
        hasSessionCookie: true,
        hasSessionIdInBody: false,
        bodyStatus: "accepted",
        identityId: "identity-1",
        isAdmin: true,
        hasCsrfToken: true,
      },
    );
  } finally {
    await close();
  }
});

test("programsList_shouldRejectMissingSession_withSessionNotFound", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram();

  try {
    const response = await fetch(`${baseUrl}/programs`);

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

test("programsList_shouldRejectDisabledSessionIdentity_withIdentityDisabled", async () => {
  const { baseUrl, close, database } = await listenWithIdentityAndProgram();

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    database
      .prepare("update identities set state = 'disabled', disabled_at = ? where id = ?")
      .run("2026-05-27T10:00:00.000Z", bootstrap.body.value.identity.id);
    const response = await fetch(`${baseUrl}/programs`, {
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

test("programsList_shouldReturnEmptyPrograms_onActiveSessionWithEmptyStore", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram();

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const response = await fetch(`${baseUrl}/programs`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        statusCode: response.status,
        body: await response.json(),
      },
      {
        statusCode: 200,
        body: { status: "accepted", value: { programs: [] } },
      },
    );
  } finally {
    await close();
  }
});

test("corpusSourcesList_shouldRejectMissingSession_withSessionNotFound", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus();

  try {
    const response = await fetch(`${baseUrl}/programs/program-1/sources`);

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

test("corpusRoutes_shouldMapCorpusRejections_toHttpStatuses", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    corpusCommandsOverride: {
      listProgramSources: ({ programId }) => ({ status: "rejected", reason: programId }),
    },
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const cases = [
      ["participation_required", 403],
      ["candidate_not_found", 404],
      ["revision_not_found", 404],
      ["accepted_entity_not_found", 404],
      ["source_not_found", 409],
      ["source_program_mismatch", 409],
      ["candidate_already_accepted", 409],
      ["candidate_already_rejected", 409],
    ];
    const responses = [];
    for (const [reason] of cases) {
      const response = await fetch(`${baseUrl}/programs/${reason}/sources`, {
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

test("corpusSourcesList_shouldRejectInvalidListQueries_withValidationFailed", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus();

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ title: "Linear Algebra" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const cases = ["limit=0", "limit=101", "limit=abc", "cursor=unknown"];
    const responses = [];
    for (const query of cases) {
      const response = await fetch(`${baseUrl}/programs/program-1/sources?${query}`, {
        headers: { cookie: bootstrap.cookie },
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

test("corpusSourcesList_shouldRejectStaleCursor_withValidationFailed", async () => {
  let calls = 0;
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    corpusCommandsOverride: {
      listProgramSources: () => {
        calls += 1;
        return {
          status: "accepted",
          value: {
            programSources: calls === 1
              ? [{ sourceId: "source-1" }, { sourceId: "source-2" }]
              : [],
          },
        };
      },
    },
    ids: ["identity-1", "credential-1", "session-1", "audit-1", "cursor-1"],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const firstPage = await fetch(`${baseUrl}/programs/program-1/sources?limit=1`, {
      headers: { cookie: bootstrap.cookie },
    });
    const nextCursor = (await firstPage.json()).value.nextCursor;
    const staleCursor = await fetch(`${baseUrl}/programs/program-1/sources?cursor=${nextCursor}`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        statusCode: staleCursor.status,
        body: await staleCursor.json(),
      },
      {
        statusCode: 400,
        body: { status: "rejected", reason: "validation_failed" },
      },
    );
  } finally {
    await close();
  }
});

test("corpusSourcesList_shouldDefaultLimitToFifty", async () => {
  const programSources = Array.from({ length: 51 }, (_, index) => ({
    sourceId: `source-${index + 1}`,
  }));
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    corpusCommandsOverride: {
      listProgramSources: () => ({
        status: "accepted",
        value: { programSources },
      }),
    },
    ids: ["identity-1", "credential-1", "session-1", "audit-1", "cursor-1"],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const response = await fetch(`${baseUrl}/programs/program-1/sources`, {
      headers: { cookie: bootstrap.cookie },
    });
    const body = await response.json();

    assert.deepEqual(
      {
        statusCode: response.status,
        sourceCount: body.value.programSources.length,
        firstSourceId: body.value.programSources[0].sourceId,
        lastSourceId: body.value.programSources.at(-1).sourceId,
        hasNextCursor: typeof body.value.nextCursor === "string",
      },
      {
        statusCode: 200,
        sourceCount: 50,
        firstSourceId: "source-1",
        lastSourceId: "source-50",
        hasNextCursor: true,
      },
    );
  } finally {
    await close();
  }
});

test("corpusSourcesList_shouldReturnOnlyRequestedProgramSources_forCurator", async () => {
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
    const response = await fetch(`${baseUrl}/programs/${programAId}/sources`, {
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
            programSources: [
              {
                programId: programAId,
                recordedAt: "2026-05-27T10:00:00.000Z",
                recordedByIdentityId: "identity-1",
                sourceId: "source-1",
                sourceKind: "textbook",
                title: "Program A source",
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

test("corpusSourcesList_shouldRejectNonCuratorAndUnknownProgram", async () => {
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
    const nonCurator = await fetch(`${baseUrl}/programs/${programId}/sources`, {
      headers: { cookie: ordinary.cookie },
    });
    const unknownProgram = await fetch(`${baseUrl}/programs/program-ghost/sources`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        nonCurator: { body: await nonCurator.json(), statusCode: nonCurator.status },
        unknownProgram: { body: await unknownProgram.json(), statusCode: unknownProgram.status },
      },
      {
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

test("corpusSourcesCreate_shouldRejectMalformedMissingAndNonObjectBodies_withValidationFailed", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus();

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ title: "Linear Algebra" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const cases = [
      undefined,
      "not valid json{{{",
      JSON.stringify([]),
    ];
    const responses = [];
    for (const body of cases) {
      const response = await fetch(`${baseUrl}/programs/program-1/sources`, {
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

test("corpusSourcesCreate_shouldRejectCsrfBeforeDomainMutation", async () => {
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
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    const missing = await fetch(`${baseUrl}/programs/${programId}/sources`, {
      body: JSON.stringify({ sourceKind: "textbook", title: "Program source" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
      },
      method: "POST",
    });
    const invalid = await fetch(`${baseUrl}/programs/${programId}/sources`, {
      body: JSON.stringify({ sourceKind: "textbook", title: "Program source" }),
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
        corpusEvents: [],
      },
    );
  } finally {
    await close();
  }
});

test("corpusSourcesCreate_shouldReturnProgramSourceAndRecordEvent_onAccepted", async () => {
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
    const response = await createProgramSource(baseUrl, bootstrap, programId, {
      citation: " Chapter 1 ",
      locator: " https://example.test/source ",
      sourceKind: "textbook",
      title: " Program source ",
    });

    assert.deepEqual(
      {
        statusCode: response.status,
        body: await response.json(),
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
            programSource: {
              citation: "Chapter 1",
              locator: "https://example.test/source",
              programId,
              recordedAt: "2026-05-27T10:00:00.000Z",
              recordedByIdentityId: "identity-1",
              sourceId: "source-1",
              sourceKind: "textbook",
              title: "Program source",
            },
          },
        },
        corpusEvents: [
          {
            eventType: "program_source_recorded",
            outcome: "accepted",
            targetId: "source-1",
          },
        ],
      },
    );
  } finally {
    await close();
  }
});

test("corpusSourcesCreate_shouldRejectInvalidSourceFields_withValidationFailed", async () => {
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
    const cases = [
      { sourceKind: "unsupported", title: "Program source" },
      { sourceKind: "textbook" },
      { sourceKind: "textbook", title: "" },
      { sourceKind: "textbook", title: " " },
      { sourceKind: "textbook", title: 42 },
      { sourceKind: "textbook", title: "Program source", locator: " " },
      { sourceKind: "textbook", title: "Program source", citation: " " },
    ];
    const responses = [];
    for (const body of cases) {
      const response = await createProgramSource(baseUrl, bootstrap, programId, body);
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
      responses,
      cases.map(([, , , reason, statusCode]) => ({
        body: { status: "rejected", reason },
        reason,
        statusCode,
        expectedStatus: statusCode,
      })),
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
      responses,
      cases.map(([, , reason, statusCode]) => ({
        body: { status: "rejected", reason },
        reason,
        statusCode,
        expectedStatus: statusCode,
      })),
    );
  } finally {
    await close();
  }
});

test("programsCreate_shouldRejectMissingCsrf_beforeDomainMutation", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram();

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const response = await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ title: "Linear Algebra" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
      },
      method: "POST",
    });

    assert.deepEqual(
      {
        statusCode: response.status,
        body: await response.json(),
      },
      {
        statusCode: 403,
        body: { status: "rejected", reason: "csrf_required" },
      },
    );
  } finally {
    await close();
  }
});

test("programsCreate_shouldReturnProgramCreated_onAccepted", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const response = await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ description: "Foundations", title: "Linear Algebra" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
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
            initialCuratorMembership: {
              identityId: "identity-1",
              participationKind: "program_curator",
              programId: "program-1",
              status: "active",
              updatedAt: "2026-05-27T10:00:00.000Z",
            },
            program: {
              admissionPolicy: "self_join",
              createdAt: "2026-05-27T10:00:00.000Z",
              createdByIdentityId: "identity-1",
              description: "Foundations",
              programId: "program-1",
              title: "Linear Algebra",
            },
          },
        },
      },
    );
  } finally {
    await close();
  }
});

test("programsCreate_shouldRejectInvalidBodies_withValidationFailed", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram();

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const cases = [
      undefined,
      "not valid json{{{",
      JSON.stringify([]),
      JSON.stringify({ title: " " }),
      JSON.stringify({ description: 42, title: "Linear Algebra" }),
    ];
    const responses = [];
    for (const body of cases) {
      const response = await fetch(`${baseUrl}/programs`, {
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

test("programsList_shouldReturnCreatedPrograms_onActiveSession", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ description: "Foundations", title: "Linear Algebra" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const response = await fetch(`${baseUrl}/programs`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(await response.json(), {
      status: "accepted",
      value: {
        programs: [
          {
            admissionPolicy: "self_join",
            createdAt: "2026-05-27T10:00:00.000Z",
            createdByIdentityId: "identity-1",
            description: "Foundations",
            programId: "program-1",
            title: "Linear Algebra",
          },
        ],
      },
    });
  } finally {
    await close();
  }
});

test("programsGet_shouldReturnKnownProgramAndRejectUnknownProgram", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ title: "Linear Algebra" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const known = await fetch(`${baseUrl}/programs/program-1`, {
      headers: { cookie: bootstrap.cookie },
    });
    const unknown = await fetch(`${baseUrl}/programs/program-ghost`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        known: { body: await known.json(), statusCode: known.status },
        unknown: { body: await unknown.json(), statusCode: unknown.status },
      },
      {
        known: {
          body: {
            status: "accepted",
            value: {
              admissionPolicy: "self_join",
              createdAt: "2026-05-27T10:00:00.000Z",
              createdByIdentityId: "identity-1",
              programId: "program-1",
              title: "Linear Algebra",
            },
          },
          statusCode: 200,
        },
        unknown: {
          body: { status: "rejected", reason: "program_not_found" },
          statusCode: 404,
        },
      },
    );
  } finally {
    await close();
  }
});

test("programShellRoutes_shouldNotExposeSessionCsrfOrCredentialSecrets", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const create = await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ title: "Linear Algebra" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const list = await fetch(`${baseUrl}/programs`, {
      headers: { cookie: bootstrap.cookie },
    });
    const get = await fetch(`${baseUrl}/programs/program-1`, {
      headers: { cookie: bootstrap.cookie },
    });
    const responseText = JSON.stringify({
      create: await create.json(),
      get: await get.json(),
      list: await list.json(),
    });

    assert.deepEqual(
      {
        leaksCsrf: responseText.includes(bootstrap.csrfToken),
        leaksPassword: responseText.includes("correct horse battery staple"),
        leaksPasswordHash: responseText.includes("scrypt$"),
        leaksSession: responseText.includes(bootstrap.cookie.replace("agonara_session=", "")),
      },
      {
        leaksCsrf: false,
        leaksPassword: false,
        leaksPasswordHash: false,
        leaksSession: false,
      },
    );
  } finally {
    await close();
  }
});

test("programMembershipsMe_shouldReturnOnlySessionIdentityMemberships", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ title: "Linear Algebra" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const response = await fetch(`${baseUrl}/program-memberships/me`, {
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
            memberships: [
              {
                identityId: "identity-1",
                participationKind: "program_curator",
                programId: "program-1",
                status: "active",
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

test("studentMembershipCreate_shouldJoinSelfJoinProgram_onFirstJoin", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
      "student-membership-1",
      "student-event-1",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ title: "Linear Algebra" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const response = await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
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
            membership: {
              identityId: "identity-1",
              participationKind: "student",
              programId: "program-1",
              status: "active",
              updatedAt: "2026-05-27T10:00:00.000Z",
            },
          },
        },
      },
    );
  } finally {
    await close();
  }
});

test("studentMembershipDelete_shouldLeaveActiveMembership", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
      "student-membership-1",
      "student-event-1",
      "student-event-2",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ title: "Linear Algebra" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const response = await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "DELETE",
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
            membership: {
              identityId: "identity-1",
              participationKind: "student",
              programId: "program-1",
              status: "left",
              updatedAt: "2026-05-27T10:00:00.000Z",
            },
          },
        },
      },
    );
  } finally {
    await close();
  }
});

test("studentMembershipCreate_shouldBeIdempotentForActiveMembership", async () => {
  const { baseUrl, close, database } = await listenWithIdentityAndProgram({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
      "student-membership-1",
      "student-event-1",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ title: "Linear Algebra" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const first = await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const second = await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });

    assert.deepEqual(
      {
        first: await first.json(),
        second: await second.json(),
        studentEvents: listProgramMembershipEventRecords(database)
          .filter($0 => $0.participationKind === "student")
          .map($0 => $0.eventType),
      },
      {
        first: {
          status: "accepted",
          value: {
            membership: {
              identityId: "identity-1",
              participationKind: "student",
              programId: "program-1",
              status: "active",
              updatedAt: "2026-05-27T10:00:00.000Z",
            },
          },
        },
        second: {
          status: "accepted",
          value: {
            membership: {
              identityId: "identity-1",
              participationKind: "student",
              programId: "program-1",
              status: "active",
              updatedAt: "2026-05-27T10:00:00.000Z",
            },
          },
        },
        studentEvents: ["student_membership_joined"],
      },
    );
  } finally {
    await close();
  }
});

test("studentMembershipCreate_shouldReactivateLeftMembership_onRejoin", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
      "student-membership-1",
      "student-event-1",
      "student-event-2",
      "student-event-3",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ title: "Linear Algebra" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "DELETE",
    });
    const response = await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });

    assert.deepEqual(await response.json(), {
      status: "accepted",
      value: {
        membership: {
          identityId: "identity-1",
          participationKind: "student",
          programId: "program-1",
          status: "active",
          updatedAt: "2026-05-27T10:00:00.000Z",
        },
      },
    });
  } finally {
    await close();
  }
});

test("studentMembershipRoutes_shouldMapConflictsAndUnknownPrograms", async () => {
  const { baseUrl, close, database } = await listenWithIdentityAndProgram({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
      "student-membership-1",
      "student-event-1",
      "student-event-2",
      "student-event-3",
      "student-event-4",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ title: "Linear Algebra" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const missingLeave = await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "DELETE",
    });
    await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "DELETE",
    });
    const leftLeave = await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "DELETE",
    });
    updateProgramMembershipStatus(database, {
      identityId: "identity-1",
      participationKind: "student",
      programId: "program-1",
      status: "removed",
      updatedAt: "2026-05-27T10:00:00.000Z",
    });
    const removedJoin = await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const unknownJoin = await fetch(`${baseUrl}/programs/program-ghost/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const unknownLeave = await fetch(`${baseUrl}/programs/program-ghost/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "DELETE",
    });

    assert.deepEqual(
      {
        leftLeave: { body: await leftLeave.json(), statusCode: leftLeave.status },
        missingLeave: { body: await missingLeave.json(), statusCode: missingLeave.status },
        removedJoin: { body: await removedJoin.json(), statusCode: removedJoin.status },
        unknownJoin: { body: await unknownJoin.json(), statusCode: unknownJoin.status },
        unknownLeave: { body: await unknownLeave.json(), statusCode: unknownLeave.status },
      },
      {
        leftLeave: {
          body: { status: "rejected", reason: "membership_left" },
          statusCode: 409,
        },
        missingLeave: {
          body: { status: "rejected", reason: "membership_missing" },
          statusCode: 409,
        },
        removedJoin: {
          body: { status: "rejected", reason: "membership_removed" },
          statusCode: 409,
        },
        unknownJoin: {
          body: { status: "rejected", reason: "program_not_found" },
          statusCode: 404,
        },
        unknownLeave: {
          body: { status: "rejected", reason: "program_not_found" },
          statusCode: 404,
        },
      },
    );
  } finally {
    await close();
  }
});

test("effectiveParticipation_shouldCheckSessionIdentity_whenIdentityIdIsAbsent", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
      "student-membership-1",
      "student-event-1",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ title: "Linear Algebra" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const student = await fetch(`${baseUrl}/programs/program-1/participation/student`, {
      headers: { cookie: bootstrap.cookie },
    });
    const curator = await fetch(`${baseUrl}/programs/program-1/participation/program_curator`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        curator: { body: await curator.json(), statusCode: curator.status },
        student: { body: await student.json(), statusCode: student.status },
      },
      {
        curator: {
          body: {
            status: "accepted",
            value: {
              allowed: true,
              identityId: "identity-1",
              participationKind: "program_curator",
              programId: "program-1",
            },
          },
          statusCode: 200,
        },
        student: {
          body: {
            status: "accepted",
            value: {
              allowed: true,
              identityId: "identity-1",
              participationKind: "student",
              programId: "program-1",
            },
          },
          statusCode: 200,
        },
      },
    );
  } finally {
    await close();
  }
});

test("effectiveParticipation_shouldRequireAdminOrCurator_forOtherIdentity", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
      "identity-2",
      "audit-2",
      "credential-2",
      "audit-3",
      "session-2",
      "audit-4",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ title: "Linear Algebra" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const created = await fetch(`${baseUrl}/identity/identities`, {
      body: JSON.stringify({ displayName: "Second Identity" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const secondIdentityId = (await created.json()).value.id;
    await fetch(`${baseUrl}/identity/identities/${secondIdentityId}/local-password`, {
      body: JSON.stringify({
        login: "second@example.test",
        password: "correct horse battery staple",
      }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const secondLogin = await fetch(`${baseUrl}/identity/sessions`, {
      body: JSON.stringify({
        login: "second@example.test",
        password: "correct horse battery staple",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const secondCookie = secondLogin.headers.get("set-cookie").split(";", 1)[0];

    const ordinary = await fetch(
      `${baseUrl}/programs/program-1/participation/student?identityId=identity-1`,
      { headers: { cookie: secondCookie } },
    );
    const admin = await fetch(
      `${baseUrl}/programs/program-1/participation/student?identityId=${secondIdentityId}`,
      { headers: { cookie: bootstrap.cookie } },
    );
    const curator = await fetch(
      `${baseUrl}/programs/program-1/participation/student?identityId=${secondIdentityId}`,
      { headers: { cookie: bootstrap.cookie } },
    );

    assert.deepEqual(
      {
        admin: { body: await admin.json(), statusCode: admin.status },
        curator: { body: await curator.json(), statusCode: curator.status },
        ordinary: { body: await ordinary.json(), statusCode: ordinary.status },
      },
      {
        admin: {
          body: {
            status: "accepted",
            value: {
              allowed: false,
              identityId: "identity-2",
              participationKind: "student",
              programId: "program-1",
              reason: "membership_missing",
            },
          },
          statusCode: 200,
        },
        curator: {
          body: {
            status: "accepted",
            value: {
              allowed: false,
              identityId: "identity-2",
              participationKind: "student",
              programId: "program-1",
              reason: "membership_missing",
            },
          },
          statusCode: 200,
        },
        ordinary: {
          body: { status: "rejected", reason: "admin_or_curator_required" },
          statusCode: 403,
        },
      },
    );
  } finally {
    await close();
  }
});

test("effectiveParticipation_shouldAllowNonAdminCurator_forOtherIdentity", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram({
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
    const created = await fetch(`${baseUrl}/identity/identities`, {
      body: JSON.stringify({ displayName: "Second Identity" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const secondIdentityId = (await created.json()).value.id;
    await fetch(`${baseUrl}/identity/identities/${secondIdentityId}/local-password`, {
      body: JSON.stringify({
        login: "second@example.test",
        password: "correct horse battery staple",
      }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const secondLogin = await fetch(`${baseUrl}/identity/sessions`, {
      body: JSON.stringify({
        login: "second@example.test",
        password: "correct horse battery staple",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const secondLoginBody = await secondLogin.json();
    const secondCookie = secondLogin.headers.get("set-cookie").split(";", 1)[0];
    const createdProgram = await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ title: "Linear Algebra" }),
      headers: {
        cookie: secondCookie,
        "content-type": "application/json",
        "x-agonara-csrf": secondLoginBody.value.csrfToken,
      },
      method: "POST",
    });
    const programId = (await createdProgram.json()).value.program.programId;
    const adminProbe = await fetch(`${baseUrl}/identity/identities`, {
      headers: { cookie: secondCookie },
    });
    const participation = await fetch(
      `${baseUrl}/programs/${programId}/participation/student?identityId=identity-1`,
      { headers: { cookie: secondCookie } },
    );

    assert.deepEqual(
      {
        adminProbe: { body: await adminProbe.json(), statusCode: adminProbe.status },
        participation: { body: await participation.json(), statusCode: participation.status },
      },
      {
        adminProbe: {
          body: { status: "rejected", reason: "admin_required" },
          statusCode: 403,
        },
        participation: {
          body: {
            status: "accepted",
            value: {
              allowed: false,
              identityId: "identity-1",
              participationKind: "student",
              programId,
              reason: "membership_missing",
            },
          },
          statusCode: 200,
        },
      },
    );
  } finally {
    await close();
  }
});

test("effectiveParticipation_shouldHandleInvalidInputsAndRemainReadOnly", async () => {
  const { baseUrl, close, database } = await listenWithIdentityAndProgram({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ title: "Linear Algebra" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const eventCountBefore = listProgramMembershipEventRecords(database).length;
    const unknownIdentity = await fetch(
      `${baseUrl}/programs/program-1/participation/student?identityId=identity-ghost`,
      { headers: { cookie: bootstrap.cookie } },
    );
    const unsupportedKind = await fetch(`${baseUrl}/programs/program-1/participation/mentor`, {
      headers: { cookie: bootstrap.cookie },
    });
    const unknownProgram = await fetch(`${baseUrl}/programs/program-ghost/participation/student`, {
      headers: { cookie: bootstrap.cookie },
    });
    const eventCountAfter = listProgramMembershipEventRecords(database).length;

    assert.deepEqual(
      {
        eventCountAfter,
        eventCountBefore,
        unknownIdentity: {
          body: await unknownIdentity.json(),
          statusCode: unknownIdentity.status,
        },
        unknownProgram: {
          body: await unknownProgram.json(),
          statusCode: unknownProgram.status,
        },
        unsupportedKind: {
          body: await unsupportedKind.json(),
          statusCode: unsupportedKind.status,
        },
      },
      {
        eventCountAfter: eventCountBefore,
        eventCountBefore,
        unknownIdentity: {
          body: {
            status: "accepted",
            value: {
              allowed: false,
              identityId: "identity-ghost",
              participationKind: "student",
              programId: "program-1",
              reason: "identity_not_active",
            },
          },
          statusCode: 200,
        },
        unknownProgram: {
          body: { status: "rejected", reason: "program_not_found" },
          statusCode: 404,
        },
        unsupportedKind: {
          body: { status: "rejected", reason: "validation_failed" },
          statusCode: 400,
        },
      },
    );
  } finally {
    await close();
  }
});

test("programEventRoutes_shouldRejectOrdinaryCallers", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
      "identity-2",
      "audit-2",
      "credential-2",
      "audit-3",
      "session-2",
      "audit-4",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ title: "Linear Algebra" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const created = await fetch(`${baseUrl}/identity/identities`, {
      body: JSON.stringify({ displayName: "Second Identity" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const secondIdentityId = (await created.json()).value.id;
    await fetch(`${baseUrl}/identity/identities/${secondIdentityId}/local-password`, {
      body: JSON.stringify({
        login: "second@example.test",
        password: "correct horse battery staple",
      }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const secondLogin = await fetch(`${baseUrl}/identity/sessions`, {
      body: JSON.stringify({
        login: "second@example.test",
        password: "correct horse battery staple",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const secondCookie = secondLogin.headers.get("set-cookie").split(";", 1)[0];
    const programEvents = await fetch(`${baseUrl}/programs/program-1/events`, {
      headers: { cookie: secondCookie },
    });
    const membershipEvents = await fetch(`${baseUrl}/programs/program-1/membership-events`, {
      headers: { cookie: secondCookie },
    });

    assert.deepEqual(
      {
        membershipEvents: {
          body: await membershipEvents.json(),
          statusCode: membershipEvents.status,
        },
        programEvents: { body: await programEvents.json(), statusCode: programEvents.status },
      },
      {
        membershipEvents: {
          body: { status: "rejected", reason: "admin_or_curator_required" },
          statusCode: 403,
        },
        programEvents: {
          body: { status: "rejected", reason: "admin_or_curator_required" },
          statusCode: 403,
        },
      },
    );
  } finally {
    await close();
  }
});

test("programEventRoutes_shouldAcceptAdminAndNonAdminCurator_forKnownPrograms", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
      "identity-2",
      "audit-2",
      "credential-2",
      "audit-3",
      "session-2",
      "program-2",
      "membership-2",
      "program-event-2",
      "membership-event-2",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ title: "Linear Algebra" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const created = await fetch(`${baseUrl}/identity/identities`, {
      body: JSON.stringify({ displayName: "Second Identity" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const secondIdentityId = (await created.json()).value.id;
    await fetch(`${baseUrl}/identity/identities/${secondIdentityId}/local-password`, {
      body: JSON.stringify({
        login: "second@example.test",
        password: "correct horse battery staple",
      }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const secondLogin = await fetch(`${baseUrl}/identity/sessions`, {
      body: JSON.stringify({
        login: "second@example.test",
        password: "correct horse battery staple",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const secondLoginBody = await secondLogin.json();
    const secondCookie = secondLogin.headers.get("set-cookie").split(";", 1)[0];
    const secondProgram = await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ title: "Calculus" }),
      headers: {
        cookie: secondCookie,
        "content-type": "application/json",
        "x-agonara-csrf": secondLoginBody.value.csrfToken,
      },
      method: "POST",
    });
    const secondProgramId = (await secondProgram.json()).value.program.programId;
    const adminEvents = await fetch(`${baseUrl}/programs/program-1/events`, {
      headers: { cookie: bootstrap.cookie },
    });
    const curatorEvents = await fetch(`${baseUrl}/programs/${secondProgramId}/membership-events`, {
      headers: { cookie: secondCookie },
    });
    const unknownProgram = await fetch(`${baseUrl}/programs/program-ghost/events`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        adminEvents: { body: await adminEvents.json(), statusCode: adminEvents.status },
        curatorEvents: { body: await curatorEvents.json(), statusCode: curatorEvents.status },
        unknownProgram: { body: await unknownProgram.json(), statusCode: unknownProgram.status },
      },
      {
        adminEvents: {
          body: {
            status: "accepted",
            value: {
              events: [
                {
                  actorIdentityId: "identity-1",
                  eventType: "program_created",
                  occurredAt: "2026-05-27T10:00:00.000Z",
                  outcome: "accepted",
                  programEventId: "program-event-1",
                  programId: "program-1",
                },
              ],
            },
          },
          statusCode: 200,
        },
        curatorEvents: {
          body: {
            status: "accepted",
            value: {
              events: [
                {
                  actorIdentityId: "identity-2",
                  eventType: "initial_curator_membership_created",
                  occurredAt: "2026-05-27T10:00:00.000Z",
                  outcome: "accepted",
                  participationKind: "program_curator",
                  programId: secondProgramId,
                  programMembershipEventId: "membership-event-2",
                  resultingStatus: "active",
                  targetIdentityId: "identity-2",
                },
              ],
            },
          },
          statusCode: 200,
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

test("programEventRoutes_shouldPaginateScopedEvents", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
      "student-membership-1",
      "membership-event-2",
      "membership-event-3",
      "membership-event-4",
      "program-2",
      "membership-2",
      "program-event-2",
      "membership-event-5",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ title: "Linear Algebra" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "DELETE",
    });
    await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ title: "Calculus" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const firstPage = await fetch(`${baseUrl}/programs/program-1/membership-events?limit=2`, {
      headers: { cookie: bootstrap.cookie },
    });
    const firstPageBody = await firstPage.json();
    const secondPage = await fetch(
      `${baseUrl}/programs/program-1/membership-events?limit=2&cursor=${firstPageBody.value.nextCursor}`,
      { headers: { cookie: bootstrap.cookie } },
    );
    const programEvents = await fetch(`${baseUrl}/programs/program-1/events`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        firstPage: {
          eventProgramIds: firstPageBody.value.events.map($0 => $0.programId),
          eventTypes: firstPageBody.value.events.map($0 => $0.eventType),
          hasNextCursor: typeof firstPageBody.value.nextCursor === "string",
          statusCode: firstPage.status,
        },
        programEvents: { body: await programEvents.json(), statusCode: programEvents.status },
        secondPage: { body: await secondPage.json(), statusCode: secondPage.status },
      },
      {
        firstPage: {
          eventProgramIds: ["program-1", "program-1"],
          eventTypes: ["initial_curator_membership_created", "student_membership_joined"],
          hasNextCursor: true,
          statusCode: 200,
        },
        programEvents: {
          body: {
            status: "accepted",
            value: {
              events: [
                {
                  actorIdentityId: "identity-1",
                  eventType: "program_created",
                  occurredAt: "2026-05-27T10:00:00.000Z",
                  outcome: "accepted",
                  programEventId: "program-event-1",
                  programId: "program-1",
                },
              ],
            },
          },
          statusCode: 200,
        },
        secondPage: {
          body: {
            status: "accepted",
            value: {
              events: [
                {
                  actorIdentityId: "identity-1",
                  eventType: "student_membership_left",
                  occurredAt: "2026-05-27T10:00:00.000Z",
                  outcome: "accepted",
                  participationKind: "student",
                  programId: "program-1",
                  programMembershipEventId: "membership-event-3",
                  resultingStatus: "left",
                  targetIdentityId: "identity-1",
                },
                {
                  actorIdentityId: "identity-1",
                  eventType: "student_membership_rejoined",
                  occurredAt: "2026-05-27T10:00:00.000Z",
                  outcome: "accepted",
                  participationKind: "student",
                  programId: "program-1",
                  programMembershipEventId: "membership-event-4",
                  resultingStatus: "active",
                  targetIdentityId: "identity-1",
                },
              ],
            },
          },
          statusCode: 200,
        },
      },
    );
  } finally {
    await close();
  }
});

test("programEventRoutes_shouldRejectInvalidQueriesAndRedactResponses", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
      "student-membership-1",
      "membership-event-2",
      "membership-event-3",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ title: "Linear Algebra" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const validResponse = await fetch(`${baseUrl}/programs/program-1/membership-events?limit=1`, {
      headers: { cookie: bootstrap.cookie },
    });
    const validText = await validResponse.text();
    const validBody = JSON.parse(validText);
    const invalidRequests = [];
    for (const query of ["limit=0", "limit=101", "limit=two", "cursor=not-a-cursor"]) {
      const response = await fetch(`${baseUrl}/programs/program-1/membership-events?${query}`, {
        headers: { cookie: bootstrap.cookie },
      });
      invalidRequests.push({ body: await response.json(), statusCode: response.status });
    }
    const unscopedProgramEvents = await fetch(`${baseUrl}/program-events`, {
      headers: { cookie: bootstrap.cookie },
    });
    const unscopedMembershipEvents = await fetch(`${baseUrl}/program-membership-events`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        invalidRequests,
        redaction: {
          hasAuthorization: validText.includes("authorization"),
          hasBootstrapSecret: validText.includes("operator-secret"),
          hasCookie: validText.includes("cookie"),
          hasCsrf: validText.includes(bootstrap.csrfToken),
          hasPassword: validText.includes("correct horse battery staple"),
          hasSession: validText.includes("session-1"),
          hasSql: validText.toLowerCase().includes("select "),
          hasStack: validText.includes("Error:"),
          nextCursorHasSecrets: [
            bootstrap.csrfToken,
            "cookie",
            "operator-secret",
            "select ",
            "session-1",
          ].some(secret => validBody.value.nextCursor?.includes(secret)),
        },
        unscopedMembershipEvents: unscopedMembershipEvents.status,
        unscopedProgramEvents: unscopedProgramEvents.status,
        validStatusCode: validResponse.status,
      },
      {
        invalidRequests: [
          { body: { status: "rejected", reason: "validation_failed" }, statusCode: 400 },
          { body: { status: "rejected", reason: "validation_failed" }, statusCode: 400 },
          { body: { status: "rejected", reason: "validation_failed" }, statusCode: 400 },
          { body: { status: "rejected", reason: "validation_failed" }, statusCode: 400 },
        ],
        redaction: {
          hasAuthorization: false,
          hasBootstrapSecret: false,
          hasCookie: false,
          hasCsrf: false,
          hasPassword: false,
          hasSession: false,
          hasSql: false,
          hasStack: false,
          nextCursorHasSecrets: false,
        },
        unscopedMembershipEvents: 404,
        unscopedProgramEvents: 404,
        validStatusCode: 200,
      },
    );
  } finally {
    await close();
  }
});

test("adminBoard_shouldServeShell_withoutSensitiveRuntimeValues", async () => {
  const { baseUrl, close } = await listenWithIdentity();

  try {
    const response = await fetch(`${baseUrl}/admin`);
    const body = await response.text();

    assert.deepEqual(
      {
        statusCode: response.status,
        contentType: response.headers.get("content-type"),
        hasAppRoot: body.includes('id="admin-app"'),
        hasBootstrapSecret: body.includes("operator-secret"),
        hasSessionCookieName: body.includes("agonara_session"),
      },
      {
        statusCode: 200,
        contentType: "text/html; charset=utf-8",
        hasAppRoot: true,
        hasBootstrapSecret: false,
        hasSessionCookieName: false,
      },
    );
  } finally {
    await close();
  }
});

test("adminBoard_shouldExposeSessionControls_withoutSensitiveRuntimeValues", async () => {
  const { baseUrl, close } = await listenWithIdentity();

  try {
    const response = await fetch(`${baseUrl}/admin`);
    const body = await response.text();

    assert.deepEqual(
      {
        hasBootstrapForm: body.includes('id="bootstrap-form"'),
        hasLoginForm: body.includes('id="login-form"'),
        hasSessionPanel: body.includes('id="session-panel"'),
        hasLogoutButton: body.includes('id="logout-button"'),
        hasPasswordValue: body.includes("correct horse battery staple"),
        hasBootstrapSecret: body.includes("operator-secret"),
        hasSessionCookieName: body.includes("agonara_session"),
      },
      {
        hasBootstrapForm: true,
        hasLoginForm: true,
        hasSessionPanel: true,
        hasLogoutButton: true,
        hasPasswordValue: false,
        hasBootstrapSecret: false,
        hasSessionCookieName: false,
      },
    );
  } finally {
    await close();
  }
});

test("adminBoard_shouldExposeIdentityOperationControls_withoutSensitiveRuntimeValues", async () => {
  const { baseUrl, close } = await listenWithIdentity();

  try {
    const response = await fetch(`${baseUrl}/admin`);
    const body = await response.text();

    assert.deepEqual(
      {
        hasIdentityList: body.includes('id="identity-list"'),
        hasCreateIdentityForm: body.includes('id="create-identity-form"'),
        hasCredentialForm: body.includes('id="credential-form"'),
        hasAccessPanel: body.includes('id="operational-access-panel"'),
        hasDisableAction: body.includes('data-action="disable"'),
        hasGrantAdminAction: body.includes('data-action="grant-admin"'),
        hasRevokeAdminAction: body.includes('data-action="revoke-admin"'),
        hasPasswordValue: body.includes("correct horse battery staple"),
        hasBootstrapSecret: body.includes("operator-secret"),
        hasSessionCookieName: body.includes("agonara_session"),
      },
      {
        hasIdentityList: true,
        hasCreateIdentityForm: true,
        hasCredentialForm: true,
        hasAccessPanel: true,
        hasDisableAction: true,
        hasGrantAdminAction: true,
        hasRevokeAdminAction: true,
        hasPasswordValue: false,
        hasBootstrapSecret: false,
        hasSessionCookieName: false,
      },
    );
  } finally {
    await close();
  }
});

test("adminBoard_shouldExposeAuditEventInspection_withoutSensitiveRuntimeValues", async () => {
  const { baseUrl, close } = await listenWithIdentity();

  try {
    const response = await fetch(`${baseUrl}/admin`);
    const body = await response.text();

    assert.deepEqual(
      {
        hasAuditPanel: body.includes('id="audit-events-panel"'),
        hasAuditList: body.includes('id="audit-event-list"'),
        hasRefreshAuditButton: body.includes('id="refresh-audit-events-button"'),
        hasTargetSessionHeader: body.includes("targetSessionId"),
        hasPasswordValue: body.includes("correct horse battery staple"),
        hasBootstrapSecret: body.includes("operator-secret"),
        hasSessionCookieName: body.includes("agonara_session"),
      },
      {
        hasAuditPanel: true,
        hasAuditList: true,
        hasRefreshAuditButton: true,
        hasTargetSessionHeader: false,
        hasPasswordValue: false,
        hasBootstrapSecret: false,
        hasSessionCookieName: false,
      },
    );
  } finally {
    await close();
  }
});

test("identityBootstrapStatus_shouldReflectAvailability_beforeAndAfterBootstrap", async () => {
  const { baseUrl, close } = await listenWithIdentity();

  try {
    const before = await fetch(`${baseUrl}/identity/bootstrap/status`);
    await bootstrapAdmin(baseUrl);
    const after = await fetch(`${baseUrl}/identity/bootstrap/status`);

    assert.deepEqual(
      {
        before: await before.json(),
        after: await after.json(),
      },
      {
        before: { status: "accepted", value: { available: true } },
        after: { status: "accepted", value: { available: false } },
      },
    );
  } finally {
    await close();
  }
});

test("identityBootstrap_shouldSetSecureCookie_onForwardedHttps", async () => {
  const { baseUrl, close } = await listenWithIdentity();

  try {
    const response = await fetch(`${baseUrl}/identity/bootstrap/admin`, {
      body: JSON.stringify({
        bootstrapSecret: "operator-secret",
        displayName: "Root Admin",
        login: "admin@example.test",
        password: "correct horse battery staple",
      }),
      headers: {
        "content-type": "application/json",
        "x-forwarded-proto": "https",
      },
      method: "POST",
    });

    assert.equal(response.headers.get("set-cookie")?.includes("Secure"), true);
  } finally {
    await close();
  }
});

test("identitySessions_shouldSetCookieAndHideSessionId_onAcceptedLogin", async () => {
  const { baseUrl, close } = await listenWithIdentity();

  try {
    await bootstrapAdmin(baseUrl);
    const response = await fetch(`${baseUrl}/identity/sessions`, {
      body: JSON.stringify({
        login: "admin@example.test",
        password: "correct horse battery staple",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const body = await response.json();

    assert.deepEqual(
      {
        statusCode: response.status,
        hasSessionCookie: response.headers.get("set-cookie")?.includes("agonara_session="),
        hasSessionIdInBody: JSON.stringify(body).includes("session-2"),
        bodyStatus: body.status,
        isAdmin: body.value.identity.isAdmin,
        hasCsrfToken: typeof body.value.csrfToken === "string",
      },
      {
        statusCode: 200,
        hasSessionCookie: true,
        hasSessionIdInBody: false,
        bodyStatus: "accepted",
        isAdmin: true,
        hasCsrfToken: true,
      },
    );
  } finally {
    await close();
  }
});

test("identitySessionDelete_shouldRequireCsrf_onActiveSession", async () => {
  const { baseUrl, close } = await listenWithIdentity();

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const response = await fetch(`${baseUrl}/identity/session`, {
      headers: { cookie: bootstrap.cookie },
      method: "DELETE",
    });

    assert.deepEqual(await response.json(), {
      status: "rejected",
      reason: "csrf_required",
    });
  } finally {
    await close();
  }
});

test("identitySessionDelete_shouldRevokeSession_onMatchingCsrf", async () => {
  const { baseUrl, close } = await listenWithIdentity();

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const logout = await fetch(`${baseUrl}/identity/session`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "DELETE",
    });
    const session = await fetch(`${baseUrl}/identity/session`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        logout: await logout.json(),
        session: await session.json(),
      },
      {
        logout: { status: "accepted", value: { loggedOut: true } },
        session: { status: "rejected", reason: "session_revoked" },
      },
    );
  } finally {
    await close();
  }
});

test("identitySessions_shouldRateLimit_onRepeatedInvalidCredentials", async () => {
  const { baseUrl, close } = await listenWithIdentity();

  try {
    await bootstrapAdmin(baseUrl);
    let response;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      response = await fetch(`${baseUrl}/identity/sessions`, {
        body: JSON.stringify({
          login: "admin@example.test",
          password: "wrong horse battery staple",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
    }

    assert.deepEqual(
      {
        statusCode: response.status,
        body: await response.json(),
      },
      {
        statusCode: 429,
        body: { status: "rejected", reason: "rate_limited" },
      },
    );
  } finally {
    await close();
  }
});

test("identityAdminEndpoints_shouldCreateIdentityAndListAudit_onAdminSession", async () => {
  const { baseUrl, close } = await listenWithIdentity({
    ids: ["identity-1", "credential-1", "session-1", "audit-1", "identity-2", "audit-2"],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const created = await fetch(`${baseUrl}/identity/identities`, {
      body: JSON.stringify({ displayName: "Second Identity" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const audit = await fetch(`${baseUrl}/identity/audit-events`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        created: await created.json(),
        auditBody: await audit.json(),
      },
      {
        created: {
          status: "accepted",
          value: {
            id: "identity-2",
            displayName: "Second Identity",
            state: "active",
            isAdmin: false,
          },
        },
        auditBody: {
          status: "accepted",
          value: {
            auditEvents: [
              {
                id: "audit-1",
                eventType: "bootstrap_first_admin",
                actorIdentityId: null,
                targetIdentityId: "identity-1",
                targetCredentialId: null,
                occurredAt: "2026-05-27T10:00:00.000Z",
                outcome: "accepted",
                reason: null,
              },
              {
                id: "audit-2",
                eventType: "identity_created",
                actorIdentityId: "identity-1",
                targetIdentityId: "identity-2",
                targetCredentialId: null,
                occurredAt: "2026-05-27T10:00:00.000Z",
                outcome: "accepted",
                reason: null,
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

test("operationsDiagnostics_shouldAcceptAdminSession_onActiveAdmin", async () => {
  const { baseUrl, close } = await listenWithIdentity();

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const response = await fetch(`${baseUrl}/operations/diagnostics`, {
      headers: { cookie: bootstrap.cookie },
    });
    const body = await response.json();

    assert.deepEqual(
      {
        statusCode: response.status,
        bodyStatus: body.status,
        component: body.value.components[0].component,
      },
      {
        statusCode: 200,
        bodyStatus: "accepted",
        component: "identity",
      },
    );
  } finally {
    await close();
  }
});

async function bootstrapAdmin(baseUrl) {
  const response = await fetch(`${baseUrl}/identity/bootstrap/admin`, {
    body: JSON.stringify({
      bootstrapSecret: "operator-secret",
      displayName: "Root Admin",
      login: "admin@example.test",
      password: "correct horse battery staple",
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const body = await response.json();
  return {
    body,
    cookie: response.headers.get("set-cookie").split(";", 1)[0],
    csrfToken: body.value.csrfToken,
  };
}

async function createIdentitySession(baseUrl, bootstrap, { displayName, login }) {
  const created = await fetch(`${baseUrl}/identity/identities`, {
    body: JSON.stringify({ displayName }),
    headers: {
      cookie: bootstrap.cookie,
      "content-type": "application/json",
      "x-agonara-csrf": bootstrap.csrfToken,
    },
    method: "POST",
  });
  const identityId = (await created.json()).value.id;
  await fetch(`${baseUrl}/identity/identities/${identityId}/local-password`, {
    body: JSON.stringify({
      login,
      password: "correct horse battery staple",
    }),
    headers: {
      cookie: bootstrap.cookie,
      "content-type": "application/json",
      "x-agonara-csrf": bootstrap.csrfToken,
    },
    method: "POST",
  });
  const loginResponse = await fetch(`${baseUrl}/identity/sessions`, {
    body: JSON.stringify({
      login,
      password: "correct horse battery staple",
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const body = await loginResponse.json();
  return {
    body,
    cookie: loginResponse.headers.get("set-cookie").split(";", 1)[0],
    csrfToken: body.value.csrfToken,
    identityId,
  };
}

async function createProgram(baseUrl, session, body) {
  return fetch(`${baseUrl}/programs`, {
    body: JSON.stringify(body),
    headers: {
      cookie: session.cookie,
      "content-type": "application/json",
      "x-agonara-csrf": session.csrfToken,
    },
    method: "POST",
  });
}

async function createProgramSource(baseUrl, session, programId, body) {
  return fetch(`${baseUrl}/programs/${programId}/sources`, {
    body: JSON.stringify(body),
    headers: {
      cookie: session.cookie,
      "content-type": "application/json",
      "x-agonara-csrf": session.csrfToken,
    },
    method: "POST",
  });
}

async function createCorpusCandidate(baseUrl, session, programId, body) {
  return fetch(`${baseUrl}/programs/${programId}/corpus-candidates`, {
    body: JSON.stringify(body),
    headers: {
      cookie: session.cookie,
      "content-type": "application/json",
      "x-agonara-csrf": session.csrfToken,
    },
    method: "POST",
  });
}

async function acceptCorpusCandidate(baseUrl, session, candidateId, body) {
  return fetch(`${baseUrl}/corpus-candidates/${candidateId}/acceptance`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      cookie: session.cookie,
      "content-type": "application/json",
      "x-agonara-csrf": session.csrfToken,
    },
    method: "POST",
  });
}

async function rejectCorpusCandidate(baseUrl, session, candidateId, body) {
  return fetch(`${baseUrl}/corpus-candidates/${candidateId}/rejection`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      cookie: session.cookie,
      "content-type": "application/json",
      "x-agonara-csrf": session.csrfToken,
    },
    method: "POST",
  });
}

async function listenWithIdentity({ ids = defaultIds() } = {}) {
  const database = openIdentityDatabase();
  initializeIdentityStorage(database);
  const server = createServer({
    identityCommands: createIdentityCommands({
      bootstrapSecret: "operator-secret",
      database,
      generateId: makeIdGenerator(ids),
      now: () => new Date("2026-05-27T10:00:00.000Z"),
    }),
    log: () => {},
  });
  const baseUrl = await listen(server);
  return {
    baseUrl,
    close: async () => {
      await close(server);
      database.close();
    },
  };
}

async function listenWithIdentityAndProgram({ ids = defaultIds() } = {}) {
  const database = openIdentityDatabase();
  initializeIdentityStorage(database);
  const now = () => new Date("2026-05-27T10:00:00.000Z");
  const generateId = makeIdGenerator(ids);
  const server = createServer({
    identityCommands: createIdentityCommands({
      bootstrapSecret: "operator-secret",
      database,
      generateId,
      now,
    }),
    programCommands: createProgramCommands({
      database,
      generateId,
      now,
    }),
    log: () => {},
  });
  const baseUrl = await listen(server);
  return {
    baseUrl,
    close: async () => {
      await close(server);
      database.close();
    },
    database,
  };
}

async function listenWithIdentityProgramAndCorpus({
  corpusCommandsOverride = null,
  ids = defaultIds(),
} = {}) {
  const database = openIdentityDatabase();
  initializeIdentityStorage(database);
  const now = () => new Date("2026-05-27T10:00:00.000Z");
  const generateId = makeIdGenerator(ids);
  const programCommands = createProgramCommands({
    database,
    generateId,
    now,
  });
  const server = createServer({
    identityCommands: createIdentityCommands({
      bootstrapSecret: "operator-secret",
      database,
      generateId,
      now,
    }),
    programCommands,
    corpusCommands: corpusCommandsOverride ?? createCorpusCommands({
      database,
      generateId,
      getEffectiveParticipation: programCommands.getEffectiveParticipation,
      now,
    }),
    log: () => {},
  });
  const baseUrl = await listen(server);
  return {
    baseUrl,
    close: async () => {
      await close(server);
      database.close();
    },
    database,
  };
}

function defaultIds() {
  return [
    "identity-1",
    "credential-1",
    "session-1",
    "audit-1",
    "session-2",
    "audit-2",
    "identity-2",
    "credential-2",
  ];
}

function makeIdGenerator(ids) {
  const nextIds = [...ids];
  return () => nextIds.shift();
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close(error => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
