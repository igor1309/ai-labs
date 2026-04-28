import { randomBytes as cryptoRandomBytes } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { RuntimeFailure } from "./errors.js";

const MUTABLE_METADATA_FIELDS = new Set(["endTime", "exitCode", "status"]);

export async function createRun(options = {}) {
  const homeDirectory = options.homeDirectory ?? homedir();
  const clock = options.clock ?? (() => new Date());
  const randomBytes = options.randomBytes ?? cryptoRandomBytes;
  const now = clock();
  const runId = createRunId({ clock: () => now, randomBytes });
  const runDirectory = join(homeDirectory, ".regentara", "runs", runId);
  const startedAt = now.toISOString();

  await mkdir(runDirectory, { recursive: true });
  await writeMetadata(runDirectory, {
    runId,
    startedAt,
    status: "running",
  });

  return {
    runDirectory,
    runId,
  };
}

export function createRunId(options = {}) {
  const clock = options.clock ?? (() => new Date());
  const randomBytes = options.randomBytes ?? cryptoRandomBytes;
  const timestamp = formatUtcTimestamp(clock());
  const suffix = randomSuffix(randomBytes);

  return `${timestamp}-${suffix}`;
}

export async function updateRunMetadata(runDirectory, updates) {
  const updateKeys = Object.keys(updates);
  const unsupportedKey = updateKeys.find((key) => !MUTABLE_METADATA_FIELDS.has(key));

  if (unsupportedKey) {
    throw new RuntimeFailure(`run metadata field is immutable: ${unsupportedKey}`);
  }

  const metadata = JSON.parse(await readFile(metadataPath(runDirectory), "utf8"));
  await writeMetadata(runDirectory, {
    ...metadata,
    ...updates,
  });
}

export async function readRunMetadata(runDirectory) {
  return JSON.parse(await readFile(metadataPath(runDirectory), "utf8"));
}

export async function appendRunEvent(runDirectory, event) {
  await appendFile(eventLogPath(runDirectory), `${JSON.stringify(event)}\n`);
}

function formatUtcTimestamp(date) {
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");

  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

function metadataPath(runDirectory) {
  return join(runDirectory, "metadata.json");
}

function eventLogPath(runDirectory) {
  return join(runDirectory, "events.jsonl");
}

function randomSuffix(randomBytes) {
  const bytes = randomBytes(5);
  const value = BigInt(`0x${Buffer.from(bytes).toString("hex")}`);

  return value.toString(36).padStart(8, "0").slice(-8);
}

async function writeMetadata(runDirectory, metadata) {
  await writeFile(metadataPath(runDirectory), `${JSON.stringify(metadata, null, 2)}\n`);
}
