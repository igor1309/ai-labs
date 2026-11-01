import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import {
  startHttp,
  bootstrapHttp,
  postJson,
  getJson,
  makeWorkspace,
  removeWorkspace,
} from "./support/executable-acceptance.js";

test("acceptance_shouldExerciseLlmCurationSuggestionsThroughHttp_onHttpInstance", async () => {
  const workspace = makeWorkspace();

  try {
    const dbPath = join(workspace, "agonara.sqlite");
    const { baseUrl, close } = await startHttp(dbPath);

    try {
      const bootstrap = await bootstrapHttp(baseUrl);
      const createdProgram = await postJson(
        `${baseUrl}/programs`,
        { title: "Linear Algebra" },
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const programId = createdProgram.body.value.program.programId;
      const topicCandidate = await postJson(
        `${baseUrl}/programs/${programId}/navigation-candidates`,
        {
          body: "Vector spaces body",
          candidateKind: "topic",
          title: "Vector spaces",
        },
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      await postJson(
        `${baseUrl}/navigation-candidates/${topicCandidate.body.value.navigationCandidate.candidateId}/acceptance`,
        {},
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const generated = await postJson(
        `${baseUrl}/programs/${programId}/llm-curation-suggestions`,
        {
          curatorInstruction: "Suggest one draft topic.",
          idempotencyKey: "acceptance-llm-key-a",
          maxSuggestions: 1,
          suggestionPolicyId: "default-deterministic-policy",
        },
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const suggestionId = generated.body.value.suggestions[0].suggestionId;
      const detail = await getJson(`${baseUrl}/llm-curation-suggestions/${suggestionId}`, {
        cookie: bootstrap.cookie,
      });
      const accepted = await postJson(
        `${baseUrl}/llm-curation-suggestions/${suggestionId}/acceptance`,
        {},
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const draftCandidates = await getJson(`${baseUrl}/programs/${programId}/navigation-candidates?status=draft`, {
        cookie: bootstrap.cookie,
      });
      const acceptedCorpus = await getJson(`${baseUrl}/programs/${programId}/accepted-corpus`, {
        cookie: bootstrap.cookie,
      });
      const generatedForRejection = await postJson(
        `${baseUrl}/programs/${programId}/llm-curation-suggestions`,
        {
          curatorInstruction: "Suggest another draft topic.",
          idempotencyKey: "acceptance-llm-key-b",
          maxSuggestions: 1,
          suggestionPolicyId: "default-deterministic-policy",
        },
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const rejected = await postJson(
        `${baseUrl}/llm-curation-suggestions/${generatedForRejection.body.value.suggestions[0].suggestionId}/rejection`,
        {},
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const responseText = JSON.stringify({
        accepted: accepted.body,
        detail: detail.body,
        generated: generated.body,
        rejected: rejected.body,
      }).toLowerCase();

      assert.deepEqual(
        {
          acceptedCorpusTitles: acceptedCorpus.body.value.acceptedCorpus.map($0 => $0.title),
          acceptedSuggestionStatus: accepted.body.value.suggestion.status,
          detailSuggestionKind: detail.body.value.suggestion.suggestionKind,
          draftCandidateTitles: draftCandidates.body.value.navigationCandidates.map($0 => $0.title),
          generatedStatus: generated.statusCode,
          leaksProtectedArtifact: [
            "authorization",
            "cookie",
            "csrf",
            "raw prompt",
            "raw model",
            "provider diagnostics",
            "postgres://",
            "/tmp",
          ].some($0 => responseText.includes($0)),
          rejectedSuggestionStatus: rejected.body.value.suggestion.status,
        },
        {
          acceptedCorpusTitles: ["Vector spaces"],
          acceptedSuggestionStatus: "materialized",
          detailSuggestionKind: "navigation_candidate",
          draftCandidateTitles: ["Draft topic suggestion"],
          generatedStatus: 200,
          leaksProtectedArtifact: false,
          rejectedSuggestionStatus: "rejected",
        },
      );
    } finally {
      await close();
    }
  } finally {
    removeWorkspace(workspace);
  }
});

test("acceptance_shouldRateLimitLoginAndCorrelateHealthRequest_onHttpInstance", async () => {
  const workspace = makeWorkspace();

  try {
    const dbPath = join(workspace, "agonara.sqlite");
    const { baseUrl, close } = await startHttp(dbPath);

    try {
      await bootstrapHttp(baseUrl);
      let login;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        login = await postJson(`${baseUrl}/identity/sessions`, {
          login: "admin@example.test",
          password: "wrong horse battery staple",
        });
      }
      const health = await fetch(`${baseUrl}/operations/health`, {
        headers: { "x-request-id": "acceptance-request" },
      });
      const healthBody = await health.json();

      assert.deepEqual(
        {
          loginStatus: login.statusCode,
          loginBody: login.body,
          healthStatus: health.status,
          healthHeader: health.headers.get("x-request-id"),
          healthBodyRequestId: healthBody.requestId,
        },
        {
          loginStatus: 429,
          loginBody: { status: "rejected", reason: "rate_limited" },
          healthStatus: 200,
          healthHeader: "acceptance-request",
          healthBodyRequestId: "acceptance-request",
        },
      );
    } finally {
      await close();
    }
  } finally {
    removeWorkspace(workspace);
  }
});
