// The states a source can report that this list has a word for. Its own list,
// not a source's: a source reporting fewer of them is printed by the same call,
// and one reporting a state absent here fails to compile where its sessions are
// handed over rather than reaching the list unworded.
type ReportedState =
  | "working"
  | "waiting"
  | "waiting-for-input"
  | "waiting-for-approval"
  | "idle";

// What this list reads of a session, and nothing besides. The record is this
// module's own: a source hands over whatever it keeps, and a session is
// printable when it carries these.
type PrintedSession = {
  agent: string;
  branch?: string;
  workspace: string;
  runtimeState?: ReportedState;
  lastActivityAt: Date;
};

export function sessionLines(sessions: PrintedSession[]): string[] {
  return sessions.map((session) => {
    // The marker and the word are one reading of the same field: a session with
    // no state gets no marker, which is the absence `inactive` spells out.
    const word = state(session);

    return `${word === "inactive" ? " " : "*"} ${session.agent}  ${word}  ${session.branch ?? "-"}  ${session.workspace}  ${session.lastActivityAt.toISOString()}`;
  });
}

// The words this list prints, which are its own and not the states it reads:
// the three waiting kinds read as one, because the list says a session is
// blocked and not what on, and a session with no state gets `inactive` — the
// column has to say something, and the reader wants a word rather than a gap.
type Word = "working" | "waiting" | "idle" | "inactive";

// Every state is spelled out rather than printed as it comes, so a state added
// to `ReportedState` reaches the `never` below and fails the build instead of
// reaching the list as a word nobody chose. A state a source adds that this
// list has no word for never gets here at all: it fails where its sessions are
// handed over.
function state({ runtimeState }: Pick<PrintedSession, "runtimeState">): Word {
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
