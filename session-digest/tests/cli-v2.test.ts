import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { Writable } from "node:stream";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { main } from "../src/cli.js";
import { computeArtifactPaths } from "../src/artifacts.js";
import { SECTION_IDS, SECTION_NAMES } from "../src/sections.js";
import type { DigestModel } from "../src/synthesis.js";

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "v2");
const validSessionPath = path.join(fixturesDir, "rich-record.jsonl");

test("test_main_shouldWriteLedgerAndDigestAndPrintDigestPath_onValidV2Session", async (t) => {
  const { baseDir, tempDir } = await makeBaseDir();
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));
  const now = new Date("2026-04-26T01:02:03.000Z");
  const paths = computeArtifactPaths(validSessionPath, now, baseDir);
  const stdout = new StringSink();
  const stderr = new StringSink();

  const exitCode = await main([validSessionPath], stdout, stderr, {
    baseDir,
    clock: () => now,
    model: new FakeDigestModel(),
  });

  assert.deepEqual({
    digestExists: await exists(paths.digestPath),
    exitCode,
    ledgerExists: await exists(paths.ledgerPath),
    stderr: stderr.toString(),
    stdout: stdout.toString(),
  }, {
    digestExists: true,
    exitCode: 0,
    ledgerExists: true,
    stderr: "",
    stdout: `${paths.digestPath}\n`,
  });
});

test("test_main_shouldWriteOnlyLedgerAndDigestWithoutRawCopy_onSuccess", async (t) => {
  const { baseDir, tempDir } = await makeBaseDir();
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  await main([validSessionPath], new StringSink(), new StringSink(), {
    baseDir,
    clock: () => new Date("2026-04-26T01:02:03.000Z"),
    model: new FakeDigestModel(),
  });

  assert.deepEqual((await regularFilesUnder(baseDir)).map(($0) => path.extname($0)).sort(), [".json", ".md"]);
  assert.equal((await regularFilesUnder(baseDir)).some(($0) => $0.endsWith(".jsonl")), false);
});

test("test_main_shouldWriteOnlyLedger_onLedgerOnlyMode", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "session-digest-"));
  const baseDir = path.join(tempDir, ".session-digests");
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));
  const now = new Date("2026-04-26T01:02:03.000Z");
  const paths = computeArtifactPaths(validSessionPath, now, baseDir);
  const stdout = new StringSink();
  const stderr = new StringSink();
  const model = new FakeDigestModel();

  const exitCode = await main(["--ledger-only", validSessionPath], stdout, stderr, {
    baseDir,
    clock: () => now,
    model,
  });

  assert.deepEqual({
    digestExists: await exists(paths.digestPath),
    exitCode,
    ledgerExists: await exists(paths.ledgerPath),
    modelInvocations: model.inputs.length,
    stderr: stderr.toString(),
    stdout: stdout.toString(),
  }, {
    digestExists: false,
    exitCode: 0,
    ledgerExists: true,
    modelInvocations: 0,
    stderr: "",
    stdout: `${paths.ledgerPath}\n`,
  });
});

test("test_main_shouldIgnoreDigestCollision_onLedgerOnlyMode", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "session-digest-"));
  const baseDir = path.join(tempDir, ".session-digests");
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));
  const now = new Date("2026-04-26T01:02:03.000Z");
  const paths = computeArtifactPaths(validSessionPath, now, baseDir);
  const stdout = new StringSink();
  const stderr = new StringSink();

  await fs.mkdir(baseDir, { recursive: true });
  await fs.writeFile(paths.digestPath, "existing digest");

  const exitCode = await main(["--ledger-only", validSessionPath], stdout, stderr, {
    baseDir,
    clock: () => now,
    model: new FakeDigestModel(),
  });

  assert.deepEqual({
    digest: await fs.readFile(paths.digestPath, "utf8"),
    exitCode,
    ledgerExists: await exists(paths.ledgerPath),
    stderr: stderr.toString(),
    stdout: stdout.toString(),
  }, {
    digest: "existing digest",
    exitCode: 0,
    ledgerExists: true,
    stderr: "",
    stdout: `${paths.ledgerPath}\n`,
  });
});

