import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import http from "node:http";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { runOpenAnswerEvaluatorSmoke } from "../scripts/smoke-open-answer-evaluator.mjs";
import { startServer } from "../src/server.js";

test("runOpenAnswerEvaluatorSmoke_shouldCompleteEvaluation_onConfiguredRuntime", async () => {
  const databaseDirectory = mkdtempSync(join(tmpdir(), "agonara-open-answer-smoke-"));
  const databasePath = join(databaseDirectory, "agonara.sqlite");
  const nomosRequests = [];
  const nomosServer = createFakeNomosServer(nomosRequests);
  const nomosBaseUrl = await listen(nomosServer);
  const server = startServer({
    bootstrapSecret: "bootstrap-secret",
    databasePath,
    host: "127.0.0.1",
    log: () => {},
    nomosApiKey: "nomos-key-secret",
    nomosBaseUrl,
    nomosModel: "model-a",
    openAnswerEvaluatorTriggerToken: "trigger-token-secret",
    port: 0,
  });
  const baseUrl = await baseUrlForStartedServer(server);

  try {
    const result = await runOpenAnswerEvaluatorSmoke({
      adminLogin: "smoke-admin@example.test",
      adminPassword: "NON_SECRET_TEST_VALUE",
      baseUrl,
      bootstrapSecret: "bootstrap-secret",
      databasePath,
      triggerToken: "trigger-token-secret",
      uniqueSuffix: "test",
    });

    assert.deepEqual(
      {
        completed: result.tickSummary.completed,
        hasEvaluatorJobId: typeof result.evaluatorJobId === "string",
        hasEvaluationId: typeof result.evaluationId === "string",
        nomosRequest: {
          authorization: nomosRequests[0].headers.authorization,
          model: nomosRequests[0].body.model,
          responseFormat: nomosRequests[0].body.response_format.type,
        },
        tickMode: result.tickSummary.mode,
        workerClaimed: result.tickSummary.claimed,
      },
      {
        completed: true,
        hasEvaluatorJobId: true,
        hasEvaluationId: true,
        nomosRequest: {
          authorization: "Bearer nomos-key-secret",
          model: "model-a",
          responseFormat: "json_schema",
        },
        tickMode: "single_job",
        workerClaimed: true,
      },
    );
  } finally {
    await close(server);
    await close(nomosServer);
    rmSync(databaseDirectory, { force: true, recursive: true });
  }
});

function createFakeNomosServer(requests) {
  return http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) {
      chunks.push(chunk);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    requests.push({ body, headers: request.headers, url: request.url });
    const userMessage = JSON.parse(body.messages.find($0 => $0.role === "user").content);
    const criterionRevisionIds = userMessage.acceptedCriterionRevisions.map($0 => $0.revisionId);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              criterionFeedback: criterionRevisionIds.map($0 => ({
                criterionRevisionId: $0,
                feedback: "The answer explains closure inside the same structure.",
                outcome: "met",
              })),
              summaryFeedback: "The answer gives a valid closure explanation.",
            }),
          },
        },
      ],
      usage: {
        completion_tokens: 20,
        prompt_tokens: 80,
      },
    }));
  });
}

async function baseUrlForStartedServer(server) {
  await once(server, "listening");
  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}

async function listen(server) {
  server.listen(0, "127.0.0.1");
  return baseUrlForStartedServer(server);
}

async function close(server) {
  if (!server.listening) {
    return;
  }
  server.close();
  await once(server, "close");
}
