export type TranscriptEntry =
  | { kind: "message"; at: Date; role: "user" | "agent"; text: string }
  | { kind: "tool-call"; at: Date; name: string }
  | { kind: "file-diff"; at: Date; path: string; diff: string };

export type TranscriptSource = (sessionId: string) => TranscriptEntry[];

export function readTranscript(
  source: TranscriptSource,
  sessionId: string,
): TranscriptEntry[] {
  return [...source(sessionId)].sort(byOldestFirst);
}

function byOldestFirst(left: TranscriptEntry, right: TranscriptEntry): number {
  const leftTime = entryTime(left);
  const rightTime = entryTime(right);

  if (leftTime === rightTime) {
    return 0;
  }

  return leftTime > rightTime ? 1 : -1;
}

// Matches the session ordering policy: an unreadable timestamp is treated as
// the oldest rather than returning NaN and poisoning every comparison.
function entryTime(entry: TranscriptEntry): number {
  const time = entry.at.getTime();

  return Number.isNaN(time) ? Number.MIN_SAFE_INTEGER : time;
}
