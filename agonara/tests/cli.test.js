import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";
import test from "node:test";
import { runCli } from "../src/cli.js";

test("bootstrapStatus_shouldPrintAcceptedJson_onCleanDatabase", async () => {
  const context = makeCliContext();

  try {
    const exitCode = await runCli(["identity", "bootstrap-status", "--json"], context);

    assert.deepEqual(
      {
        exitCode,
        stdout: JSON.parse(context.stdoutText()),
        stderr: context.stderrText(),
      },
      {
        exitCode: 0,
        stdout: { status: "accepted", value: { available: true } },
        stderr: "",
      },
    );
  } finally {
    context.cleanup();
  }
});

test("bootstrapAdmin_shouldPrintAcceptedJsonAndHideSecrets_onValidStdin", async () => {
  const context = makeCliContext({
    stdinText: JSON.stringify({
      bootstrapSecret: "operator-secret",
      password: "correct horse battery staple",
    }),
  });

  try {
    const exitCode = await runCli(
      [
        "identity",
        "bootstrap-admin",
        "--display-name",
        "Root Admin",
        "--login",
        "admin@example.test",
        "--stdin-json",
        "--json",
      ],
      context,
    );
    const stdoutText = context.stdoutText();

    assert.deepEqual(
      {
        exitCode,
        status: JSON.parse(stdoutText).status,
        identityId: JSON.parse(stdoutText).value.identity.id.length > 0,
        leaksSecret: stdoutText.includes("operator-secret"),
        leaksPassword: stdoutText.includes("correct horse battery staple"),
        leaksSessionId: stdoutText.includes("session"),
        stderr: context.stderrText(),
      },
      {
        exitCode: 0,
        status: "accepted",
        identityId: true,
        leaksSecret: false,
        leaksPassword: false,
        leaksSessionId: false,
        stderr: "",
      },
    );
  } finally {
    context.cleanup();
  }
});

test("bootstrapAdmin_shouldExitTwo_onRejectedSecret", async () => {
  const context = makeCliContext({
    stdinText: JSON.stringify({
      bootstrapSecret: "wrong-secret",
      password: "correct horse battery staple",
    }),
  });

  try {
    const exitCode = await runCli(
      [
        "identity",
        "bootstrap-admin",
        "--display-name",
        "Root Admin",
        "--login",
        "admin@example.test",
        "--stdin-json",
        "--json",
      ],
      context,
    );

    assert.deepEqual(
      {
        exitCode,
        stdout: JSON.parse(context.stdoutText()),
        stderr: context.stderrText(),
      },
      {
        exitCode: 2,
        stdout: { status: "rejected", reason: "invalid_bootstrap_secret" },
        stderr: "",
      },
    );
  } finally {
    context.cleanup();
  }
});

test("bootstrapAdmin_shouldExitOneAndUseStderr_onUsageError", async () => {
  const context = makeCliContext();

  try {
    const exitCode = await runCli(["identity", "bootstrap-admin", "--json"], context);

    assert.deepEqual(
      {
        exitCode,
        stdout: context.stdoutText(),
        stderr: context.stderrText(),
      },
      {
        exitCode: 1,
        stdout: "",
        stderr: "usage error\n",
      },
    );
  } finally {
    context.cleanup();
  }
});

function makeCliContext({ stdinText = "" } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "agonara-cli-"));
  const stdout = makeWritable();
  const stderr = makeWritable();
  return {
    cleanup: () => rmSync(directory, { force: true, recursive: true }),
    env: {
      AGONARA_BOOTSTRAP_SECRET: "operator-secret",
      AGONARA_DB_PATH: join(directory, "identity.sqlite"),
    },
    stderr,
    stderrText: () => stderr.text(),
    stdin: Readable.from([stdinText]),
    stdout,
    stdoutText: () => stdout.text(),
  };
}

function makeWritable() {
  let output = "";
  const writable = new Writable({
    write(chunk, encoding, callback) {
      output += chunk.toString();
      callback();
    },
  });
  writable.text = () => output;
  return writable;
}
