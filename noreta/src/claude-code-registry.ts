import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import type { RuntimeStates } from "./claude-code.js";
import type { RuntimeState } from "./sessions.js";

// Claude Code registers each running session as `<pid>.json` under
// `~/.claude/sessions`. The file is the claim that the session is running; its
// `status` says what the session is doing.
export function claudeCodeRuntimeStates(registryDirectory: string): RuntimeStates {
  const states = new Map(registrations(registryDirectory).filter(isRunning).map(asState));

  return (sessionId: string): RuntimeState | undefined => states.get(sessionId);
}

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

function asState(registration: Registration): [string, RuntimeState] {
  return [registration.sessionId, runtimeState(registration.status)];
}

// Claude Code's own three statuses. `waiting` carries no kind: the registry
// records a free-text `waitingFor` whose commonest value covers both permission
// prompts and plain questions, so nothing here can tell input from approval.
// Anything else, including a registration that never wrote a status, is running
// without a claim on what it is doing.
function runtimeState(status: string | undefined): RuntimeState {
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
