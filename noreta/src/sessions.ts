import { byTime } from "./ordering.js";

export type RuntimeState =
  | "working"
  | "waiting-for-input"
  | "waiting-for-approval"
  | "idle";

export type ObservedSession = {
  id: string;
  agent: string;
  // Present when the session's working directory is in a repository, and when
  // that repository has a branch checked out.
  repository?: string;
  branch?: string;
  runtimeState?: RuntimeState;
  lastActivityAt: Date;
};

export type SessionSource = () => ObservedSession[];

export type SessionView = {
  id: string;
  agent: string;
  repository?: string;
  branch?: string;
  active: boolean;
  waiting: boolean;
  lastActivityAt: Date;
};

export function viewSessions(source: SessionSource): SessionView[] {
  return source()
    .map((session) => ({
      id: session.id,
      agent: session.agent,
      ...(session.repository === undefined ? {} : { repository: session.repository }),
      ...(session.branch === undefined ? {} : { branch: session.branch }),
      active: session.runtimeState !== undefined,
      waiting: isWaiting(session.runtimeState),
      lastActivityAt: session.lastActivityAt,
    }))
    .sort(byTime((view) => view.lastActivityAt, "newest-first"));
}

// How far back the default view reaches. The cutoff is a view choice, not a
// retention rule: nothing is dropped, it is only left out of this list.
export type Recency = { now: Date; withinDays: number };

export function recentSessions(source: SessionSource, recency: Recency): SessionView[] {
  return viewSessions(source).filter(
    (session) => session.active || isRecent(session, recency),
  );
}

function isRecent(session: SessionView, { now, withinDays }: Recency): boolean {
  const age = now.getTime() - session.lastActivityAt.getTime();

  return age <= withinDays * millisecondsPerDay;
}

const millisecondsPerDay = 24 * 60 * 60 * 1000;

function isWaiting(runtimeState: RuntimeState | undefined): boolean {
  return runtimeState === "waiting-for-input" || runtimeState === "waiting-for-approval";
}
