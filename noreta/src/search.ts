import { viewSessions, type SessionSource, type SessionView } from "./sessions.js";
import type { TranscriptSource } from "./transcript.js";

export function searchSessions(
  sessions: SessionSource,
  transcripts: TranscriptSource,
  query: string,
): SessionView[] {
  const wanted = query.toLowerCase();

  return viewSessions(sessions).filter(
    (session) =>
      contextMatches(session, wanted) || wasSpokenIn(transcripts, session.id, wanted),
  );
}

function contextMatches(session: SessionView, wanted: string): boolean {
  return [session.agent, session.repository, session.branch].some(
    (context) => context !== undefined && context.toLowerCase().includes(wanted),
  );
}

// Only reached when the session's context did not already match, so a session
// findable by its repository stays findable when its transcript cannot be read.
// Read straight from the source: matching does not care about order.
function wasSpokenIn(
  transcripts: TranscriptSource,
  sessionId: string,
  wanted: string,
): boolean {
  return transcripts(sessionId).some(
    (entry) => entry.kind === "message" && entry.text.toLowerCase().includes(wanted),
  );
}
