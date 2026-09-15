import type { SessionView } from "./sessions.js";

export function sessionLines(sessions: SessionView[]): string[] {
  return sessions.map(
    (session) =>
      `${session.active ? "*" : " "} ${session.agent}  ${state(session)}  ${session.branch ?? "-"}  ${session.workspace}  ${session.lastActivityAt.toISOString()}`,
  );
}

function state(session: SessionView): string {
  if (session.waiting) {
    return "waiting";
  }

  return session.active ? "active" : "inactive";
}
