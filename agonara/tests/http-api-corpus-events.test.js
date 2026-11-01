import assert from "node:assert/strict";
import test from "node:test";
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

test("corpusEventsList_shouldRejectNonCuratorCallers", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    ids: manyIds(40),
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const outsider = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Program Outsider",
      login: "outsider@example.test",
    });
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    const response = await fetch(`${baseUrl}/programs/${programId}/corpus-events`, {
      headers: { cookie: outsider.cookie },
    });

    assert.deepEqual(
      {
        body: await response.json(),
        statusCode: response.status,
      },
      {
        body: { status: "rejected", reason: "admin_or_curator_required" },
        statusCode: 403,
      },
    );
  } finally {
    await close();
  }
});

test("corpusEventsList_shouldAcceptCuratorAndRejectUnknownOrDisabledCallers", async () => {
  const { baseUrl, close, database } = await listenWithIdentityProgramAndCorpus({
    ids: manyIds(60),
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    await createProgramSource(baseUrl, bootstrap, programId, {
      sourceKind: "textbook",
      title: "Linear Algebra Done Right",
    });
    const curator = await fetch(`${baseUrl}/programs/${programId}/corpus-events`, {
      headers: { cookie: bootstrap.cookie },
    });
    const unknownProgram = await fetch(`${baseUrl}/programs/program-ghost/corpus-events`, {
      headers: { cookie: bootstrap.cookie },
    });
    database
      .prepare("update identities set state = 'disabled', disabled_at = ? where id = ?")
      .run("2026-05-27T10:00:00.000Z", bootstrap.body.value.identity.id);
    const disabled = await fetch(`${baseUrl}/programs/${programId}/corpus-events`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        curator: corpusEventListProjection(await curator.json(), curator.status),
        disabled: { body: await disabled.json(), statusCode: disabled.status },
        unknownProgram: { body: await unknownProgram.json(), statusCode: unknownProgram.status },
      },
      {
        curator: { eventTypes: ["program_source_recorded"], statusCode: 200 },
        disabled: {
          body: { status: "rejected", reason: "identity_disabled" },
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

test("corpusEventsList_shouldReturnOnlyScopedEventsWithCorpusShape", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    ids: manyIds(80),
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const programA = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programAId = (await programA.json()).value.program.programId;
    const programB = await createProgram(baseUrl, bootstrap, { title: "Discrete Math" });
    const programBId = (await programB.json()).value.program.programId;
    await createProgramSource(baseUrl, bootstrap, programAId, {
      sourceKind: "textbook",
      title: "Linear Algebra Done Right",
    });
    await createCorpusCandidate(baseUrl, bootstrap, programAId, {
      candidateKind: "topic",
      title: "Vector spaces",
    });
    await createProgramSource(baseUrl, bootstrap, programBId, {
      sourceKind: "textbook",
      title: "Concrete Mathematics",
    });
    const response = await fetch(`${baseUrl}/programs/${programAId}/corpus-events`, {
      headers: { cookie: bootstrap.cookie },
    });
    const body = await response.json();

    assert.deepEqual(
      {
        statusCode: response.status,
        hasEventsKey: Object.hasOwn(body.value ?? {}, "events"),
        eventProgramIds: body.value?.corpusEvents?.map($0 => $0.programId),
        eventTypes: body.value?.corpusEvents?.map($0 => $0.eventType).toSorted(),
        hasCorpusEventIds: body.value?.corpusEvents?.every($0 => typeof $0.corpusEventId === "string"),
        hasProgramEventIds: body.value?.corpusEvents?.some($0 => Object.hasOwn($0, "programEventId")),
      },
      {
        statusCode: 200,
        hasEventsKey: false,
        eventProgramIds: [programAId, programAId],
        eventTypes: ["corpus_candidate_created", "program_source_recorded"],
        hasCorpusEventIds: true,
        hasProgramEventIds: false,
      },
    );
  } finally {
    await close();
  }
});

test("corpusEventsList_shouldDefaultLimitRejectInvalidQueriesAndRedactCursor", async () => {
  const corpusEvents = Array.from({ length: 51 }, (_, index) => ({
    actorIdentityId: "identity-1",
    corpusEventId: `corpus-event-${index + 1}`,
    eventType: "program_source_recorded",
    occurredAt: "2026-05-27T10:00:00.000Z",
    outcome: "accepted",
    programId: "program-1",
  }));
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    corpusCommandsOverride: {
      listCorpusEvents: () => ({
        status: "accepted",
        value: { corpusEvents },
      }),
    },
    ids: ["identity-1", "credential-1", "session-1", "audit-1", "cursor-1"],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const defaultPage = await fetch(`${baseUrl}/programs/program-1/corpus-events`, {
      headers: { cookie: bootstrap.cookie },
    });
    const defaultText = await defaultPage.text();
    const defaultBody = JSON.parse(defaultText);
    const invalidQueries = [];
    for (const query of ["limit=0", "limit=101", "limit=abc", "cursor=unknown"]) {
      const response = await fetch(`${baseUrl}/programs/program-1/corpus-events?${query}`, {
        headers: { cookie: bootstrap.cookie },
      });
      invalidQueries.push({ body: await response.json(), statusCode: response.status });
    }
    const crossProgramCursor = await fetch(
      `${baseUrl}/programs/program-2/corpus-events?cursor=${defaultBody.value.nextCursor}`,
      { headers: { cookie: bootstrap.cookie } },
    );

    assert.deepEqual(
      {
        defaultPage: {
          firstEventId: defaultBody.value?.corpusEvents?.[0]?.corpusEventId,
          hasNextCursor: typeof defaultBody.value?.nextCursor === "string",
          lastEventId: defaultBody.value?.corpusEvents?.at(-1)?.corpusEventId,
          statusCode: defaultPage.status,
          eventCount: defaultBody.value?.corpusEvents?.length ?? 0,
        },
        invalidQueries,
        crossProgramCursor: {
          body: await crossProgramCursor.json(),
          statusCode: crossProgramCursor.status,
        },
        redaction: {
          hasAuthorization: defaultText.includes("authorization"),
          hasBootstrapSecret: defaultText.includes("operator-secret"),
          hasCookie: defaultText.includes("cookie"),
          hasCsrf: defaultText.includes(bootstrap.csrfToken),
          hasDatabaseUrl: defaultText.includes("file:"),
          hasFilesystemPath: defaultText.includes("/Users/"),
          hasPassword: defaultText.includes("NON_SECRET_TEST_VALUE"),
          hasSession: defaultText.includes("session-1"),
          hasSql: defaultText.toLowerCase().includes("select "),
          hasStack: defaultText.includes("Error:"),
          nextCursorHasSecrets: [
            bootstrap.csrfToken,
            "cookie",
            "file:",
            "operator-secret",
            "/Users/",
            "select ",
            "session-1",
          ].some(secret => defaultBody.value.nextCursor?.includes(secret)),
        },
      },
      {
        defaultPage: {
          firstEventId: "corpus-event-1",
          hasNextCursor: true,
          lastEventId: "corpus-event-50",
          statusCode: 200,
          eventCount: 50,
        },
        invalidQueries: [
          { body: { status: "rejected", reason: "validation_failed" }, statusCode: 400 },
          { body: { status: "rejected", reason: "validation_failed" }, statusCode: 400 },
          { body: { status: "rejected", reason: "validation_failed" }, statusCode: 400 },
          { body: { status: "rejected", reason: "validation_failed" }, statusCode: 400 },
        ],
        crossProgramCursor: {
          body: { status: "rejected", reason: "validation_failed" },
          statusCode: 400,
        },
        redaction: {
          hasAuthorization: false,
          hasBootstrapSecret: false,
          hasCookie: false,
          hasCsrf: false,
          hasDatabaseUrl: false,
          hasFilesystemPath: false,
          hasPassword: false,
          hasSession: false,
          hasSql: false,
          hasStack: false,
          nextCursorHasSecrets: false,
        },
      },
    );
  } finally {
    await close();
  }
});

test("corpusEventsList_shouldRedactFaultResponses", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    corpusCommandsOverride: {
      listCorpusEvents: () => {
        throw new Error(
          "select session_id from sessions where cookie='agonara_session=session-1' " +
            "authorization='bearer token' csrf='csrf-secret' " +
            "secret='operator-secret' password='NON_SECRET_TEST_VALUE' " +
            "database='file:/Users/operator/agonara.db'",
        );
      },
    },
    ids: ["identity-1", "credential-1", "session-1", "audit-1"],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const response = await fetch(`${baseUrl}/programs/program-1/corpus-events`, {
      headers: { cookie: bootstrap.cookie },
    });
    const text = await response.text();

    assert.deepEqual(
      {
        statusCode: response.status,
        body: JSON.parse(text),
        redaction: {
          hasAuthorization: text.includes("authorization"),
          hasBootstrapSecret: text.includes("operator-secret"),
          hasCookie: text.includes("cookie"),
          hasCsrf: text.includes(bootstrap.csrfToken),
          hasDatabaseUrl: text.includes("file:"),
          hasFilesystemPath: text.includes("/Users/"),
          hasPassword: text.includes("NON_SECRET_TEST_VALUE"),
          hasSession: text.includes("session-1"),
          hasSql: text.toLowerCase().includes("select "),
          hasStack: text.includes("Error:"),
        },
      },
      {
        statusCode: 500,
        body: { status: "fault", reason: "internal_error" },
        redaction: {
          hasAuthorization: false,
          hasBootstrapSecret: false,
          hasCookie: false,
          hasCsrf: false,
          hasDatabaseUrl: false,
          hasFilesystemPath: false,
          hasPassword: false,
          hasSession: false,
          hasSql: false,
          hasStack: false,
        },
      },
    );
  } finally {
    await close();
  }
});

test("corpusEventsList_shouldExposeOnlyDomainReasonsAndKeepOutOfScopeRoutesUnavailable", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    ids: manyIds(100),
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    await createCorpusCandidate(baseUrl, bootstrap, programId, {
      candidateKind: "topic",
      sourceIds: ["source-missing"],
      title: "Rejected source candidate",
    });
    const candidate = await createCorpusCandidate(baseUrl, bootstrap, programId, {
      candidateKind: "topic",
      title: "Accepted topic",
    });
    const candidateId = (await candidate.json()).value.corpusCandidate.candidateId;
    await acceptCorpusCandidate(baseUrl, bootstrap, candidateId, { targetEntityId: "entity-missing" });
    await acceptCorpusCandidate(baseUrl, bootstrap, candidateId, {});
    await acceptCorpusCandidate(baseUrl, bootstrap, candidateId, {});
    const response = await fetch(`${baseUrl}/programs/${programId}/corpus-events`, {
      headers: { cookie: bootstrap.cookie },
    });
    const body = await response.json();
    const outOfScopeRoutes = [];
    for (const route of [
      "/corpus-events",
      `/programs/${programId}/corpus-events/ui`,
      `/programs/${programId}/corpus-events/ingestion`,
      `/programs/${programId}/corpus-events/llm`,
      `/programs/${programId}/corpus-events/student-workspace`,
      "/corpus-materials",
      "/corpus-cli",
      "/assessments",
    ]) {
      const outOfScopeResponse = await fetch(`${baseUrl}${route}`, {
        headers: { cookie: bootstrap.cookie },
      });
      outOfScopeRoutes.push(outOfScopeResponse.status);
    }
    const allowedDomainReasons = new Set([
      "accepted_entity_not_found",
      "candidate_already_accepted",
      "source_not_found",
    ]);
    const forbiddenTransportReasons = new Set([
      "csrf_required",
      "csrf_invalid",
      "session_not_found",
      "session_expired",
      "session_revoked",
      "identity_disabled",
      "validation_failed",
      "internal_error",
    ]);
    const eventReasons = body.value?.corpusEvents
      ?.map($0 => $0.reason)
      .filter($0 => $0 !== undefined);

    assert.deepEqual(
      {
        statusCode: response.status,
        eventReasons: eventReasons?.toSorted(),
        allReasonsAreDomainReasons: eventReasons?.every($0 => allowedDomainReasons.has($0)),
        hasForbiddenTransportReasons: eventReasons?.some($0 => forbiddenTransportReasons.has($0)),
        outOfScopeRoutes,
      },
      {
        statusCode: 200,
        eventReasons: [
          "accepted_entity_not_found",
          "candidate_already_accepted",
          "source_not_found",
        ],
        allReasonsAreDomainReasons: true,
        hasForbiddenTransportReasons: false,
        outOfScopeRoutes: [404, 404, 404, 404, 404, 404, 404, 404],
      },
    );
  } finally {
    await close();
  }
});

function corpusEventListProjection(body, statusCode) {
  return {
    statusCode,
    eventTypes: body.value?.corpusEvents?.map($0 => $0.eventType) ?? [],
    ...(body.value?.nextCursor ? { hasNextCursor: typeof body.value.nextCursor === "string" } : {}),
  };
}
