// How far back the default view reaches. The cutoff is a view choice, not a
// retention rule: nothing is dropped, it is only left out of this list.
export type Recency = { now: Date; withinDays: number };

// What the filters below read of a session, and nothing besides: when it last
// did anything. They hand back the records they were given, so a caller keeps
// its own record type through the call.
type SessionActivity = { lastActivityAt: Date };

// Whether a session is running is the caller's reading of its own record, taken
// as a predicate rather than looked up in a state this module would have to
// know the words of. A source that names its states differently, or has none,
// needs nothing here to change.
type IsActive<Session> = (session: Session) => boolean;

export function recentSessions<Session extends SessionActivity>(
  sessions: Session[],
  recency: Recency,
  isActive: IsActive<Session>,
): Session[] {
  return sessions.filter((session) => belongsInDefaultView(session, recency, isActive));
}

// The complement of `recentSessions` over the same list, derived from the same
// predicate so the two cannot drift apart: nothing is dropped by the cutoff, it
// is only held back until asked for.
export function olderSessions<Session extends SessionActivity>(
  sessions: Session[],
  recency: Recency,
  isActive: IsActive<Session>,
): Session[] {
  return sessions.filter((session) => !belongsInDefaultView(session, recency, isActive));
}

// An active session belongs there however old its last activity: it is running
// now, whatever its transcript last said.
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