test("test_main_shouldEmitV2FrontMatterThatPointsAtWrittenLedger_onSuccess", async (t) => {
  const { baseDir, tempDir } = await makeBaseDir();
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));
  const now = new Date("2026-04-26T01:02:03.000Z");
  const paths = computeArtifactPaths(validSessionPath, now, baseDir);
  const stdout = new StringSink();

  await main([validSessionPath], stdout, new StringSink(), {
    baseDir,
    clock: () => now,
    model: new FakeDigestModel(),
  });
  const digest = await fs.readFile(stdout.toString().trim(), "utf8");
  const ledger = JSON.parse(await fs.readFile(paths.ledgerPath, "utf8")) as { model_context: { bytes: number } };

  assert.match(digest, new RegExp([
    "compressor_strategy: claude-jsonl-v1",
    "compressor_version: 1.1.0",
    `ledger_path: ${escapeRegExp(paths.ledgerPath)}`,
    `ledger_bytes: ${(await fs.stat(paths.ledgerPath)).size}`,
    `model_context_bytes: ${ledger.model_context.bytes}`,
  ].join("[\\s\\S]*")));
});

test("test_main_shouldLeaveLedgerAndWriteNoDigest_onModelFailure", async (t) => {
  const { baseDir, tempDir } = await makeBaseDir();
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));
  const now = new Date("2026-04-26T01:02:03.000Z");
  const paths = computeArtifactPaths(validSessionPath, now, baseDir);
  const stdout = new StringSink();
  const stderr = new StringSink();

  const exitCode = await main([validSessionPath], stdout, stderr, {
    baseDir,
    clock: () => now,
    model: { invoke: async () => { throw new Error("synthetic failure"); } },
  });

  assert.deepEqual({
    digestExists: await exists(paths.digestPath),
    exitCode,
    ledgerExists: await exists(paths.ledgerPath),
    stderrMentionsLedger: stderr.toString().includes(paths.ledgerPath),
    stdout: stdout.toString(),
  }, {
    digestExists: false,
    exitCode: 1,
    ledgerExists: true,
    stderrMentionsLedger: true,
    stdout: "",
  });
});

test("test_main_shouldLeaveLedgerAndWriteNoDigest_onModelSchemaFailure", async (t) => {
  const { baseDir, tempDir } = await makeBaseDir();
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));
  const now = new Date("2026-04-26T01:02:03.000Z");
  const paths = computeArtifactPaths(validSessionPath, now, baseDir);
  const stdout = new StringSink();
  const stderr = new StringSink();

  const exitCode = await main([validSessionPath], stdout, stderr, {
    baseDir,
    clock: () => now,
    model: {
      invoke: async () => ({ content: JSON.stringify({ sections: { summary: "summary body" } }) }),
    },
  });

  assert.deepEqual({
    digestExists: await exists(paths.digestPath),
    exitCode,
    ledgerExists: await exists(paths.ledgerPath),
    stderrMentionsLedger: stderr.toString().includes(paths.ledgerPath),
    stderrMentionsMissingSection: stderr.toString().includes("Missing digest section: Session summary"),
    stdout: stdout.toString(),
  }, {
    digestExists: false,
    exitCode: 1,
    ledgerExists: true,
    stderrMentionsLedger: true,
    stderrMentionsMissingSection: true,
    stdout: "",
  });
});

test("test_main_shouldUseSettingsModelContextBudget_beforeModelCall", async (t) => {
  const { baseDir, tempDir } = await makeBaseDir();
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));
  const now = new Date("2026-04-26T01:02:03.000Z");
  const paths = computeArtifactPaths(validSessionPath, now, baseDir);
  const stdout = new StringSink();
  const stderr = new StringSink();
  const model = new FakeDigestModel();

  await fs.writeFile(path.join(baseDir, "settings.env"), "MODEL_CONTEXT_MAX_BYTES=400\n");

  const exitCode = await main([validSessionPath], stdout, stderr, {
    baseDir,
    clock: () => now,
    model,
  });

  assert.deepEqual({
    digestExists: await exists(paths.digestPath),
    exitCode,
    ledgerExists: await exists(paths.ledgerPath),
    modelInvocations: model.inputs.length,
    stderrMentionsBudget: stderr.toString().includes("model context budget exceeded"),
    stdout: stdout.toString(),
  }, {
    digestExists: false,
    exitCode: 1,
    ledgerExists: false,
    modelInvocations: 0,
    stderrMentionsBudget: true,
    stdout: "",
  });
});

