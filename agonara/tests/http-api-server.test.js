import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { startServer } from "../src/server.js";
import {
  bootstrapAdmin,
  close,
  createAcceptedQuickCheck,
  createIdentitySession,
  createProgram,
  createStudentAttemptApiScenario,
  joinStudentProgram,
  listenWithIdentity,
  submitOpenAnswerAttempt,
  submitQuickCheckAttempt,
} from "./support/http-api.js";

test("startServer_shouldExposeStudentWorkspaceOpenAnswerRoutes_onProductionComposition", async () => {
  const databaseDirectory = mkdtempSync(join(tmpdir(), "agonara-production-composition-"));
  const databasePath = join(databaseDirectory, "agonara.sqlite");
  const server = startServer({
    bootstrapSecret: "operator-secret",
    databasePath,
    host: "127.0.0.1",
    log: () => {},
    port: "0",
  });
  const baseUrl = await baseUrlForStartedServer(server);

  try {
    const scenario = await createStudentAttemptApiScenario(baseUrl);
    const submission = await submitOpenAnswerAttempt(
      baseUrl,
      scenario.student,
      scenario.programId,
      {
        checkRevisionId: scenario.acceptedCheck.revisionId,
        submittedAnswer: "Production composition answer.",
      },
      "production-composition-key",
    );
    const submissionBody = await submission.json();
    const attemptId = submissionBody.value?.attempt?.attemptId;
    const detail = await fetch(`${baseUrl}/open-answer-attempts/${attemptId}`, {
      headers: { cookie: scenario.student.cookie },
    });
    const list = await fetch(`${baseUrl}/programs/${scenario.programId}/open-answer-attempts`, {
      headers: { cookie: scenario.student.cookie },
    });

    assert.deepEqual(
      {
        detailStatusCode: detail.status,
        listStatusCode: list.status,
        listedAttemptIds: (await list.json()).value?.attempts.map($0 => $0.attemptId),
        submissionStatus: submissionBody.status,
        submissionStatusCode: submission.status,
      },
      {
        detailStatusCode: 200,
        listStatusCode: 200,
        listedAttemptIds: [attemptId],
        submissionStatus: "accepted",
        submissionStatusCode: 200,
      },
    );
  } finally {
    await close(server);
    rmSync(databaseDirectory, { force: true, recursive: true });
  }
});

test("startServer_shouldExposeQuickCheckRoutes_onProductionComposition", async () => {
  const databaseDirectory = mkdtempSync(join(tmpdir(), "agonara-quick-check-composition-"));
  const databasePath = join(databaseDirectory, "agonara.sqlite");
  const server = startServer({
    bootstrapSecret: "operator-secret",
    databasePath,
    host: "127.0.0.1",
    log: () => {},
    port: "0",
  });
  const baseUrl = await baseUrlForStartedServer(server);

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const curator = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Program Curator",
      login: "quick-production-curator@example.test",
    });
    const student = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Program Student",
      login: "quick-production-student@example.test",
    });
    const program = await createProgram(baseUrl, curator, { title: "Linear Algebra" });
    const programId = (await program.json()).value.program.programId;
    await joinStudentProgram(baseUrl, student, programId);
    const acceptedQuickCheck = await createAcceptedQuickCheck(baseUrl, curator, programId, {
      answerKeyOptionIndex: 0,
      options: ["Closed under addition", "Only finite dimension"],
      prompt: "Which property is required?",
      title: "Closure check",
    });
    const deliveries = await fetch(`${baseUrl}/programs/${programId}/quick-checks`, {
      headers: { cookie: student.cookie },
    });
    const submission = await submitQuickCheckAttempt(
      baseUrl,
      student,
      programId,
      {
        checkRevisionId: acceptedQuickCheck.revisionId,
        selectedOptionId: acceptedQuickCheck.answerKeyOptionId,
      },
      "quick-production-key",
    );
    const submissionBody = await submission.json();
    const attemptId = submissionBody.value.quickCheckAttempt.attemptId;
    const detail = await fetch(`${baseUrl}/quick-check-attempts/${attemptId}`, {
      headers: { cookie: student.cookie },
    });
    const attempts = await fetch(`${baseUrl}/programs/${programId}/quick-check-attempts`, {
      headers: { cookie: student.cookie },
    });

    assert.deepEqual(
      {
        attemptIds: (await attempts.json()).value.quickCheckAttempts.map($0 => $0.attemptId),
        attemptsStatusCode: attempts.status,
        deliveryTitles: (await deliveries.json()).value.quickCheckDeliveries.map($0 => $0.title),
        deliveriesStatusCode: deliveries.status,
        detailStatusCode: detail.status,
        submissionStatus: submissionBody.status,
        submissionStatusCode: submission.status,
      },
      {
        attemptIds: [attemptId],
        attemptsStatusCode: 200,
        deliveryTitles: ["Closure check"],
        deliveriesStatusCode: 200,
        detailStatusCode: 200,
        submissionStatus: "accepted",
        submissionStatusCode: 200,
      },
    );
  } finally {
    await close(server);
    rmSync(databaseDirectory, { force: true, recursive: true });
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
        checkName: body.checks[0].name,
        checkStatus: body.checks[0].status,
        hasGeneratedAt: typeof body.generatedAt === "string",
        observedAt: body.checks[0].observedAt,
        requestId: body.requestId,
        responseRequestId: response.headers.get("x-request-id"),
      },
      {
        statusCode: 200,
        bodyStatus: "ok",
        checkName: "identity",
        checkStatus: "ok",
        hasGeneratedAt: true,
        observedAt: body.generatedAt,
        requestId: response.headers.get("x-request-id"),
        responseRequestId: body.requestId,
      },
    );
  } finally {
    await close();
  }
});

function baseUrlForStartedServer(server) {
  return new Promise((resolve, reject) => {
    const resolveAddress = () => {
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}`);
    };
    server.once("error", reject);
    if (server.listening) {
      server.off("error", reject);
      resolveAddress();
      return;
    }
    server.once("listening", () => {
      server.off("error", reject);
      resolveAddress();
    });
  });
}
