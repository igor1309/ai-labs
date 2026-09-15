import type { TranscriptEntry, TranscriptSource } from "../src/transcript.js";

export function transcriptOf(
  sessionId: string,
  entries: TranscriptEntry[],
): TranscriptSource {
  return (requested) => (requested === sessionId ? entries : []);
}
