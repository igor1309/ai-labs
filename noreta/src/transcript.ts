import { byTime } from "./ordering.js";

export type TranscriptEntry =
  | { kind: "message"; at: Date; role: "user" | "agent"; text: string }
  | { kind: "tool-call"; at: Date; name: string }
  | { kind: "file-diff"; at: Date; path: string; diff: string };

export type TranscriptSource = (sessionId: string) => TranscriptEntry[];

export function readTranscript(
  source: TranscriptSource,
  sessionId: string,
): TranscriptEntry[] {
  return [...source(sessionId)].sort(byTime((entry) => entry.at, "oldest-first"));
}


