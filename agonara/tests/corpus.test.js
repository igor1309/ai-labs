import assert from "node:assert/strict";
import test from "node:test";
import { createProgramCommands } from "../src/program.js";
import {
  createIdentity,
  createProgramMembershipRecord,
  createProgramShellRecord,
  initializeIdentityStorage,
  listCorpusEventRecords,
  listProgramSourceRecords,
  openIdentityDatabase,
} from "../src/storage.js";

test("recordProgramSource_shouldRejectUnknownAndDisabledIdentities", async () => {
  const { commands, database } = await makeSUT();

  try {
    createIdentity(database, makeIdentity({ id: "identity-disabled", state: "disabled" }));
    createProgramShellRecord(database, makeProgramShell({ id: "program-a" }));

    assert.deepEqual(
      {
        unknown: commands?.recordProgramSource({
          actingIdentityId: "identity-unknown",
          programId: "program-a",
          sourceKind: "article",
          title: "Source",
        }),
        disabled: commands?.recordProgramSource({
          actingIdentityId: "identity-disabled",
          programId: "program-a",
          sourceKind: "article",
          title: "Source",
        }),
      },
      {
        unknown: { status: "rejected", reason: "identity_not_found" },
        disabled: { status: "rejected", reason: "identity_disabled" },
      },
    );
  } finally {
    database.close();
  }
});

test("recordProgramSource_shouldRejectUnknownProgram", async () => {
  const { commands, database } = await makeSUT();

  try {
    assert.deepEqual(
      commands.recordProgramSource({
        actingIdentityId: "identity-curator",
        programId: "program-unknown",
        sourceKind: "article",
        title: "Source",
      }),
      { status: "rejected", reason: "program_not_found" },
    );
  } finally {
    database.close();
  }
});

test("recordProgramSource_shouldRejectInvalidSourceInput", async () => {
  const { commands, database } = await makeSUT();

  try {
    seedCuratorProgram(database, { programId: "program-a" });

    assert.deepEqual(
      {
        sourceKind: captureResult(() =>
          commands.recordProgramSource({
            actingIdentityId: "identity-curator",
            programId: "program-a",
            sourceKind: "unsupported",
            title: "Source",
          }),
        ),
        title: captureResult(() =>
          commands.recordProgramSource({
            actingIdentityId: "identity-curator",
            programId: "program-a",
            sourceKind: "article",
            title: " ",
          }),
        ),
        locator: captureResult(() =>
          commands.recordProgramSource({
            actingIdentityId: "identity-curator",
            programId: "program-a",
            sourceKind: "article",
            title: "Source",
            locator: " ",
          }),
        ),
        citation: captureResult(() =>
          commands.recordProgramSource({
            actingIdentityId: "identity-curator",
            programId: "program-a",
            sourceKind: "article",
            title: "Source",
            citation: " ",
          }),
        ),
      },
      {
        sourceKind: { status: "rejected", reason: "validation_failed" },
        title: { status: "rejected", reason: "validation_failed" },
        locator: { status: "rejected", reason: "validation_failed" },
        citation: { status: "rejected", reason: "validation_failed" },
      },
    );
  } finally {
    database.close();
  }
});

test("recordProgramSource_shouldRejectNonCurator", async () => {
  const { commands, database } = await makeSUT();

  try {
    createProgramShellRecord(database, makeProgramShell({ id: "program-a" }));

    assert.deepEqual(
      commands.recordProgramSource({
        actingIdentityId: "identity-curator",
        programId: "program-a",
        sourceKind: "article",
        title: "Source",
      }),
      { status: "rejected", reason: "admin_or_curator_required" },
    );
  } finally {
    database.close();
  }
});

