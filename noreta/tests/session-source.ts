// The order a reader sees, which the list's caller puts on it — `composition-root.ts` calls
// this same function. Applied only where a scenario is about order.
export { newestFirst } from "../src/ordering.js";

// The states a scenario can put on a session: these tests' own words, not a
// source's. Scenarios are about a reader that tells the two waiting kinds
// apart, and no source has to be able to report every one of them.
type ScenarioState =
  | "working"
  | "waiting"
  | "waiting-for-input"
  | "waiting-for-approval"
  | "idle";

// What a scenario's session carries. Its own record, like the modules it is
// handed to: a scenario describes the session it is about, and nothing here
// follows a particular source's record.
export type ScenarioSession = {
  id: string;
  agent: string;
  workspace: string;
  workspaceOnDisk: boolean;
  repository?: string;
  branch?: string;
  runtimeState?: ScenarioState;
  lastActivityAt: Date;
};

export type ScenarioSource = () => ScenarioSession[];

type PartialSession = Omit<
  ScenarioSession,
  "agent" | "workspace" | "workspaceOnDisk" | "lastActivityAt"
> & {
  agent?: string;
  workspace?: string;
  workspaceOnDisk?: boolean;
  lastActivityAt?: Date;
};

// Scenarios that say nothing about a session's activity time or agent should
// not have to invent one. A scenario that does not say a session is running is
// about one that is not.
const unspecifiedActivity = new Date("2026-01-01T00:00:00Z");
const unspecifiedAgent = "claude";
const unspecifiedWorkspace = "/workspace";

export function sourceOf(...sessions: PartialSession[]): ScenarioSource {
  return () => sessions.map(observed);
}

// The sessions a source reports, read once, for scenarios about a list rather
// than about a source.
export function sessionsOf(...sessions: PartialSession[]): ScenarioSession[] {
  return sourceOf(...sessions)();
}

export function changingSource(...sessions: PartialSession[]): {
  read: ScenarioSource;
  replaceWith: (...next: PartialSession[]) => void;
} {
  let current = sessions;

  return {
    read: () => current.map(observed),
    replaceWith: (...next) => {
      current = next;
    },
  };
}

// How a reader of these records tells a running session from one that is not,
// which is what the list is handed — `composition-root.ts` hands it the same reading of the
// same records. As a function it cannot drift from `runtimeState`; as a field
// it could.
export function isActive(session: Pick<ScenarioSession, "runtimeState">): boolean {
  return session.runtimeState !== undefined;
}

// Reads a session the way a scenario about active/waiting state talks about it,
// leaving out everything those scenarios do not name.
export function stateOf(
  session: Pick<ScenarioSession, "id" | "runtimeState">,
): { id: string; active: boolean; waiting: boolean } {
  return { id: session.id, active: isActive(session), waiting: isWaiting(session) };
}

// Blocked, whichever way the source said so: the three waiting kinds are one
// thing to a scenario that asks whether a session needs its reader.
function isWaiting(session: Pick<ScenarioSession, "runtimeState">): boolean {
  return (
    session.runtimeState === "waiting" ||
    session.runtimeState === "waiting-for-input" ||
    session.runtimeState === "waiting-for-approval"
  );
}

function observed(session: PartialSession): ScenarioSession {
  return {
    ...session,
    agent: session.agent ?? unspecifiedAgent,
    workspace: session.workspace ?? unspecifiedWorkspace,
    workspaceOnDisk: session.workspaceOnDisk ?? true,
    lastActivityAt: session.lastActivityAt ?? unspecifiedActivity,
  };
}
