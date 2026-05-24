import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function readEvents(runDirectory) {
  try {
    const eventLog = await readFile(join(runDirectory, "events.jsonl"), "utf8");

    return eventLog
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

export function progressEventSummary(event) {
  return Object.fromEntries(Object.entries({
    agentId: event.agentId,
    currentAgent: event.currentAgent,
    currentDecision: event.currentDecision,
    failureReason: event.failureReason,
    finalStatus: event.finalStatus,
    runId: event.runId,
    type: event.type,
  }).filter(([, value]) => value !== undefined));
}
