import type { ObservedSession, SessionSource, SessionView } from "../src/sessions.js";

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
// not have to invent one.
const unspecifiedActivity = new Date("2026-01-01T00:00:00Z");
const unspecifiedAgent = "claude";
const unspecifiedWorkspace = "/workspace";

export function sourceOf(...sessions: PartialSession[]): SessionSource {
  return () => sessions.map(observed);
}

export function changingSource(...sessions: PartialSession[]): {
  read: SessionSource;
  readCount: () => number;
  replaceWith: (...next: PartialSession[]) => void;
} {
  let current = sessions;
  let reads = 0;

  return {
    read: () => {
      reads += 1;

      return current.map(observed);
    },
    readCount: () => reads,
    replaceWith: (...next) => {
      current = next;
    },
  };
}

// Projects away the activity time for scenarios about active/waiting state.
export function stateOf(
  view: SessionView,
): Omit<SessionView, "agent" | "workspace" | "workspaceOnDisk" | "runtimeState" | "lastActivityAt"> {
  return { id: view.id, active: view.active, waiting: view.waiting };
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
