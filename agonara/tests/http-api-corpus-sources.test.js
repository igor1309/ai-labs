import assert from "node:assert/strict";
import test from "node:test";
import { listCorpusEventRecords } from "../src/storage.js";
import {
  acceptCorpusCandidate,
  bootstrapAdmin,
  createCorpusCandidate,
  createIdentitySession,
  createProgram,
  createProgramSource,
  listenWithIdentityProgramAndCorpus,
  manyIds,
} from "./support/http-api.js";

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

test("corpusSourceStatus_shouldRequireCsrfCuratorAndHideWithdrawnSources", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({ ids: manyIds(40) });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const ordinary = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Ordinary Identity",
      login: "ordinary-source-status@example.test",
    });
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    const createdSource = await createProgramSource(baseUrl, bootstrap, programId, {
      sourceKind: "textbook",
      title: "Program source",
    });
    const sourceId = (await createdSource.json()).value.programSource.sourceId;
    const missingCsrf = await fetch(`${baseUrl}/sources/${sourceId}/status`, {
      body: JSON.stringify({ status: "withdrawn" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
      },
      method: "PUT",
    });
    const nonCurator = await updateProgramSourceStatus(baseUrl, ordinary, sourceId, {
      status: "withdrawn",
    });
    const invalid = await updateProgramSourceStatus(baseUrl, bootstrap, sourceId, {
      status: "retired",
    });
    const withdrawn = await updateProgramSourceStatus(baseUrl, bootstrap, sourceId, {
      status: "withdrawn",
    });
    const listed = await fetch(`${baseUrl}/programs/${programId}/sources`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        missingCsrf: { body: await missingCsrf.json(), statusCode: missingCsrf.status },
        nonCurator: { body: await nonCurator.json(), statusCode: nonCurator.status },
        invalid: { body: await invalid.json(), statusCode: invalid.status },
        withdrawn: { body: await withdrawn.json(), statusCode: withdrawn.status },
        listed: { body: await listed.json(), statusCode: listed.status },
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
              source: {
                id: sourceId,
                status: "withdrawn",
                updatedByIdentityId: "id-1",
                updatedAt: "2026-05-27T10:00:00.000Z",
              },
            },
          },
          statusCode: 200,
        },
        listed: {
          body: {
            status: "accepted",
            value: {
              programSources: [],
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

test("corpusSourceDelete_shouldHardDeleteUnreferencedAndRejectReferencedSource", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({ ids: manyIds(80) });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    const unreferencedSource = await createProgramSource(baseUrl, bootstrap, programId, {
      sourceKind: "article",
      title: "Unreferenced source",
    });
    const unreferencedSourceId = (await unreferencedSource.json()).value.programSource.sourceId;
    const referencedSource = await createProgramSource(baseUrl, bootstrap, programId, {
      sourceKind: "article",
      title: "Referenced source",
    });
    const referencedSourceId = (await referencedSource.json()).value.programSource.sourceId;
    const candidate = await createCorpusCandidate(baseUrl, bootstrap, programId, {
      body: "Referenced body",
      candidateKind: "topic",
      sourceIds: [referencedSourceId],
      title: "Referenced topic",
    });
    const candidateId = (await candidate.json()).value.corpusCandidate.candidateId;
    await acceptCorpusCandidate(baseUrl, bootstrap, candidateId, {});

    const deleted = await deleteProgramSource(baseUrl, bootstrap, unreferencedSourceId);
    const blocked = await deleteProgramSource(baseUrl, bootstrap, referencedSourceId);

    assert.deepEqual(
      {
        deleted: { body: await deleted.json(), statusCode: deleted.status },
        blocked: { body: await blocked.json(), statusCode: blocked.status },
      },
      {
        deleted: {
          body: {
            status: "accepted",
            value: {
              source: {
                id: unreferencedSourceId,
              },
            },
          },
          statusCode: 200,
        },
        blocked: {
          body: { status: "rejected", reason: "source_hard_delete_blocked" },
          statusCode: 409,
        },
      },
    );
  } finally {
    await close();
  }
});

async function updateProgramSourceStatus(baseUrl, session, sourceId, body) {
  return fetch(`${baseUrl}/sources/${sourceId}/status`, {
    body: JSON.stringify(body),
    headers: {
      cookie: session.cookie,
      "content-type": "application/json",
      "x-agonara-csrf": session.csrfToken,
    },
    method: "PUT",
  });
}

async function deleteProgramSource(baseUrl, session, sourceId) {
  return fetch(`${baseUrl}/sources/${sourceId}`, {
    headers: {
      cookie: session.cookie,
      "x-agonara-csrf": session.csrfToken,
    },
    method: "DELETE",
  });
}
