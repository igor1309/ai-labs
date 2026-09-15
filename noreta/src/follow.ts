import { viewSessions, type SessionSource, type SessionView } from "./sessions.js";
import { readTranscript, type TranscriptEntry, type TranscriptSource } from "./transcript.js";

export type FollowedSession = {
  session: SessionView | undefined;
  transcript: TranscriptEntry[];
};

// "The sources may have changed" — implemented by a filesystem watcher or a
// poller. Following pushes a fresh view on each signal, so the reader never has
// to ask. Subscribing hands back the way to stop.
export type SessionChanges = (onChange: () => void) => () => void;

export function followSession(
  sessions: SessionSource,
  transcripts: TranscriptSource,
  sessionId: string,
  changes: SessionChanges,
  onUpdate: (followed: FollowedSession) => void,
): () => void {
  const push = (): void =>
    onUpdate({
      session: viewSessions(sessions).find((view) => view.id === sessionId),
      transcript: readTranscript(transcripts, sessionId),
    });

  push();

  return changes(push);
}
