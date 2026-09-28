import { appendFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { RuntimeEvent, TurnResult } from "./runtime.js";

// File-backed run record: `.agister/runs/<run-id>/`
//   run.json         identities, inputs and final outcome (rewritten on finish)
//   events.jsonl     normalized events with an Agister-owned sequence
//   provider.jsonl   raw provider stream, verbatim
//
// Events are appended synchronously so a crash leaves every observed event on
// disk. The Agister run ID, the provider session ID, the process and the
// workspace are recorded as separate identities.

export interface RunRecord {
  schema: "agister.run/v1alpha1";
  id: string;
  process: string;
  agent: string;
  runtime: string;
  workspace: string;
  createdAt: string;
  finishedAt?: string;
  requestedSessionId?: string;
  inputs: Record<string, unknown>;
  result?: TurnResult;
  output?: unknown;
}

export interface RunHandle {
  readonly id: string;
  readonly directory: string;
  event(event: RuntimeEvent): void;
  raw(line: string): void;
  finish(result: TurnResult, output?: unknown): RunRecord;
}

export function runsDirectory(stateDirectory: string): string {
  return join(stateDirectory, "runs");
}

export function createRun(
  stateDirectory: string,
  record: Omit<RunRecord, "schema" | "createdAt">,
  now: () => Date = () => new Date(),
): RunHandle {
  const directory = join(runsDirectory(stateDirectory), record.id);
  mkdirSync(directory, { recursive: true });

  const run: RunRecord = { schema: "agister.run/v1alpha1", ...record, createdAt: now().toISOString() };
  const runPath = join(directory, "run.json");
  const eventsPath = join(directory, "events.jsonl");
  const providerPath = join(directory, "provider.jsonl");
  let sequence = 0;

  writeFileSync(runPath, JSON.stringify(run, null, 2) + "\n", { flag: "wx" });
  const append = (event: RuntimeEvent) => {
    sequence += 1;
    appendFileSync(eventsPath, JSON.stringify({ seq: sequence, at: now().toISOString(), ...event }) + "\n");
  };
  append({ source: "adapter", kind: "RUN_CREATED", data: { process: run.process, agent: run.agent } });

  return {
    id: run.id,
    directory,
    event: append,
    raw: (line) => appendFileSync(providerPath, line + "\n"),
    finish(result, output) {
      run.finishedAt = now().toISOString();
      run.result = result;
      if (output !== undefined) run.output = output;
      append({ source: "adapter", kind: "RUN_FINISHED", data: { outcome: result.outcome, reason: result.reason } });
      writeFileSync(runPath, JSON.stringify(run, null, 2) + "\n");
      return run;
    },
  };
}

export function readRun(stateDirectory: string, id: string): RunRecord {
  const path = join(runsDirectory(stateDirectory), id, "run.json");
  try {
    return JSON.parse(readFileSync(path, "utf8")) as RunRecord;
  } catch {
    throw new Error(`run not found: ${id}`);
  }
}

export function listRuns(stateDirectory: string): RunRecord[] {
  let ids: string[];
  try {
    ids = readdirSync(runsDirectory(stateDirectory));
  } catch {
    return [];
  }
  return ids
    .flatMap((id) => {
      try {
        return [readRun(stateDirectory, id)];
      } catch {
        return [];
      }
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

// Sortable, human-scannable run ID: UTC timestamp plus a random suffix.
export function newRunId(now: Date, random: () => string): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  return `${stamp}-${random().slice(0, 6)}`;
}
