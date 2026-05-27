import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { startServer } from "../src/server.js";

const cliPath = fileURLToPath(new URL("../src/cli.js", import.meta.url));

test("acceptance_shouldBootstrapThroughCliAndUseHttpSession_onCleanInstance", async () => {
  const workspace = makeWorkspace();

  try {
    const dbPath = join(workspace, "agonara.sqlite");
    const bootstrap = runCli(
      ["identity", "bootstrap-admin", "--display-name", "Root Admin", "--login", "admin@example.test", "--stdin-json", "--json"],
      {
        dbPath,
        input: JSON.stringify({
          bootstrapSecret: "operator-secret",
          password: "correct horse battery staple",
        }),
      },
    );
    const { baseUrl, close } = await startHttp(dbPath);

    try {
      const login = await postJson(`${baseUrl}/identity/sessions`, {
        login: "admin@example.test",
        password: "correct horse battery staple",
      });
      const session = await getJson(`${baseUrl}/identity/session`, { cookie: login.cookie });
      const logout = await deleteSession(baseUrl, {
        cookie: login.cookie,
        csrfToken: session.body.value.csrfToken,
      });
      const afterLogout = await getJson(`${baseUrl}/identity/session`, { cookie: login.cookie });
      const responseText = JSON.stringify({
        bootstrap: bootstrap.stdout,
        login: login.body,
        session: session.body,
        logout: logout.body,
      });
      const loginSessionId = login.cookie?.replace("agonara_session=", "");

      assert.deepEqual(
        {
          bootstrapStatus: bootstrap.status,
          bootstrapBodyStatus: bootstrap.body.status,
          loginStatus: login.statusCode,
          sessionStatus: session.statusCode,
          logoutStatus: logout.statusCode,
          afterLogoutBody: afterLogout.body,
          leaksSecret: responseText.includes("operator-secret"),
          leaksPassword: responseText.includes("correct horse battery staple"),
          leaksPasswordHash: responseText.includes("scrypt$"),
          leaksSessionId: loginSessionId ? responseText.includes(loginSessionId) : true,
        },
        {
          bootstrapStatus: 0,
          bootstrapBodyStatus: "accepted",
          loginStatus: 200,
          sessionStatus: 200,
          logoutStatus: 200,
          afterLogoutBody: { status: "rejected", reason: "session_revoked" },
          leaksSecret: false,
          leaksPassword: false,
          leaksPasswordHash: false,
          leaksSessionId: false,
        },
      );
    } finally {
      await close();
    }
  } finally {
    removeWorkspace(workspace);
  }
});

test("acceptance_shouldRejectSecondCliBootstrap_onHttpBootstrappedInstance", async () => {
  const workspace = makeWorkspace();

  try {
    const dbPath = join(workspace, "agonara.sqlite");
    const { baseUrl, close } = await startHttp(dbPath);

    try {
      const bootstrap = await bootstrapHttp(baseUrl);
      await close();
      const cliBootstrap = runCli(
        [
          "identity",
          "bootstrap-admin",
          "--display-name",
          "Second Admin",
          "--login",
          "second@example.test",
          "--stdin-json",
          "--json",
        ],
        {
          dbPath,
          input: JSON.stringify({
            bootstrapSecret: "operator-secret",
            password: "another correct horse",
          }),
        },
      );

      assert.deepEqual(
        {
          httpBootstrapStatus: bootstrap.statusCode,
          cliStatus: cliBootstrap.status,
          cliBody: cliBootstrap.body,
          cliStderr: cliBootstrap.stderr,
        },
        {
          httpBootstrapStatus: 200,
          cliStatus: 2,
          cliBody: { status: "rejected", reason: "bootstrap_already_completed" },
          cliStderr: "",
        },
      );
    } finally {
      await closeIfListening(close);
    }
  } finally {
    removeWorkspace(workspace);
  }
});

