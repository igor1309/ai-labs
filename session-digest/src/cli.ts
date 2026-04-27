import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Writable } from "node:stream";
import { fileURLToPath } from "node:url";

import {
  ArtifactCollisionError,
  assertArtifactPathsAvailable,
  assertLedgerPathAvailable,
  computeArtifactPaths,
  measureLedgerBytes,
  writeLedger,
} from "./artifacts.js";
import { defaultClock } from "./clock.js";
import { ConfigError, loadConfig, loadSettings } from "./config.js";
import { InputError, validateInputPath } from "./inputs.js";
import { compileLedger, ModelContextBudgetError } from "./ledger.js";
import { defaultChatModel } from "./model.js";
import { assembleDigest, writeDigest } from "./output.js";
import { parseSessionRecords } from "./session-records.js";
import { DEFAULT_DIGEST_SCHEMA_PATH, loadDigestSchema } from "./sections.js";
import { SynthesisError, synthesizeDigest, type DigestModel } from "./synthesis.js";

export type MainDeps = {
  clock?: () => Date;
  baseDir?: string;
  fsLike?: Pick<typeof fs.promises, "access" | "stat" | "readFile" | "writeFile" | "mkdir">;
  model?: DigestModel;
};

type CliArgs = {
  inputPath: string;
  ledgerOnly: boolean;
};

export async function main(
  argv: string[],
  stdout: Writable,
  stderr: Writable,
  deps: MainDeps = {},
): Promise<number> {
  const cliArgs = parseCliArgs(argv);

  if (cliArgs instanceof Error) {
    stderr.write(`${cliArgs.message}\n`);

    return 1;
  }

  const { inputPath, ledgerOnly } = cliArgs;
  const clock = deps.clock ?? defaultClock;
  const baseDir = deps.baseDir ?? path.join(os.homedir(), ".session-digests");
  const fsLike = deps.fsLike ?? fs.promises;
  const sourcePath = path.resolve(inputPath);

  try {
    await validateInputPath(sourcePath, fsLike);
    const parsedSession = await parseSessionRecords(sourcePath, fsLike);
    await fsLike.mkdir(baseDir, { recursive: true });
    const settings = await loadSettings(baseDir, fsLike);
    const nowUtc = clock();
    const artifactPaths = computeArtifactPaths(sourcePath, nowUtc, baseDir);
    await (ledgerOnly
      ? assertLedgerPathAvailable(artifactPaths, fsLike)
      : assertArtifactPathsAvailable(artifactPaths, fsLike));
    const ledger = compileLedger(parsedSession, { maxModelContextBytes: settings.modelContextMaxBytes });

    if (ledgerOnly) {
      await writeLedger(artifactPaths.ledgerPath, ledger, fsLike);
      stdout.write(`${artifactPaths.ledgerPath}\n`);

      return 0;
    }

    const config = await loadConfig(baseDir, fsLike);
    const digestSchemaPath = config.digestSchemaPath ?? DEFAULT_DIGEST_SCHEMA_PATH;
    const digestSchema = await loadDigestSchema(digestSchemaPath, fsLike);
    await writeLedger(artifactPaths.ledgerPath, ledger, fsLike);
    const ledgerBytes = await measureLedgerBytes(artifactPaths.ledgerPath, fsLike);
    const model = deps.model ?? defaultChatModel(config);
    const sections = await synthesizeDigest({ model, modelContext: ledger.model_context, schema: digestSchema })
      .catch((error: unknown) => {
        if (error instanceof Error) {
          throw new SynthesisError(`${error.message}; ledger retained at ${artifactPaths.ledgerPath}`);
        }

        throw error;
      });
    const digest = assembleDigest({
      compressor_strategy: ledger.compressor_strategy,
      compressor_version: ledger.compressor_version,
      digest_schema_path: digestSchemaPath,
      digest_schema_version: digestSchema.version,
      title: "Session Digest",
      source_path: sourcePath,
      provider: config.provider,
      model: config.model,
      generated_at: nowUtc,
      ledger_path: artifactPaths.ledgerPath,
      source_bytes: parsedSession.source.bytes,
      source_records: parsedSession.source.records,
      ledger_bytes: ledgerBytes,
      model_context_bytes: ledger.model_context.bytes,
    }, sections, digestSchema);

    await writeDigest(artifactPaths.digestPath, digest, fsLike);
    stdout.write(`${artifactPaths.digestPath}\n`);
  } catch (error) {
    if (
      error instanceof InputError
      || error instanceof ConfigError
      || error instanceof ArtifactCollisionError
      || error instanceof ModelContextBudgetError
      || error instanceof SynthesisError
    ) {
      stderr.write(`${error.message}\n`);

      return 1;
    }

    if (error instanceof Error) {
      stderr.write(`${error.message}\n`);

      return 1;
    }

    throw error;
  }

  return 0;
}

function parseCliArgs(argv: string[]): CliArgs | Error {
  if (argv.length === 2 && argv[0] === "--ledger-only") {
    return { inputPath: argv[1] ?? "", ledgerOnly: true };
  }

  if (argv.length !== 1) {
    return new Error("Expected exactly one session JSONL path.");
  }

  if (argv[0]?.startsWith("-")) {
    return new Error("Flags are not supported. Pass exactly one session JSONL path.");
  }

  return { inputPath: argv[0] ?? "", ledgerOnly: false };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2), process.stdout, process.stderr);
}