test("test_main_shouldWriteDigestSectionsInDocumentedOrder_onSuccess", async (t) => {
  const { baseDir, tempDir } = await makeBaseDir();
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));
  const stdout = new StringSink();

  await main([validSessionPath], stdout, new StringSink(), {
    baseDir,
    clock: () => new Date("2026-04-26T01:02:03.000Z"),
    model: new FakeDigestModel(),
  });

  assert.deepEqual(h2Headers(await fs.readFile(stdout.toString().trim(), "utf8")), [...SECTION_NAMES]);
});

test("test_main_shouldUseConfiguredDigestSchemaPath_onSuccess", async (t) => {
  const { baseDir, tempDir } = await makeBaseDir();
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));
  const now = new Date("2026-04-26T01:02:03.000Z");
  const schemaPath = path.join(tempDir, "custom-digest-schema.yaml");
  const stdout = new StringSink();

  await fs.writeFile(schemaPath, [
    "version: 3",
    "sections:",
    "  - id: custom_summary",
    "    heading: Custom Summary",
    "    required: true",
    "    description: Custom summary section.",
  ].join("\n"));
  await fs.writeFile(path.join(baseDir, ".env"), [
    "NOMOS_API_KEY=fake",
    "NOMOS_MODEL=fake-model",
    `SESSION_DIGEST_SCHEMA_PATH=${schemaPath}`,
  ].join("\n"));

  const exitCode = await main([validSessionPath], stdout, new StringSink(), {
    baseDir,
    clock: () => now,
    model: new ConfiguredSchemaDigestModel(),
  });
  const digest = await fs.readFile(stdout.toString().trim(), "utf8");

  assert.deepEqual({
    exitCode,
    frontMatterHasSchemaPath: digest.includes(`digest_schema_path: ${schemaPath}`),
    frontMatterHasSchemaVersion: digest.includes("digest_schema_version: 3"),
    headings: h2Headers(digest),
  }, {
    exitCode: 0,
    frontMatterHasSchemaPath: true,
    frontMatterHasSchemaVersion: true,
    headings: ["Custom Summary"],
  });
});

class FakeDigestModel implements DigestModel {
  readonly inputs: unknown[] = [];

  async invoke(input: unknown): Promise<unknown> {
    this.inputs.push(input);

    return {
      content: JSON.stringify({
        sections: Object.fromEntries(SECTION_IDS.map(($0) => [$0, `${$0} body record:1`])),
      }),
    };
  }
}

class ConfiguredSchemaDigestModel implements DigestModel {
  readonly inputs: unknown[] = [];

  async invoke(input: unknown): Promise<unknown> {
    this.inputs.push(input);

    return {
      content: JSON.stringify({
        sections: {
          custom_summary: "custom summary body record:1",
        },
      }),
    };
  }
}

class StringSink extends Writable {
  readonly chunks: string[] = [];

  _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.chunks.push(chunk.toString());
    callback();
  }

  override toString(): string {
    return this.chunks.join("");
  }
}

async function makeBaseDir(): Promise<{ baseDir: string; tempDir: string }> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "session-digest-"));
  const baseDir = path.join(tempDir, ".session-digests");

  await fs.mkdir(baseDir, { recursive: true });
  await fs.writeFile(path.join(baseDir, ".env"), "NOMOS_API_KEY=fake\nNOMOS_MODEL=fake-model\n");

  return { baseDir, tempDir };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);

    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function regularFilesUnder(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { recursive: true, withFileTypes: true });

  return entries
    .filter(($0) => $0.isFile() && $0.name !== ".env")
    .map(($0) => path.join($0.parentPath, $0.name))
    .sort();
}

function h2Headers(markdown: string): string[] {
  return markdown.split("\n")
    .filter(($0) => $0.startsWith("## "))
    .map(($0) => $0.slice(3));
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
