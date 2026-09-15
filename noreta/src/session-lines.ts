import { isActive, type SessionView } from "./sessions.js";

export function sessionLines(sessions: SessionView[]): string[] {
  return sessions.map(
    (session) =>
      `${isActive(session) ? "*" : " "} ${session.agent}  ${state(session)}  ${session.branch ?? "-"}  ${session.workspace}  ${session.lastActivityAt.toISOString()}`,
  );
}

// The words this list prints, which are its own and not the states it reads:
// the three waiting kinds read as one, because the list says a session is
// blocked and not what on, and a session with no state gets `inactive` — the
// column has to say something, and the reader wants a word rather than a gap.
type Word = "working" | "waiting" | "idle" | "inactive";

// Every state is spelled out rather than printed as it comes, so a state added
// to the union reaches the `never` below and fails the build instead of
// reaching the list as a word nobody chose.
function state({ runtimeState }: SessionView): Word {
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
