import type { TranscriptEntry, TranscriptSource } from "../src/transcript.js";

// A message reads as its text; anything else reads as its kind.
export function describeEntry(entry: TranscriptEntry): string {
  return entry.kind === "message" ? entry.text : entry.kind;
}

export function transcriptOf(
  sessionId: string,
  entries: TranscriptEntry[],
): TranscriptSource {
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
  entries: TranscriptEntry[],
): { read: TranscriptSource; append: (entry: TranscriptEntry) => void } {
  let current = [...entries];

  return {
    read: (requested) => (requested === sessionId ? current : []),
    append: (entry) => {
      current = [...current, entry];
    },
  };
}
