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
    .sort(byMostRecentActivity);
}

function isWaiting(runtimeState: RuntimeState | undefined): boolean {
  return runtimeState === "waiting-for-input" || runtimeState === "waiting-for-approval";
}

function byMostRecentActivity(left: SessionView, right: SessionView): number {
  const leftTime = activityTime(left);
  const rightTime = activityTime(right);

  if (leftTime === rightTime) {
    return 0;
  }

  return rightTime > leftTime ? 1 : -1;
}

// An unreadable timestamp sorts as the oldest rather than poisoning the
// comparator: NaN would make every comparison it takes part in meaningless.
function activityTime(view: SessionView): number {
  const time = view.lastActivityAt.getTime();

  return Number.isNaN(time) ? Number.MIN_SAFE_INTEGER : time;
}
