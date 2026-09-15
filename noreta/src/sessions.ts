export type RuntimeState =
  | "working"
  | "waiting-for-input"
  | "waiting-for-approval"
  | "idle";

export type ObservedSession = {
  id: string;
  runtimeState?: RuntimeState;
};

export type SessionSource = () => ObservedSession[];

export type SessionView = {
  id: string;
  active: boolean;
  waiting: boolean;
};

export function viewSessions(source: SessionSource): SessionView[] {
  return source().map((session) => ({
    id: session.id,
    active: session.runtimeState !== undefined,
    waiting: isWaiting(session.runtimeState),
  }));
}

function isWaiting(runtimeState: RuntimeState | undefined): boolean {
  return runtimeState === "waiting-for-input" || runtimeState === "waiting-for-approval";
}
