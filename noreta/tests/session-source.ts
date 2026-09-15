import {
  isActive,
  isWaiting,
  type ObservedSession,
  type SessionSource,
  type SessionView,
} from "../src/sessions.js";

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

// Reads a view the way a scenario about active/waiting state talks about it,
// leaving out everything those scenarios do not name.
export function stateOf(view: SessionView): { id: string; active: boolean; waiting: boolean } {
  return { id: view.id, active: isActive(view), waiting: isWaiting(view) };
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
