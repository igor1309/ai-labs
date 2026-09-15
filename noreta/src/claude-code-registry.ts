import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import type { RuntimeStates } from "./claude-code.js";
import type { RuntimeState } from "./sessions.js";

// Claude Code registers each running session as `<pid>.json` under
// `~/.claude/sessions`. The file is the claim that the session is running; its
// `status` says what the session is doing.
// What the registry can say. Claude Code writes `busy`, `waiting` or `idle` and
// never which answer a waiting session wants, so the two waiting kinds the
// domain knows about are not reachable from here. Drawn from `RuntimeState` so
// these stay the domain's states, not a parallel vocabulary.
type ObservedState = Extract<RuntimeState, "working" | "waiting" | "idle">;

export function claudeCodeRuntimeStates(registryDirectory: string): RuntimeStates {
  const states = new Map<string, ObservedState>();

  for (const [sessionId, state] of registrations(registryDirectory)
    .filter(isRunning)
    .map(asState)) {
    states.set(sessionId, busier(states.get(sessionId), state));
  }

  return (sessionId: string): RuntimeState | undefined => states.get(sessionId);
}

// Two live processes can register the same session — one resumed in another
// window — and nothing on disk says which is the real one. Report the busiest:
// over-reporting that a session wants attention costs a glance, under-reporting
// it costs a stall.
function busier(
  known: ObservedState | undefined,
  state: ObservedState,
): ObservedState {
  return known !== undefined && activity[known] < activity[state] ? known : state;
}

// Lower is more active. Exhaustive over the states this reads, so one of them
// cannot go unranked and silently sort last.
const activity: Record<ObservedState, number> = {
  working: 0,
  waiting: 1,
  idle: 2,
};

type Registration = {
  pid: number;
  sessionId: string;
  status?: string;
};

// The registration outlives the process it names when a session dies without
// cleaning up. Signal 0 asks whether the process exists without touching it.
function isRunning(registration: Registration): boolean {
  try {
    process.kill(registration.pid, 0);

    return true;
  } catch {
    return false;
  }
}

function asState(registration: Registration): [string, ObservedState] {
  return [registration.sessionId, runtimeState(registration.status)];
}

// Claude Code's own three statuses. `waiting` carries no kind: the registry
// records a free-text `waitingFor` whose commonest value covers both permission
// prompts and plain questions, so nothing here can tell input from approval.
// Anything else, including a registration that never wrote a status, is running
// without a claim on what it is doing.
function runtimeState(status: string | undefined): ObservedState {
  if (status === "busy") {
    return "working";
  }

  return status === "waiting" ? "waiting" : "idle";
}

function registrations(registryDirectory: string): Registration[] {
  return readdirSync(registryDirectory)
    .filter((file) => file.endsWith(".json"))
    .map((file) => JSON.parse(readFileSync(join(registryDirectory, file), "utf8")) as Registration);
}
