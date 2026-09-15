import type { SessionView } from "./sessions.js";

export function sessionLines(sessions: SessionView[]): string[] {
  return sessions.map(
    (session) =>
      `${session.active ? "*" : " "} ${session.agent}  ${state(session)}  ${session.branch ?? "-"}  ${session.workspace}  ${session.lastActivityAt.toISOString()}`,
  );
}

// The three waiting kinds read as one word: the list says a session is blocked,
// not what on. Every other running state is its own word, and a session that is
// not running has none.
function state(session: SessionView): string {
  if (session.waiting) {
    return "waiting";
  }

  return session.runtimeState ?? "inactive";
}
