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
