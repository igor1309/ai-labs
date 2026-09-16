export type Recency = { now: Date; withinDays: number };

type SessionActivity = { lastActivityAt: Date };

type IsActive<Session> = (session: Session) => boolean;

export function recentSessions<Session extends SessionActivity>(
  sessions: Session[],
  recency: Recency,
  isActive: IsActive<Session>,
): Session[] {
  return sessions.filter((session) => belongsInDefaultView(session, recency, isActive));
}

export function olderSessions<Session extends SessionActivity>(
  sessions: Session[],
  recency: Recency,
  isActive: IsActive<Session>,
): Session[] {
  return sessions.filter((session) => !belongsInDefaultView(session, recency, isActive));
}

function belongsInDefaultView<Session extends SessionActivity>(
  session: Session,
  recency: Recency,
  isActive: IsActive<Session>,
): boolean {
  return isActive(session) || isRecent(session, recency);
}

export function activeSessions<Session>(
  sessions: Session[],
  isActive: IsActive<Session>,
): Session[] {
  return sessions.filter(isActive);
}

function isRecent(session: SessionActivity, { now, withinDays }: Recency): boolean {
  const age = now.getTime() - session.lastActivityAt.getTime();

  return age <= withinDays * millisecondsPerDay;
}

const millisecondsPerDay = 24 * 60 * 60 * 1000;
