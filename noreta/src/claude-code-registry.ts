import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { parsedRecord } from "./claude-code-files.js";

export type RegistryState = "working" | "waiting" | "idle";

export type RegistryStates = () => (sessionId: string) => RegistryState | undefined;

export function claudeCodeRegistryStates(registryDirectory: string): RegistryStates {
  return () => {
    const states = new Map<string, RegistryState>();

    for (const [sessionId, state] of registrations(registryDirectory)
      .filter(isRunning)
      .map(asState)) {
      states.set(sessionId, busier(states.get(sessionId), state));
    }

    return (sessionId: string): RegistryState | undefined => states.get(sessionId);
  };
}

function busier(
  known: RegistryState | undefined,
  state: RegistryState,
): RegistryState {
  return known !== undefined && activity[known] < activity[state] ? known : state;
}

// Lower is more active.
const activity: Record<RegistryState, number> = {
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

function asState(registration: Registration): [string, RegistryState] {
  return [registration.sessionId, registryState(registration.status)];
}

function registryState(status: string | undefined): RegistryState {
  if (status === "busy") {
    return "working";
  }

  return status === "waiting" ? "waiting" : "idle";
}

function registrations(registryDirectory: string): Registration[] {
  return registrationFiles(registryDirectory).flatMap((file) =>
    parsedRecord<Registration>(readFileSync(join(registryDirectory, file), "utf8")),
  );
}

function registrationFiles(registryDirectory: string): string[] {
  return existsSync(registryDirectory)
    ? readdirSync(registryDirectory).filter((file) => file.endsWith(".json"))
    : [];
}
