import { viewSessions, type SessionSource, type SessionView } from "./sessions.js";
import type { TranscriptSource } from "./transcript.js";

// What a search found, and which sessions it could not answer for. A session
// whose transcript could not be read is neither a match nor a miss: it is
// reported so the result set never silently loses one.
export type SearchResults = {
  matches: SessionView[];
  unreadable: string[];
};

export function searchSessions(
  sessions: SessionSource,
  transcripts: TranscriptSource,
  query: string,
): SearchResults {
  const wanted = query.toLowerCase();
  const unreadable: string[] = [];

  const matches = viewSessions(sessions).filter((session) => {
    if (contextMatches(session, wanted)) {
      return true;
    }

    try {
      return wasSpokenIn(transcripts, session.id, wanted);
    } catch {
      unreadable.push(session.id);

      return false;
    }
  });

  return { matches, unreadable };
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
