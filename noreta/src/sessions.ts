export type RuntimeState =
  | "working"
  | "waiting-for-input"
  | "waiting-for-approval"
  | "idle";

export type ObservedSession = {
  id: string;
  runtimeState?: RuntimeState;
  lastActivityAt?: Date;
};

export type SessionSource = () => ObservedSession[];

export type SessionView = {
  id: string;
  active: boolean;
  waiting: boolean;
  lastActivityAt?: Date;
};

export function viewSessions(source: SessionSource): SessionView[] {
  return source()
    .map((session) => ({
      id: session.id,
      active: session.runtimeState !== undefined,
      waiting: isWaiting(session.runtimeState),
      ...(session.lastActivityAt === undefined
        ? {}
        : { lastActivityAt: session.lastActivityAt }),
    }))
    .sort(byMostRecentActivity);
}

function byMostRecentActivity(left: SessionView, right: SessionView): number {
  return activityTime(right) - activityTime(left);
}

function activityTime(view: SessionView): number {
  return view.lastActivityAt?.getTime() ?? 0;
}

function isWaiting(runtimeState: RuntimeState | undefined): boolean {
  return runtimeState === "waiting-for-input" || runtimeState === "waiting-for-approval";
}