test("recordProgramSource_shouldCreateProgramScopedSourceAndEvents_onAcceptedAndRejected", async () => {
  const { commands, database } = await makeSUT();

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    commands.recordProgramSource({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      sourceKind: "article",
      title: " Program source ",
      locator: " https://example.test/source ",
      citation: " Citation ",
    });
    commands.recordProgramSource({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      sourceKind: "unsupported",
      title: "Rejected source",
    });

    assert.deepEqual(
      {
        sources: listProgramSourceRecords(database, { programId: "program-a" }).map($0 => ({
          id: $0.id,
          programId: $0.programId,
          sourceKind: $0.sourceKind,
          title: $0.title,
          locator: $0.locator,
          citation: $0.citation,
          recordedByIdentityId: $0.recordedByIdentityId,
        })),
        events: listCorpusEventRecords(database, { programId: "program-a" }).map($0 => ({
          eventType: $0.eventType,
          actorIdentityId: $0.actorIdentityId,
          programId: $0.programId,
          targetId: $0.targetId,
          outcome: $0.outcome,
          reason: $0.reason,
        })),
      },
      {
        sources: [
          {
            id: "source-1",
            programId: "program-a",
            sourceKind: "article",
            title: "Program source",
            locator: "https://example.test/source",
            citation: "Citation",
            recordedByIdentityId: "identity-curator",
          },
        ],
        events: [
          {
            eventType: "program_source_recorded",
            actorIdentityId: "identity-curator",
            programId: "program-a",
            targetId: "source-1",
            outcome: "accepted",
            reason: null,
          },
          {
            eventType: "program_source_recorded",
            actorIdentityId: "identity-curator",
            programId: "program-a",
            targetId: null,
            outcome: "rejected",
            reason: "validation_failed",
          },
        ],
      },
    );
  } finally {
    database.close();
  }
});

test("listProgramSources_shouldReturnOnlySourcesForRequestedProgram", async () => {
  const { commands, database } = await makeSUT();

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    seedCuratorProgram(database, { programId: "program-b" });
    commands.recordProgramSource({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      sourceKind: "article",
      title: "Program A source",
    });
    commands.recordProgramSource({
      actingIdentityId: "identity-curator",
      programId: "program-b",
      sourceKind: "note",
      title: "Program B source",
    });

    assert.deepEqual(
      commands.listProgramSources?.({
        actingIdentityId: "identity-curator",
        programId: "program-a",
      }),
      {
        status: "accepted",
        value: {
          programSources: [
            {
              sourceId: "source-1",
              programId: "program-a",
              sourceKind: "article",
              title: "Program A source",
              recordedByIdentityId: "identity-curator",
              recordedAt: "2026-05-28T11:00:00.000Z",
            },
          ],
        },
      },
    );
  } finally {
    database.close();
  }
});

async function makeSUT({
  ids = sequentialIds(),
  now = makeAdvancingClock("2026-05-28T11:00:00.000Z"),
} = {}) {
  const database = openIdentityDatabase();
  initializeIdentityStorage(database);
  createIdentity(database, makeIdentity({ id: "identity-curator" }));
  const programCommands = createProgramCommands({
    database,
    generateId: makeIdGenerator([...ids]),
    now,
  });
  const corpus = await import("../src/corpus.js").catch(() => ({}));
  const commands = corpus.createCorpusCommands?.({
    database,
    generateId: makeIdGenerator([...ids]),
    getEffectiveParticipation: programCommands.getEffectiveParticipation,
    now,
  });

  return { commands, database };
}

function makeAdvancingClock(startIso) {
  let tick = 0;
  const start = new Date(startIso).getTime();
  return () => new Date(start + tick++);
}

function sequentialIds() {
  return [
    "source-1",
    "corpus-event-1",
    "source-2",
    "corpus-event-2",
    "source-3",
    "corpus-event-3",
  ];
}

function makeIdGenerator(ids) {
  const nextIds = [...ids];
  return () => nextIds.shift();
}

function captureResult(run) {
  try {
    return run();
  } catch (error) {
    return { thrown: error.code ?? error.message };
  }
}

function makeIdentity({ id, state = "active" }) {
  return {
    id,
    displayName: `Display ${id}`,
    state,
    createdAt: "2026-05-28T10:00:00.000Z",
    disabledAt: state === "disabled" ? "2026-05-28T10:30:00.000Z" : null,
  };
}

function makeProgramShell({ id }) {
  return {
    id,
    title: `Program ${id}`,
    admissionPolicy: "self_join",
    createdByIdentityId: "identity-curator",
    createdAt: "2026-05-28T10:45:00.000Z",
  };
}

function seedCuratorProgram(database, { programId }) {
  createProgramShellRecord(database, makeProgramShell({ id: programId }));
  createProgramMembershipRecord(database, {
    id: `membership-${programId}`,
    programId,
    identityId: "identity-curator",
    participationKind: "program_curator",
    status: "active",
    createdAt: "2026-05-28T10:46:00.000Z",
    updatedAt: "2026-05-28T10:46:00.000Z",
  });
}
