import assert from "node:assert/strict";
import test from "node:test";
import {
  bootstrapAdmin,
  createAcceptedNavigationCandidate,
  createAcceptedQuickCheck,
  createIdentitySession,
  createProgram,
  getHttpResponse,
  joinStudentProgram,
  listenWithIdentityProgramAndCorpus,
  manyIds,
  navigationNodeProjection,
  navigationSummaryProjection,
  updateAcceptedCorpusStatus,
  updateQuickCheckStatus,
} from "./support/http-api.js";

test("lifecycleStatusRoutes_shouldSurfaceNotFoundNoopAndBlockedReasons", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({ ids: manyIds(160) });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const student = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Program Student",
      login: "lifecycle-edge-student@example.test",
    });
    const program = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await program.json()).value.program.programId;
    await joinStudentProgram(baseUrl, student, programId);
    const quickCheck = await createAcceptedQuickCheck(baseUrl, bootstrap, programId, {
      title: "Stable quick check",
    });
    const topic = await createAcceptedNavigationCandidate(baseUrl, bootstrap, programId, {
      candidateKind: "topic",
      title: "Vector spaces",
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

    const missing = await updateQuickCheckStatus(baseUrl, bootstrap, "entity-missing", {
      status: "withdrawn",
    });
    const noOp = await updateQuickCheckStatus(baseUrl, bootstrap, quickCheck.entityId, {
      status: "active",
    });
    const blocked = await updateAcceptedCorpusStatus(baseUrl, bootstrap, topic.entityId, {
      status: "withdrawn",
    });
    const navigation = await getHttpResponse(baseUrl, `/programs/${programId}/navigation`, student);
    const detail = await getHttpResponse(baseUrl, `/navigation/entities/${concept.entityId}`, student);
    const serializedLifecycleResponses = JSON.stringify([
      await missing.clone().json(),
      await noOp.clone().json(),
      await blocked.clone().json(),
    ]);

    assert.deepEqual(
      {
        missing: { body: await missing.json(), statusCode: missing.status },
        noOp: { body: await noOp.json(), statusCode: noOp.status },
        blocked: { body: await blocked.json(), statusCode: blocked.status },
        hasLifecyclePayloadLeak: containsLifecycleStatusPayloadLeak(serializedLifecycleResponses),
        navigation: navigationSummaryProjection(navigation.body, navigation.statusCode),
        detail: navigationNodeProjection(detail.body, detail.statusCode),
      },
      {
        missing: {
          body: { status: "rejected", reason: "accepted_entity_not_found" },
          statusCode: 404,
        },
        noOp: {
          body: {
            status: "accepted",
            value: {
              entity: {
                id: quickCheck.entityId,
                status: "active",
                updatedByIdentityId: "id-1",
                updatedAt: "2026-05-27T10:00:00.000Z",
              },
            },
          },
          statusCode: 200,
        },
        blocked: {
          body: { status: "rejected", reason: "entity_withdrawal_blocked" },
          statusCode: 409,
        },
        hasLifecyclePayloadLeak: false,
        navigation: {
          statusCode: 200,
          topics: ["Vector spaces"],
          ungroupedConcepts: [],
          ungroupedMaterials: [],
        },
        detail: {
          incomingKinds: ["topic_includes_concept"],
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

function containsLifecycleStatusPayloadLeak(serialized) {
  return [
    "acceptedFromCandidateId",
    "answerKey",
    "body",
    "criterionRevisionIds",
    "locator",
    "options",
    "prompt",
    "relationshipKind",
    "requirements",
    "rationale",
    "sourceIds",
  ].some($0 => serialized.includes($0));
}
