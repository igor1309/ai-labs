import { isActive, type SessionView } from "./sessions.js";

export function sessionLines(sessions: SessionView[]): string[] {
  return sessions.map(
    (session) =>
      `${isActive(session) ? "*" : " "} ${session.agent}  ${state(session)}  ${session.branch ?? "-"}  ${session.workspace}  ${session.lastActivityAt.toISOString()}`,
  );
}

// The three waiting kinds read as one word: the list says a session is blocked,
// not what on. Every other running state is its own word, and a session that is
// not running has none. Every state is spelled out rather than printed as it
// comes, so a state added to the union reaches the `never` below and fails the
// build instead of reaching the list as a word nobody chose.
function state({ runtimeState }: SessionView): string {
  switch (runtimeState) {
    case undefined:
      return "inactive";
    case "working":
      return "working";
    case "waiting":
    case "waiting-for-input":
    case "waiting-for-approval":
      return "waiting";
    case "idle":
      return "idle";
    default: {
      const unworded: never = runtimeState;

      throw new Error(`no word for runtime state ${String(unworded)}`);
    }
  }
}
