// The order a reader sees a transcript in, which its caller puts on it —
// `follow.ts` calls this same function. Applied where a scenario reads a
// session's history.
export { oldestFirst } from "../src/ordering.js";

// What a scenario's transcript entry carries. Its own record, like the modules
// it is handed to: nothing here follows a particular source's record.
export type ScenarioEntry =
  | { kind: "message"; at: Date; role: "user" | "agent"; text: string }
  | { kind: "tool-call"; at: Date; name: string }
  | { kind: "file-diff"; at: Date; path: string; diff: string };

export type ScenarioTranscript = (sessionId: string) => ScenarioEntry[];

// A message reads as its text; anything else reads as its kind.
export function describeEntry(entry: ScenarioEntry): string {
  return entry.kind === "message" ? entry.text : entry.kind;
}

export function transcriptOf(
  sessionId: string,
  entries: ScenarioEntry[],
): ScenarioTranscript {
  return (requested) => (requested === sessionId ? entries : []);
}

// How a transcript that cannot be read actually fails: the file is gone, the
// user cannot open it, or the path is a directory. A bare `Error` is not one of
// these, so a test about an unreadable transcript has to throw a real one.
export function filesystemError(code: string): NodeJS.ErrnoException {
  const error: NodeJS.ErrnoException = new Error(`${code}: transcript unreadable`);

  error.code = code;

  return error;
}

export function changingTranscript(
  sessionId: string,
  entries: ScenarioEntry[],
): { read: ScenarioTranscript; append: (entry: ScenarioEntry) => void } {
  let current = [...entries];

  return {
    read: (requested) => (requested === sessionId ? current : []),
    append: (entry) => {
      current = [...current, entry];
    },
  };
}
