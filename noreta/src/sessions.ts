import { byTime } from "./ordering.js";

export type RuntimeState =
  | "working"
  | "waiting-for-input"
  | "waiting-for-approval"
  | "idle";

export type ObservedSession = {
  id: string;
  runtimeState?: RuntimeState;
  lastActivityAt: Date;
};

export type SessionSource = () => ObservedSession[];

export type SessionView = {
  id: string;
  active: boolean;
  waiting: boolean;
  lastActivityAt: Date;
};

export function viewSessions(source: SessionSource): SessionView[] {
  return source()
    .map((session) => ({
      id: session.id,
      active: session.runtimeState !== undefined,
      waiting: isWaiting(session.runtimeState),
      lastActivityAt: session.lastActivityAt,
    }))
    .sort(byTime((view) => view.lastActivityAt, "newest-first"));
}

function isWaiting(runtimeState: RuntimeState | undefined): boolean {
  return runtimeState === "waiting-for-input" || runtimeState === "waiting-for-approval";
}
