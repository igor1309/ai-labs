import { viewSessions, type SessionSource, type SessionView } from "./sessions.js";
import { readTranscript } from "./transcript.js";
import type { TranscriptEntry, TranscriptSource } from "./transcript.js";

export type FollowedSession = {
  session: SessionView | undefined;
  transcript: TranscriptEntry[];
};

export function followSession(
  sessions: SessionSource,
  transcripts: TranscriptSource,
  sessionId: string,
): () => FollowedSession {
  return () => ({
    session: viewSessions(sessions).find((view) => view.id === sessionId),
    transcript: readTranscript(transcripts, sessionId),
  });
}
