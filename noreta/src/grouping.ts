import type { SessionView } from "./sessions.js";

export type GroupBy = "repository" | "workspace" | "agent";

// `name` is absent when the sessions in the group have no such context — they
// still form a group, because every session belongs to exactly one. Naming that
// group is the reader's job, not this module's.
export type SessionGroup = {
  name: string | undefined;
  sessions: SessionView[];
};

export function groupSessions(sessions: SessionView[], by: GroupBy): SessionGroup[] {
  const groups = new Map<string | undefined, SessionView[]>();

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
