import type { ObservedSession } from "./sessions.js";

export type GroupBy = "repository" | "workspace" | "agent";

// What grouping reads of a session, and nothing besides: the contexts it can
// group by.
type GroupableSession = Pick<ObservedSession, GroupBy>;

// `name` is absent when the sessions in the group have no such context — they
// still form a group, because every session belongs to exactly one. Naming that
// group is the reader's job, not this module's. A group holds the records the
// caller handed in, so they come back as whatever the caller keeps.
export type SessionGroup<Session> = {
  name: string | undefined;
  sessions: Session[];
};

export function groupSessions<Session extends GroupableSession>(
  sessions: Session[],
  by: GroupBy,
): SessionGroup<Session>[] {
  const groups = new Map<string | undefined, Session[]>();

  for (const session of sessions) {
    const name = session[by];
    const group = groups.get(name);

    if (group === undefined) {
      groups.set(name, [session]);
    } else {
      // Owned by this call, so appending cannot disturb the caller's list.
      group.push(session);
    }
  }

  return [...groups].map(([name, grouped]) => ({ name, sessions: grouped }));
}