test("acceptance_shouldExerciseAdminAndCsrfFlows_onHttpInstance", async () => {
  const workspace = makeWorkspace();

  try {
    const dbPath = join(workspace, "agonara.sqlite");
    const { baseUrl, close } = await startHttp(dbPath);

    try {
      const bootstrap = await bootstrapHttp(baseUrl);
      const missingCsrf = await postJson(
        `${baseUrl}/identity/identities`,
        { displayName: "Second Identity" },
        { cookie: bootstrap.cookie },
      );
      const created = await postJson(
        `${baseUrl}/identity/identities`,
        { displayName: "Second Identity" },
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const secondIdentityId = created.body.value.id;
      const credential = await postJson(
        `${baseUrl}/identity/identities/${secondIdentityId}/local-password`,
        {
          login: "student@example.test",
          password: "correct horse battery staple",
        },
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const secondLogin = await postJson(`${baseUrl}/identity/sessions`, {
        login: "student@example.test",
        password: "correct horse battery staple",
      });
      const nonAdminList = await getJson(`${baseUrl}/identity/identities`, { cookie: secondLogin.cookie });
      const grantAdmin = await postJson(
        `${baseUrl}/identity/identities/${secondIdentityId}/admin`,
        {},
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const secondAdminList = await getJson(`${baseUrl}/identity/identities`, { cookie: secondLogin.cookie });
      const revokeSecondAdmin = await deleteJson(
        `${baseUrl}/identity/identities/${secondIdentityId}/admin`,
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const revokeLastAdmin = await deleteJson(
        `${baseUrl}/identity/identities/${bootstrap.body.value.identity.id}/admin`,
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const audit = await getJson(`${baseUrl}/identity/audit-events`, { cookie: bootstrap.cookie });
      const diagnostics = await getJson(`${baseUrl}/operations/diagnostics`, { cookie: bootstrap.cookie });
      const auditText = JSON.stringify(audit.body);

      assert.deepEqual(
        {
          missingCsrf: missingCsrf.body,
          createdStatus: created.statusCode,
          credentialBody: credential.body,
          nonAdminList: nonAdminList.body,
          grantAdminIsAdmin: grantAdmin.body.value.isAdmin,
          secondAdminListStatus: secondAdminList.statusCode,
          revokeSecondAdminIsAdmin: revokeSecondAdmin.body.value.isAdmin,
          revokeLastAdmin: revokeLastAdmin.body,
          auditStatus: audit.statusCode,
          auditContainsTargetSessionId: auditText.includes("targetSessionId"),
          diagnosticsStatus: diagnostics.statusCode,
        },
        {
          missingCsrf: { status: "rejected", reason: "csrf_required" },
          createdStatus: 200,
          credentialBody: { status: "accepted", value: { credentialBound: true } },
          nonAdminList: { status: "rejected", reason: "admin_required" },
          grantAdminIsAdmin: true,
          secondAdminListStatus: 200,
          revokeSecondAdminIsAdmin: false,
          revokeLastAdmin: { status: "rejected", reason: "last_admin_removal" },
          auditStatus: 200,
          auditContainsTargetSessionId: false,
          diagnosticsStatus: 200,
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

function runCli(args, { dbPath, input }) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      AGONARA_BOOTSTRAP_SECRET: "operator-secret",
      AGONARA_DB_PATH: dbPath,
    },
    input,
  });

  return {
    body: result.stdout ? JSON.parse(result.stdout) : null,
    status: result.status,
    stderr: result.stderr,
    stdout: result.stdout,
  };
}

async function startHttp(dbPath) {
  const server = startServer({
    bootstrapSecret: "operator-secret",
    databasePath: dbPath,
    host: "127.0.0.1",
    log: () => {},
    port: "0",
  });
  await waitForListening(server);
  const address = server.address();

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => closeServer(server),
  };
}

async function bootstrapHttp(baseUrl) {
  return await postJson(`${baseUrl}/identity/bootstrap/admin`, {
    bootstrapSecret: "operator-secret",
    displayName: "Root Admin",
    login: "admin@example.test",
    password: "correct horse battery staple",
  });
}

async function postJson(url, body, { cookie = null, csrfToken = null } = {}) {
  return await fetchJson(url, {
    body: JSON.stringify(body),
    headers: jsonHeaders({ cookie, csrfToken }),
    method: "POST",
  });
}

async function deleteJson(url, { cookie, csrfToken }) {
  return await fetchJson(url, {
    headers: jsonHeaders({ cookie, csrfToken }),
    method: "DELETE",
  });
}

async function deleteSession(baseUrl, { cookie, csrfToken }) {
  return await deleteJson(`${baseUrl}/identity/session`, { cookie, csrfToken });
}

async function getJson(url, { cookie = null } = {}) {
  return await fetchJson(url, {
    headers: cookie ? { cookie } : {},
  });
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  return {
    body: await response.json(),
    cookie: response.headers.get("set-cookie")?.split(";", 1)[0] ?? null,
    statusCode: response.status,
  };
}

function jsonHeaders({ cookie, csrfToken }) {
  return {
    ...(cookie ? { cookie } : {}),
    "content-type": "application/json",
    ...(csrfToken ? { "x-agonara-csrf": csrfToken } : {}),
  };
}

function waitForListening(server) {
  if (server.listening) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.once("listening", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function closeServer(server) {
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

async function closeIfListening(close) {
  try {
    await close();
  } catch (error) {
    if (error.code !== "ERR_SERVER_NOT_RUNNING") {
      throw error;
    }
  }
}

function makeWorkspace() {
  return mkdtempSync(join(tmpdir(), "agonara-acceptance-"));
}

function removeWorkspace(workspace) {
  rmSync(workspace, { force: true, recursive: true });
}
