import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "../../src/server.js";

const cliPath = fileURLToPath(new URL("../../src/cli.js", import.meta.url));
const projectRoot = fileURLToPath(new URL("../..", import.meta.url));

export function runCli(args, { dbPath, input }) {
  return runCommand(process.execPath, [cliPath, ...args], { dbPath, input });
}

export function installPackage(workspace) {
  writeFileSync(join(workspace, "package.json"), JSON.stringify({ name: "agonara-install-check", private: true }));
  const result = spawnSync(
    "npm",
    ["install", "--offline", "--no-audit", "--no-fund", "--install-links=false", projectRoot],
    { cwd: workspace, encoding: "utf8", shell: process.platform === "win32" },
  );
  assert.equal(result.status, 0, result.stderr);
}

export function runPackagedCli(workspace, args, { dbPath, input = "" }) {
  const bin = `agonara${process.platform === "win32" ? ".cmd" : ""}`;
  return runCommand(join(workspace, "node_modules", ".bin", bin), args, { dbPath, input });
}

export function runCommand(command, args, { dbPath, input }) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: {
      ...process.env,
      AGONARA_BOOTSTRAP_SECRET: "operator-secret",
      AGONARA_DB_PATH: dbPath,
    },
    input,
  });
  if (result.error) {
    throw result.error;
  }

  return {
    body: result.stdout ? JSON.parse(result.stdout) : null,
    status: result.status,
    stderr: result.stderr,
    stdout: result.stdout,
  };
}

export async function startHttp(dbPath) {
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

export async function bootstrapHttp(baseUrl) {
  return await postJson(`${baseUrl}/identity/bootstrap/admin`, {
    bootstrapSecret: "operator-secret",
    displayName: "Root Admin",
    login: "admin@example.test",
    password: "correct horse battery staple",
  });
}

export async function createHttpIdentitySession(baseUrl, bootstrap, { displayName, login }) {
  const created = await postJson(
    `${baseUrl}/identity/identities`,
    { displayName },
    { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
  );
  const identityId = created.body.value.id;
  await postJson(
    `${baseUrl}/identity/identities/${identityId}/local-password`,
    {
      login,
      password: "correct horse battery staple",
    },
    { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
  );

  return await postJson(`${baseUrl}/identity/sessions`, {
    login,
    password: "correct horse battery staple",
  });
}

export async function postJson(url, body, { cookie = null, csrfToken = null } = {}) {
  return await fetchJson(url, {
    body: JSON.stringify(body),
    headers: jsonHeaders({ cookie, csrfToken }),
    method: "POST",
  });
}

export async function putJson(url, body, { cookie = null, csrfToken = null } = {}) {
  return await fetchJson(url, {
    body: JSON.stringify(body),
    headers: jsonHeaders({ cookie, csrfToken }),
    method: "PUT",
  });
}

export async function postJsonWithIdempotency(url, body, idempotencyKey, { cookie = null, csrfToken = null } = {}) {
  return await fetchJson(url, {
    body: JSON.stringify(body),
    headers: {
      ...jsonHeaders({ cookie, csrfToken }),
      "x-agonara-idempotency-key": idempotencyKey,
    },
    method: "POST",
  });
}

export async function deleteJson(url, { cookie, csrfToken }) {
  return await fetchJson(url, {
    headers: jsonHeaders({ cookie, csrfToken }),
    method: "DELETE",
  });
}

export async function deleteSession(baseUrl, { cookie, csrfToken }) {
  return await deleteJson(`${baseUrl}/identity/session`, { cookie, csrfToken });
}

export async function getJson(url, { cookie = null } = {}) {
  return await fetchJson(url, {
    headers: cookie ? { cookie } : {},
  });
}

export async function fetchJson(url, options) {
  const response = await fetch(url, options);
  return {
    body: await response.json(),
    cookie: response.headers.get("set-cookie")?.split(";", 1)[0] ?? null,
    statusCode: response.status,
  };
}

export function jsonHeaders({ cookie, csrfToken }) {
  return {
    ...(cookie ? { cookie } : {}),
    "content-type": "application/json",
    ...(csrfToken ? { "x-agonara-csrf": csrfToken } : {}),
  };
}

export function waitForListening(server) {
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

export function closeServer(server) {
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

export async function closeIfListening(close) {
  try {
    await close();
  } catch (error) {
    if (error.code !== "ERR_SERVER_NOT_RUNNING") {
      throw error;
    }
  }
}

export function makeWorkspace() {
  return mkdtempSync(join(tmpdir(), "agonara-acceptance-"));
}

export function removeWorkspace(workspace) {
  rmSync(workspace, { force: true, recursive: true });
}
