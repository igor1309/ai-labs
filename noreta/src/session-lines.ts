type ReportedState =
  | "working"
  | "waiting"
  | "waiting-for-input"
  | "waiting-for-approval"
  | "idle";

type PrintedSession = {
  agent: string;
  branch?: string;
  workspace: string;
  runtimeState?: ReportedState;
  lastActivityAt: Date;
};

export function sessionLines(sessions: PrintedSession[]): string[] {
  return sessions.map((session) => {
    const word = state(session);

    return `${word === "inactive" ? " " : "*"} ${session.agent}  ${word}  ${session.branch ?? "-"}  ${session.workspace}  ${session.lastActivityAt.toISOString()}`;
  });
}

// A session with no state gets `inactive`: the column has to say something,
// and the reader wants a word rather than a gap.
type Word = "working" | "waiting" | "idle" | "inactive";

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
