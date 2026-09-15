import { byTime } from "./ordering.js";

// A source can know a session is blocked without knowing what on: Claude Code's
// registry reports that it is waiting and never which answer it wants. `waiting`
// is that case, kept distinct from the two kinds rather than guessing one.
export type RuntimeState =
  | "working"
  | "waiting"
  | "waiting-for-input"
  | "waiting-for-approval"
  | "idle";

export type ObservedSession = {
  id: string;
  agent: string;
  // Where the session is working: its directory, which for a worktree is the
  // worktree's own path rather than the repository root. A deleted worktree
  // keeps its path — the session stays associated with where it ran — and is
  // reported as gone rather than collapsed into the repository root.
  workspace: string;
  workspaceOnDisk: boolean;
  // Present when that directory is in a repository, and when that repository
  // has a branch checked out.
  repository?: string;
  branch?: string;
  runtimeState?: RuntimeState;
  lastActivityAt: Date;
};

export type SessionSource = () => ObservedSession[];

export type SessionView = {
  id: string;
  agent: string;
  workspace: string;
  workspaceOnDisk: boolean;
  repository?: string;
  branch?: string;
  runtimeState?: RuntimeState;
  lastActivityAt: Date;
};

// Whether a session is running, and whether it is blocked, are readings of the
// state its source reported rather than facts beside it. As functions they
// cannot drift from `runtimeState`; as fields they could.
export function isActive(session: Pick<SessionView, "runtimeState">): boolean {
  return session.runtimeState !== undefined;
}

export function isWaiting(session: Pick<SessionView, "runtimeState">): boolean {
  return (
    session.runtimeState === "waiting" ||
    session.runtimeState === "waiting-for-input" ||
    session.runtimeState === "waiting-for-approval"
  );
}

export function viewSessions(source: SessionSource): SessionView[] {
  return source()
    .map((session) => ({
      id: session.id,
      agent: session.agent,
      workspace: session.workspace,
      workspaceOnDisk: session.workspaceOnDisk,
      ...(session.repository === undefined ? {} : { repository: session.repository }),
      ...(session.branch === undefined ? {} : { branch: session.branch }),
      ...(session.runtimeState === undefined ? {} : { runtimeState: session.runtimeState }),
      lastActivityAt: session.lastActivityAt,
    }))
    .sort(byTime((view) => view.lastActivityAt, "newest-first"));
}

// How far back the default view reaches. The cutoff is a view choice, not a
// retention rule: nothing is dropped, it is only left out of this list.
export type Recency = { now: Date; withinDays: number };

export function recentSessions(sessions: SessionView[], recency: Recency): SessionView[] {
  return sessions.filter((session) => belongsInDefaultView(session, recency));
}

// The complement of `recentSessions` over the same list, derived from the same
// predicate so the two cannot drift apart: nothing is dropped by the cutoff, it
// is only held back until asked for.
export function olderSessions(sessions: SessionView[], recency: Recency): SessionView[] {
  return sessions.filter((session) => !belongsInDefaultView(session, recency));
}

// An active session belongs there however old its last activity: it is running
// now, whatever its transcript last said.
function belongsInDefaultView(session: SessionView, recency: Recency): boolean {
  return isActive(session) || isRecent(session, recency);
}

export function activeSessions(sessions: SessionView[]): SessionView[] {
  return sessions.filter(isActive);
}

function isRecent(session: SessionView, { now, withinDays }: Recency): boolean {
  const age = now.getTime() - session.lastActivityAt.getTime();

  return age <= withinDays * millisecondsPerDay;
}

const millisecondsPerDay = 24 * 60 * 60 * 1000;
