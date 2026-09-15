import {
  isActive,
  isWaiting,
  type ObservedSession,
  type SessionSource,
} from "../src/sessions.js";

// The order a reader sees, which the list's caller puts on it — `main.ts` calls
// this same function. Applied only where a scenario is about order.
export { newestFirst } from "../src/ordering.js";

type PartialSession = Omit<
  ObservedSession,
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

export function sourceOf(...sessions: PartialSession[]): SessionSource {
  return () => sessions.map(observed);
}

// The sessions a source reports, read once, for scenarios about a list rather
// than about a source.
export function sessionsOf(...sessions: PartialSession[]): ObservedSession[] {
  return sourceOf(...sessions)();
}

export function changingSource(...sessions: PartialSession[]): {
  read: SessionSource;
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

// Reads a session the way a scenario about active/waiting state talks about it,
// leaving out everything those scenarios do not name.
export function stateOf(
  session: Pick<ObservedSession, "id" | "runtimeState">,
): { id: string; active: boolean; waiting: boolean } {
  return { id: session.id, active: isActive(session), waiting: isWaiting(session) };
}

function observed(session: PartialSession): ObservedSession {
  return {
    ...session,
    agent: session.agent ?? unspecifiedAgent,
    workspace: session.workspace ?? unspecifiedWorkspace,
    workspaceOnDisk: session.workspaceOnDisk ?? true,
    lastActivityAt: session.lastActivityAt ?? unspecifiedActivity,
  };
}
