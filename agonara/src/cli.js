#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createIdentityCommands } from "./identity.js";
import { initializeIdentityStorage, openIdentityDatabase } from "./storage.js";

if (isCliEntrypoint(process.argv[1])) {
  try {
    const exitCode = await runCli(process.argv.slice(2), {
      env: process.env,
      stdin: process.stdin,
      stderr: process.stderr,
      stdout: process.stdout,
    });
    process.exitCode = exitCode;
  } catch {
    process.stderr.write("runtime error\n");
    process.exitCode = 1;
  }
}

function isCliEntrypoint(argvPath) {
  if (!argvPath) {
    return false;
  }

  try {
    return realpathSync(argvPath) === fileURLToPath(import.meta.url);
  } catch {
    return import.meta.url === pathToFileURL(argvPath).href;
  }
}

export async function runCli(args, { env, stdin, stderr, stdout }) {
  if (args[0] !== "identity") {
    return usage(stderr);
  }

  const command = args[1];
  if (command === "bootstrap-status") {
    if (!args.includes("--json")) {
      return usage(stderr);
    }

    const { commands, database } = openCliCommands(env);
    try {
      stdout.write(`${JSON.stringify(commands.getBootstrapStatus())}\n`);
      return 0;
    } finally {
      database.close();
    }
  }

  if (command === "bootstrap-admin") {
    const options = parseBootstrapAdminOptions(args.slice(2));
    if (!options.valid) {
      return usage(stderr);
    }

    const stdinBody = await readStdinJson(stdin);
    const { commands, database } = openCliCommands(env);
    try {
      const result = await commands.bootstrapFirstAdmin({
        bootstrapSecret: stdinBody.bootstrapSecret,
        displayName: options.displayName,
        login: options.login,
        password: stdinBody.password,
      });
      stdout.write(`${JSON.stringify(toCliResult(result))}\n`);
      return result.status === "accepted" ? 0 : 2;
    } finally {
      database.close();
    }
  }

  return usage(stderr);
}

function openCliCommands(env) {
  if (!env.AGONARA_BOOTSTRAP_SECRET) {
    throw new Error("missing bootstrap secret");
  }

  const database = openIdentityDatabase(env.AGONARA_DB_PATH ?? ":memory:");
  initializeIdentityStorage(database);
  return {
    commands: createIdentityCommands({
      bootstrapSecret: env.AGONARA_BOOTSTRAP_SECRET,
      database,
    }),
    database,
  };
}

function parseBootstrapAdminOptions(args) {
  const displayName = readOption(args, "--display-name");
  const login = readOption(args, "--login");
  return {
    displayName,
    login,
    valid: Boolean(displayName && login && args.includes("--stdin-json") && args.includes("--json")),
  };
}

function readOption(args, name) {
  const index = args.indexOf(name);
  if (index === -1) {
    return null;
  }

  return args[index + 1] ?? null;
}

async function readStdinJson(stdin) {
  let text = "";
  for await (const chunk of stdin) {
    text += chunk;
  }

  return JSON.parse(text);
}

function toCliResult(result) {
  if (result.status === "rejected") {
    return result;
  }

  return {
    status: "accepted",
    value: {
      csrfToken: randomUUID(),
      expiresAt: result.value.session.expiresAt,
      identity: {
        id: result.value.identity.id,
        displayName: result.value.identity.displayName,
        state: result.value.identity.state,
        isAdmin: true,
      },
    },
  };
}

function usage(stderr) {
  stderr.write("usage error\n");
  return 1;
}
