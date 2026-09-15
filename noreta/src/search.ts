import { viewSessions, type SessionSource, type SessionView } from "./sessions.js";
import { readTranscript, type TranscriptSource } from "./transcript.js";

export function searchSessions(
  sessions: SessionSource,
  transcripts: TranscriptSource,
  query: string,
): SessionView[] {
  const wanted = query.toLowerCase();

  return viewSessions(sessions).filter((session) =>
    searchable(session, transcripts).some((text) => text.includes(wanted)),
  );
}

function searchable(session: SessionView, transcripts: TranscriptSource): string[] {
  return [session.agent, session.repository, session.branch]
    .filter((context): context is string => context !== undefined)
    .map((context) => context.toLowerCase())
    .concat(spokenWords(transcripts, session.id));
}

function spokenWords(transcripts: TranscriptSource, sessionId: string): string[] {
  return readTranscript(transcripts, sessionId)
    .filter((entry) => entry.kind === "message")
    .map((entry) => entry.text.toLowerCase());
}
