import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import {
  startHttp,
  bootstrapHttp,
  createHttpIdentitySession,
  postJson,
  putJson,
  postJsonWithIdempotency,
  deleteJson,
  getJson,
  makeWorkspace,
  removeWorkspace,
} from "./support/executable-acceptance.js";

test("acceptance_shouldExerciseCorpusApi_onHttpInstance", async () => {
  const workspace = makeWorkspace();

  try {
    const dbPath = join(workspace, "agonara.sqlite");
    const { baseUrl, close } = await startHttp(dbPath);

    try {
      const bootstrap = await bootstrapHttp(baseUrl);
      const student = await createHttpIdentitySession(baseUrl, bootstrap, {
        displayName: "Program Student",
        login: "student@example.test",
      });
      const missingProgramCsrf = await postJson(
        `${baseUrl}/programs`,
        { title: "Linear Algebra" },
        { cookie: bootstrap.cookie },
      );
      const created = await postJson(
        `${baseUrl}/programs`,
        { description: "Foundations", title: "Linear Algebra" },
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const programId = created.body.value.program.programId;
      const missingSourceCsrf = await postJson(
        `${baseUrl}/programs/${programId}/sources`,
        { sourceKind: "textbook", title: "Linear Algebra Done Right" },
        { cookie: bootstrap.cookie },
      );
      const source = await postJson(
        `${baseUrl}/programs/${programId}/sources`,
        {
          citation: "Chapter 1",
          sourceKind: "textbook",
          title: "Linear Algebra Done Right",
        },
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const sourceId = source.body.value.programSource.sourceId;
      const missingCandidateCsrf = await postJson(
        `${baseUrl}/programs/${programId}/corpus-candidates`,
        {
          candidateKind: "topic",
          sourceIds: [sourceId],
          title: "Vector spaces",
        },
        { cookie: bootstrap.cookie },
      );
      const candidate = await postJson(
        `${baseUrl}/programs/${programId}/corpus-candidates`,
        {
          body: "A vector space is a set with compatible addition and scalar multiplication.",
          candidateKind: "topic",
          rationale: "Core foundation for the program.",
          sourceIds: [sourceId],
          title: "Vector spaces",
        },
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const candidateId = candidate.body.value.corpusCandidate.candidateId;
      const missingAcceptCsrf = await postJson(
        `${baseUrl}/corpus-candidates/${candidateId}/acceptance`,
        {},
        { cookie: bootstrap.cookie },
      );
      const firstAccepted = await postJson(
        `${baseUrl}/corpus-candidates/${candidateId}/acceptance`,
        {},
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const entityId = firstAccepted.body.value.acceptedCorpus.entityId;
      const historicalRevisionId = firstAccepted.body.value.acceptedCorpus.revisionId;
      const replacementCandidate = await postJson(
        `${baseUrl}/programs/${programId}/corpus-candidates`,
        {
          candidateKind: "topic",
          sourceIds: [sourceId],
          title: "Finite-dimensional vector spaces",
        },
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const replacementCandidateId = replacementCandidate.body.value.corpusCandidate.candidateId;
      const replaced = await postJson(
        `${baseUrl}/corpus-candidates/${replacementCandidateId}/acceptance`,
        { targetEntityId: entityId },
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const draft = await postJson(
        `${baseUrl}/programs/${programId}/corpus-candidates`,
        {
          candidateKind: "topic",
          sourceIds: [sourceId],
          title: "Draft-only eigenvalues",
        },
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const rejectedDraft = await postJson(
        `${baseUrl}/programs/${programId}/corpus-candidates`,
        {
          candidateKind: "topic",
          sourceIds: [sourceId],
          title: "Rejected determinants",
        },
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const rejectedDraftId = rejectedDraft.body.value.corpusCandidate.candidateId;
      const missingRejectCsrf = await postJson(
        `${baseUrl}/corpus-candidates/${rejectedDraftId}/rejection`,
        {},
        { cookie: bootstrap.cookie },
      );
      const rejected = await postJson(
        `${baseUrl}/corpus-candidates/${rejectedDraftId}/rejection`,
        {},
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const studentJoin = await postJson(
        `${baseUrl}/programs/${programId}/student-membership`,
        {},
        { cookie: student.cookie, csrfToken: student.body.value.csrfToken },
      );
      const acceptedCorpus = await getJson(`${baseUrl}/programs/${programId}/accepted-corpus`, {
        cookie: student.cookie,
      });
      const historicalRevision = await getJson(`${baseUrl}/accepted-corpus-revisions/${historicalRevisionId}`, {
        cookie: student.cookie,
      });
      const withdrawn = await putJson(
        `${baseUrl}/corpus/${entityId}/status`,
        { status: "withdrawn" },
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const withdrawnCorpus = await getJson(`${baseUrl}/programs/${programId}/accepted-corpus`, {
        cookie: student.cookie,
      });
      const withdrawnHistoricalRevision = await getJson(
        `${baseUrl}/accepted-corpus-revisions/${historicalRevisionId}`,
        { cookie: student.cookie },
      );
      const reactivated = await putJson(
        `${baseUrl}/corpus/${entityId}/status`,
        { status: "active" },
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const blockedSourceDelete = await deleteJson(`${baseUrl}/sources/${sourceId}`, {
        cookie: bootstrap.cookie,
        csrfToken: bootstrap.body.value.csrfToken,
      });
      const withdrawnSource = await putJson(
        `${baseUrl}/sources/${sourceId}/status`,
        { status: "withdrawn" },
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const unreferencedSource = await postJson(
        `${baseUrl}/programs/${programId}/sources`,
        { sourceKind: "article", title: "Stray source" },
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const deletedUnreferencedSource = await deleteJson(
        `${baseUrl}/sources/${unreferencedSource.body.value.programSource.sourceId}`,
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const corpusEvents = await getJson(`${baseUrl}/programs/${programId}/corpus-events`, {
        cookie: bootstrap.cookie,
      });
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
        outOfScopeRoutes.push((await getJson(`${baseUrl}${route}`, { cookie: bootstrap.cookie })).statusCode);
      }

      assert.deepEqual(
        {
          acceptedCorpus: acceptedCorpus.body.value.acceptedCorpus.map($0 => ({
            acceptedFromCandidateId: $0.acceptedFromCandidateId,
            sourceIds: $0.sourceIds,
            title: $0.title,
          })),
          corpusEventTypes: corpusEvents.body.value.corpusEvents.map($0 => $0.eventType),
          currentRevisionIsNew: replaced.body.value.acceptedCorpus.revisionId !== historicalRevisionId,
          lifecycle: {
            blockedSourceDelete: blockedSourceDelete.body,
            deletedUnreferencedSourceId: deletedUnreferencedSource.body.value.source.id,
            reactivatedStatus: reactivated.body.value.entity.status,
            withdrawnHistoricalTitle: withdrawnHistoricalRevision.body.value.acceptedCorpus.title,
            withdrawnList: withdrawnCorpus.body.value.acceptedCorpus,
            withdrawnSourceStatus: withdrawnSource.body.value.source.status,
            withdrawnStatus: withdrawn.body.value.entity.status,
          },
          draftStatus: draft.body.value.corpusCandidate.status,
          historicalTitle: historicalRevision.body.value.acceptedCorpus.title,
          httpStatusCodes: {
            acceptedCorpus: acceptedCorpus.statusCode,
            blockedSourceDelete: blockedSourceDelete.statusCode,
            candidate: candidate.statusCode,
            corpusEvents: corpusEvents.statusCode,
            created: created.statusCode,
            draft: draft.statusCode,
            deletedUnreferencedSource: deletedUnreferencedSource.statusCode,
            firstAccepted: firstAccepted.statusCode,
            historicalRevision: historicalRevision.statusCode,
            missingAcceptCsrf: missingAcceptCsrf.statusCode,
            missingCandidateCsrf: missingCandidateCsrf.statusCode,
            missingProgramCsrf: missingProgramCsrf.statusCode,
            missingRejectCsrf: missingRejectCsrf.statusCode,
            missingSourceCsrf: missingSourceCsrf.statusCode,
            rejected: rejected.statusCode,
            rejectedDraft: rejectedDraft.statusCode,
            replaced: replaced.statusCode,
            replacementCandidate: replacementCandidate.statusCode,
            reactivated: reactivated.statusCode,
            source: source.statusCode,
            studentJoin: studentJoin.statusCode,
            unreferencedSource: unreferencedSource.statusCode,
            withdrawn: withdrawn.statusCode,
            withdrawnCorpus: withdrawnCorpus.statusCode,
            withdrawnHistoricalRevision: withdrawnHistoricalRevision.statusCode,
            withdrawnSource: withdrawnSource.statusCode,
          },
          missingAcceptCsrf: missingAcceptCsrf.body,
          missingCandidateCsrf: missingCandidateCsrf.body,
          missingProgramCsrf: missingProgramCsrf.body,
          missingRejectCsrf: missingRejectCsrf.body,
          missingSourceCsrf: missingSourceCsrf.body,
          outOfScopeRoutes,
          rejectedStatus: rejected.body.value.corpusCandidate.status,
        },
        {
          acceptedCorpus: [
            {
              acceptedFromCandidateId: replacementCandidateId,
              sourceIds: [sourceId],
              title: "Finite-dimensional vector spaces",
            },
          ],
          corpusEventTypes: [
            "program_source_recorded",
            "corpus_candidate_created",
            "corpus_candidate_accepted",
            "corpus_candidate_created",
            "corpus_candidate_accepted",
            "corpus_candidate_created",
            "corpus_candidate_created",
            "corpus_candidate_rejected",
            "program_source_recorded",
          ],
          currentRevisionIsNew: true,
          lifecycle: {
            blockedSourceDelete: { status: "rejected", reason: "source_hard_delete_blocked" },
            deletedUnreferencedSourceId: unreferencedSource.body.value.programSource.sourceId,
            reactivatedStatus: "active",
            withdrawnHistoricalTitle: "Vector spaces",
            withdrawnList: [],
            withdrawnSourceStatus: "withdrawn",
            withdrawnStatus: "withdrawn",
          },
          draftStatus: "draft",
          historicalTitle: "Vector spaces",
          httpStatusCodes: {
            acceptedCorpus: 200,
            blockedSourceDelete: 409,
            candidate: 200,
            corpusEvents: 200,
            created: 200,
            draft: 200,
            deletedUnreferencedSource: 200,
            firstAccepted: 200,
            historicalRevision: 200,
            missingAcceptCsrf: 403,
            missingCandidateCsrf: 403,
            missingProgramCsrf: 403,
            missingRejectCsrf: 403,
            missingSourceCsrf: 403,
            rejected: 200,
            rejectedDraft: 200,
            replaced: 200,
            replacementCandidate: 200,
            reactivated: 200,
            source: 200,
            studentJoin: 200,
            unreferencedSource: 200,
            withdrawn: 200,
            withdrawnCorpus: 200,
            withdrawnHistoricalRevision: 200,
            withdrawnSource: 200,
          },
          missingAcceptCsrf: { status: "rejected", reason: "csrf_required" },
          missingCandidateCsrf: { status: "rejected", reason: "csrf_required" },
          missingProgramCsrf: { status: "rejected", reason: "csrf_required" },
          missingRejectCsrf: { status: "rejected", reason: "csrf_required" },
          missingSourceCsrf: { status: "rejected", reason: "csrf_required" },
          outOfScopeRoutes: [404, 404, 404, 404, 404, 404, 404, 404],
          rejectedStatus: "rejected",
        },
      );
    } finally {
      await close();
    }
  } finally {
    removeWorkspace(workspace);
  }
});

test("acceptance_shouldExerciseNavigationApi_onHttpInstance", async () => {
  const workspace = makeWorkspace();

  try {
    const dbPath = join(workspace, "agonara.sqlite");
    const { baseUrl, close } = await startHttp(dbPath);

    try {
      const bootstrap = await bootstrapHttp(baseUrl);
      const student = await createHttpIdentitySession(baseUrl, bootstrap, {
        displayName: "Program Student",
        login: "navigation-student@example.test",
      });
      const created = await postJson(
        `${baseUrl}/programs`,
        { description: "Foundations", title: "Linear Algebra" },
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const programId = created.body.value.program.programId;
      await postJson(
        `${baseUrl}/programs/${programId}/student-membership`,
        {},
        { cookie: student.cookie, csrfToken: student.body.value.csrfToken },
      );
      const topicCandidate = await postJson(
        `${baseUrl}/programs/${programId}/navigation-candidates`,
        { candidateKind: "topic", title: "Vector spaces" },
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const topicAccepted = await postJson(
        `${baseUrl}/navigation-candidates/${topicCandidate.body.value.navigationCandidate.candidateId}/acceptance`,
        {},
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const topic = topicAccepted.body.value.navigationChange.acceptedCorpus;
      const conceptCandidate = await postJson(
        `${baseUrl}/programs/${programId}/navigation-candidates`,
        {
          candidateKind: "concept",
          relationshipDrafts: [
            {
              relationshipKind: "topic_includes_concept",
              fromEntityId: topic.entityId,
              toCandidateRef: "self",
            },
          ],
          title: "Basis",
        },
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const conceptAccepted = await postJson(
        `${baseUrl}/navigation-candidates/${conceptCandidate.body.value.navigationCandidate.candidateId}/acceptance`,
        {},
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const concept = conceptAccepted.body.value.navigationChange.acceptedCorpus;
      const materialCandidate = await postJson(
        `${baseUrl}/programs/${programId}/navigation-candidates`,
        {
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
        },
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const materialAccepted = await postJson(
        `${baseUrl}/navigation-candidates/${materialCandidate.body.value.navigationCandidate.candidateId}/acceptance`,
        {},
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const candidateList = await getJson(`${baseUrl}/programs/${programId}/navigation-candidates?status=accepted`, {
        cookie: bootstrap.cookie,
      });
      const navigation = await getJson(`${baseUrl}/programs/${programId}/navigation`, {
        cookie: student.cookie,
      });
      const conceptDetail = await getJson(`${baseUrl}/navigation/entities/${concept.entityId}`, {
        cookie: student.cookie,
      });
      const historicalRevision = await getJson(`${baseUrl}/navigation/revisions/${topic.revisionId}`, {
        cookie: student.cookie,
      });
      const serializedStudentReads = JSON.stringify([navigation.body, conceptDetail.body, historicalRevision.body]);

      assert.deepEqual(
        {
          candidateTitles: candidateList.body.value.navigationCandidates.map($0 => $0.title),
          conceptIncomingKinds: conceptDetail.body.value.navigationNode.relationships.incoming.map($0 => $0.relationshipKind),
          conceptOutgoingKinds: conceptDetail.body.value.navigationNode.relationships.outgoing.map($0 => $0.relationshipKind),
          historicalTitle: historicalRevision.body.value.navigationRevision.title,
          httpStatusCodes: {
            candidateList: candidateList.statusCode,
            conceptAccepted: conceptAccepted.statusCode,
            conceptDetail: conceptDetail.statusCode,
            created: created.statusCode,
            historicalRevision: historicalRevision.statusCode,
            materialAccepted: materialAccepted.statusCode,
            materialCandidate: materialCandidate.statusCode,
            navigation: navigation.statusCode,
            topicAccepted: topicAccepted.statusCode,
            topicCandidate: topicCandidate.statusCode,
          },
          leaksCandidateMetadata: [
            "acceptedFromCandidateId",
            "sourceIds",
            "acceptedByIdentityId",
            "acceptedAt",
            "relationshipDrafts",
          ].some($0 => serializedStudentReads.includes($0)),
          materialKind: materialAccepted.body.value.navigationChange.acceptedCorpus.acceptedKind,
          topicTitles: navigation.body.value.navigation.topics.map($0 => $0.title),
        },
        {
          candidateTitles: ["Vector spaces", "Basis", "Basis reading"],
          conceptIncomingKinds: ["topic_includes_concept"],
          conceptOutgoingKinds: ["concept_uses_material"],
          historicalTitle: "Vector spaces",
          httpStatusCodes: {
            candidateList: 200,
            conceptAccepted: 200,
            conceptDetail: 200,
            created: 200,
            historicalRevision: 200,
            materialAccepted: 200,
            materialCandidate: 200,
            navigation: 200,
            topicAccepted: 200,
            topicCandidate: 200,
          },
          leaksCandidateMetadata: false,
          materialKind: "material_reference",
          topicTitles: ["Vector spaces"],
        },
      );
    } finally {
      await close();
    }
  } finally {
    removeWorkspace(workspace);
  }
});

test("acceptance_shouldExerciseLearnerStateApi_onHttpInstance", async () => {
  const workspace = makeWorkspace();

  try {
    const dbPath = join(workspace, "agonara.sqlite");
    const { baseUrl, close } = await startHttp(dbPath);

    try {
      const bootstrap = await bootstrapHttp(baseUrl);
      const student = await createHttpIdentitySession(baseUrl, bootstrap, {
        displayName: "Program Student",
        login: "learner-state-student@example.test",
      });
      const created = await postJson(
        `${baseUrl}/programs`,
        { title: "Linear Algebra" },
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const programId = created.body.value.program.programId;
      await postJson(
        `${baseUrl}/programs/${programId}/student-membership`,
        {},
        { cookie: student.cookie, csrfToken: student.body.value.csrfToken },
      );
      const topicCandidate = await postJson(
        `${baseUrl}/programs/${programId}/navigation-candidates`,
        { candidateKind: "topic", title: "Vector spaces" },
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const topicAccepted = await postJson(
        `${baseUrl}/navigation-candidates/${topicCandidate.body.value.navigationCandidate.candidateId}/acceptance`,
        {},
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const topic = topicAccepted.body.value.navigationChange.acceptedCorpus;
      const quickCheckCandidate = await postJson(
        `${baseUrl}/programs/${programId}/quick-checks/candidates`,
        {
          answerKeyOptionIndex: 0,
          checkKind: "single_select_quick_check",
          options: ["Closed under addition", "Only finite dimension"],
          prompt: "Which property is required?",
          title: "Closure check",
        },
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const quickCheckAccepted = await postJson(
        `${baseUrl}/quick-checks/candidates/${quickCheckCandidate.body.value.quickCheckCandidate.candidateId}/acceptance`,
        {},
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const quickCheck = quickCheckAccepted.body.value.acceptedQuickCheck;
      const link = await postJson(
        `${baseUrl}/programs/${programId}/learner-state-target-links`,
        {
          evidenceOwnerEntityId: quickCheck.entityId,
          evidenceOwnerKind: "accepted_quick_check",
          targetId: topic.entityId,
          targetKind: "topic",
        },
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      await postJsonWithIdempotency(
        `${baseUrl}/programs/${programId}/quick-check-attempts`,
        {
          checkRevisionId: quickCheck.revisionId,
          selectedOptionId: quickCheck.answerKeyOptionId,
        },
        "learner-state-http-attempt",
        { cookie: student.cookie, csrfToken: student.body.value.csrfToken },
      );
      const summary = await getJson(`${baseUrl}/programs/${programId}/learner-state`, {
        cookie: student.cookie,
      });
      const detail = await getJson(`${baseUrl}/learner-state/targets/topic/${topic.entityId}`, {
        cookie: student.cookie,
      });
      const curatorDetail = await getJson(`${baseUrl}/learner-state/targets/topic/${topic.entityId}`, {
        cookie: bootstrap.cookie,
      });
      const serialized = JSON.stringify([summary.body, detail.body]);

      assert.deepEqual(
        {
          detailEvidenceKinds: detail.body.value?.learnerStateTarget.evidence.map($0 => $0.sourceKind),
          detailLevel: detail.body.value?.learnerStateTarget.level,
          httpStatusCodes: {
            curatorDetail: curatorDetail.statusCode,
            detail: detail.statusCode,
            link: link.statusCode,
            summary: summary.statusCode,
          },
          linkTargetKind: link.body.value?.learnerStateTargetLink.targetKind,
          redaction: [
            "answerKey",
            "candidateId",
            "acceptedFromCandidateId",
            "createdByIdentityId",
            "learner-state-http-attempt",
            "csrf",
            "session",
            "raw prompt",
            "raw model",
          ].some($0 => serialized.includes($0)),
          summaryLevel: summary.body.value?.learnerState.level,
          topicLevels: summary.body.value?.learnerState.topics.map($0 => $0.level),
          unauthorizedDetail: curatorDetail.body,
        },
        {
          detailEvidenceKinds: ["quick_check_attempt"],
          detailLevel: "on_track",
          httpStatusCodes: {
            curatorDetail: 404,
            detail: 200,
            link: 200,
            summary: 200,
          },
          linkTargetKind: "topic",
          redaction: false,
          summaryLevel: "on_track",
          topicLevels: ["on_track"],
          unauthorizedDetail: { status: "rejected", reason: "learner_state_target_not_found" },
        },
      );
    } finally {
      await close();
    }
  } finally {
    removeWorkspace(workspace);
  }
});

test("acceptance_shouldExerciseCuratorCoverageGapsApi_onHttpInstance", async () => {
  const workspace = makeWorkspace();

  try {
    const dbPath = join(workspace, "agonara.sqlite");
    const { baseUrl, close } = await startHttp(dbPath);

    try {
      const bootstrap = await bootstrapHttp(baseUrl);
      const curator = await createHttpIdentitySession(baseUrl, bootstrap, {
        displayName: "Program Curator",
        login: "coverage-curator@example.test",
      });
      const student = await createHttpIdentitySession(baseUrl, bootstrap, {
        displayName: "Program Student",
        login: "coverage-student@example.test",
      });
      const created = await postJson(
        `${baseUrl}/programs`,
        { title: "Linear Algebra" },
        { cookie: curator.cookie, csrfToken: curator.body.value.csrfToken },
      );
      const programId = created.body.value.program.programId;
      await postJson(
        `${baseUrl}/programs/${programId}/student-membership`,
        {},
        { cookie: student.cookie, csrfToken: student.body.value.csrfToken },
      );
      const topicCandidate = await postJson(
        `${baseUrl}/programs/${programId}/navigation-candidates`,
        { candidateKind: "topic", title: "Vector spaces" },
        { cookie: curator.cookie, csrfToken: curator.body.value.csrfToken },
      );
      const topicAccepted = await postJson(
        `${baseUrl}/navigation-candidates/${topicCandidate.body.value.navigationCandidate.candidateId}/acceptance`,
        {},
        { cookie: curator.cookie, csrfToken: curator.body.value.csrfToken },
      );
      const quickCheckCandidate = await postJson(
        `${baseUrl}/programs/${programId}/quick-checks/candidates`,
        {
          answerKeyOptionIndex: 0,
          checkKind: "single_select_quick_check",
          options: ["Closed under addition", "Only finite dimension"],
          prompt: "Which property is required?",
          title: "Closure check",
        },
        { cookie: curator.cookie, csrfToken: curator.body.value.csrfToken },
      );
      const quickCheckAccepted = await postJson(
        `${baseUrl}/quick-checks/candidates/${quickCheckCandidate.body.value.quickCheckCandidate.candidateId}/acceptance`,
        {},
        { cookie: curator.cookie, csrfToken: curator.body.value.csrfToken },
      );
      const report = await getJson(
        `${baseUrl}/programs/${programId}/coverage-gaps?minimumSeverity=warning&gapKind=topic_without_checks&gapKind=check_without_target_links`,
        { cookie: curator.cookie },
      );
      const studentRead = await getJson(`${baseUrl}/programs/${programId}/coverage-gaps`, {
        cookie: student.cookie,
      });
      const serialized = JSON.stringify(report.body);

      assert.deepEqual(
        {
          acceptedKinds: [
            topicAccepted.body.value.navigationChange.acceptedCorpus.acceptedKind,
            quickCheckAccepted.body.value.acceptedQuickCheck.checkKind,
          ],
          gapKinds: report.body.value?.report.gaps.map($0 => $0.gapKind),
          redaction: [
            "answerKey",
            "candidateId",
            "acceptedFromCandidateId",
            "acceptedByIdentityId",
            "coverage-curator@example.test",
            "csrf",
            "session",
            "raw prompt",
            "raw model",
          ].some($0 => serialized.includes($0)),
          reportStatus: report.statusCode,
          reportTargetTitles: report.body.value?.report.gaps.map($0 => $0.targetTitle),
          studentRead: { body: studentRead.body, statusCode: studentRead.statusCode },
        },
        {
          acceptedKinds: ["topic", "single_select_quick_check"],
          gapKinds: ["topic_without_checks", "check_without_target_links"],
          redaction: false,
          reportStatus: 200,
          reportTargetTitles: ["Vector spaces", "Closure check"],
          studentRead: {
            body: { status: "rejected", reason: "program_curator_required" },
            statusCode: 403,
          },
        },
      );
    } finally {
      await close();
    }
  } finally {
    removeWorkspace(workspace);
  }
});

test("acceptance_shouldExerciseAssessmentCorpusApi_onHttpInstance", async () => {
  const workspace = makeWorkspace();

  try {
    const dbPath = join(workspace, "agonara.sqlite");
    const { baseUrl, close } = await startHttp(dbPath);

    try {
      const bootstrap = await bootstrapHttp(baseUrl);
      const student = await createHttpIdentitySession(baseUrl, bootstrap, {
        displayName: "Program Student",
        login: "student@example.test",
      });
      const created = await postJson(
        `${baseUrl}/programs`,
        { title: "Linear Algebra" },
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const programId = created.body.value.program.programId;
      const source = await postJson(
        `${baseUrl}/programs/${programId}/sources`,
        { sourceKind: "textbook", title: "Linear Algebra Done Right" },
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const sourceId = source.body.value.programSource.sourceId;
      const missingCriterionCsrf = await postJson(
        `${baseUrl}/programs/${programId}/assessment-criteria/candidates`,
        { body: "Explain closure.", title: "Closure" },
        { cookie: bootstrap.cookie },
      );
      const criterionCandidate = await postJson(
        `${baseUrl}/programs/${programId}/assessment-criteria/candidates`,
        { body: "Explain closure.", sourceIds: [sourceId], title: "Closure" },
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const criterionCandidateId = criterionCandidate.body.value.assessmentCriterionCandidate.candidateId;
      const criterion = await postJson(
        `${baseUrl}/assessment-criteria/candidates/${criterionCandidateId}/acceptance`,
        {},
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const criterionEntityId = criterion.body.value.acceptedAssessmentCriterion.entityId;
      const historicalCriterionRevisionId = criterion.body.value.acceptedAssessmentCriterion.revisionId;
      const checkCandidate = await postJson(
        `${baseUrl}/programs/${programId}/open-answer-checks/candidates`,
        {
          checkKind: "open_answer",
          criterionEntityIds: [criterionEntityId],
          prompt: "Why is closure required?",
          sourceIds: [sourceId],
          title: "Closure check",
        },
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const checkCandidateId = checkCandidate.body.value.openAnswerCheckCandidate.candidateId;
      const check = await postJson(
        `${baseUrl}/open-answer-checks/candidates/${checkCandidateId}/acceptance`,
        {},
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const historicalCheckRevisionId = check.body.value.acceptedOpenAnswerCheck.revisionId;
      const revisedCriterionCandidate = await postJson(
        `${baseUrl}/programs/${programId}/assessment-criteria/candidates`,
        { body: "Explain closure under both operations.", sourceIds: [sourceId], title: "Closure revised" },
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      await postJson(
        `${baseUrl}/assessment-criteria/candidates/${revisedCriterionCandidate.body.value.assessmentCriterionCandidate.candidateId}/acceptance`,
        { targetEntityId: criterionEntityId },
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const rejectedCriterionCandidate = await postJson(
        `${baseUrl}/programs/${programId}/assessment-criteria/candidates`,
        { body: "Rejected criterion.", title: "Rejected criterion" },
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const rejectedCriterion = await postJson(
        `${baseUrl}/assessment-criteria/candidates/${rejectedCriterionCandidate.body.value.assessmentCriterionCandidate.candidateId}/rejection`,
        {},
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const rejectedCheckCandidate = await postJson(
        `${baseUrl}/programs/${programId}/open-answer-checks/candidates`,
        {
          checkKind: "open_answer",
          criterionEntityIds: [criterionEntityId],
          prompt: "Rejected prompt.",
          title: "Rejected check",
        },
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const rejectedCheck = await postJson(
        `${baseUrl}/open-answer-checks/candidates/${rejectedCheckCandidate.body.value.openAnswerCheckCandidate.candidateId}/rejection`,
        {},
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      await postJson(
        `${baseUrl}/programs/${programId}/student-membership`,
        {},
        { cookie: student.cookie, csrfToken: student.body.value.csrfToken },
      );
      const acceptedCriteria = await getJson(`${baseUrl}/programs/${programId}/assessment-criteria`, {
        cookie: student.cookie,
      });
      const acceptedChecks = await getJson(`${baseUrl}/programs/${programId}/open-answer-checks`, {
        cookie: student.cookie,
      });
      const historicalCriterion = await getJson(
        `${baseUrl}/assessment-criteria/revisions/${historicalCriterionRevisionId}`,
        { cookie: student.cookie },
      );
      const historicalCheck = await getJson(`${baseUrl}/open-answer-checks/revisions/${historicalCheckRevisionId}`, {
        cookie: student.cookie,
      });
      const outOfScopeRoutes = [];
      for (const route of ["/assessments", "/student-workspace", "/assessment-feedback", "/assessment-cli"]) {
        outOfScopeRoutes.push((await getJson(`${baseUrl}${route}`, { cookie: student.cookie })).statusCode);
      }

      assert.deepEqual(
        {
          acceptedCriterionTitles: acceptedCriteria.body.value.acceptedAssessmentCriteria.map($0 => $0.title),
          acceptedCheckTitles: acceptedChecks.body.value.acceptedOpenAnswerChecks.map($0 => $0.title),
          historicalCriterionTitle: historicalCriterion.body.value.acceptedAssessmentCriterion.title,
          historicalCheckCriterionRevisionIds:
            historicalCheck.body.value.acceptedOpenAnswerCheck.criterionRevisionIds,
          httpStatusCodes: {
            acceptedChecks: acceptedChecks.statusCode,
            acceptedCriteria: acceptedCriteria.statusCode,
            historicalCheck: historicalCheck.statusCode,
            historicalCriterion: historicalCriterion.statusCode,
            missingCriterionCsrf: missingCriterionCsrf.statusCode,
          },
          missingCriterionCsrf: missingCriterionCsrf.body,
          outOfScopeRoutes,
          rejectedCheckStatus: rejectedCheck.body.value.openAnswerCheckCandidate.status,
          rejectedCriterionStatus: rejectedCriterion.body.value.assessmentCriterionCandidate.status,
        },
        {
          acceptedCriterionTitles: ["Closure revised"],
          acceptedCheckTitles: ["Closure check"],
          historicalCriterionTitle: "Closure",
          historicalCheckCriterionRevisionIds: [historicalCriterionRevisionId],
          httpStatusCodes: {
            acceptedChecks: 200,
            acceptedCriteria: 200,
            historicalCheck: 200,
            historicalCriterion: 200,
            missingCriterionCsrf: 403,
          },
          missingCriterionCsrf: { status: "rejected", reason: "csrf_required" },
          outOfScopeRoutes: [404, 404, 404, 404],
          rejectedCheckStatus: "rejected",
          rejectedCriterionStatus: "rejected",
        },
      );
    } finally {
      await close();
    }
  } finally {
    removeWorkspace(workspace);
  }
});
