import type { ObservedSession } from "./sessions.js";
import type { TranscriptSource } from "./transcript.js";

// What a search reads of a session, and nothing besides: the context it matches
// on, and the id it asks the transcript source for.
type SearchableSession = Pick<ObservedSession, "id" | "agent" | "repository" | "branch">;

// What a search found, and which sessions it could not answer for. A session
// whose transcript could not be read is neither a match nor a miss: it is
// reported so the result set never silently loses one. A match is the record
// the caller handed in, so it comes back as whatever the caller keeps.
export type SearchResults<Session> = {
  matches: Session[];
  unreadable: string[];
};

// Searches the list it is handed, like the other list functions: a caller can
// search a group or the recent list by narrowing the list first.
export function searchSessions<Session extends SearchableSession>(
  sessions: Session[],
  transcripts: TranscriptSource,
  query: string,
): SearchResults<Session> {
  const wanted = query.toLowerCase();
  const unreadable: string[] = [];

  const matches = sessions.filter((session) => {
    if (contextMatches(session, wanted)) {
      return true;
    }

    try {
      return wasSpokenIn(transcripts, session.id, wanted);
    } catch (error) {
      if (!isFilesystemFailure(error)) {
        throw error;
      }

      unreadable.push(session.id);

      return false;
    }
  });

  return { matches, unreadable };
}

// The ways a transcript's file can be out of reach: gone with the worktree that
// held it, not readable by this user, or a path that is a directory. Everything
// else a read can throw is a defect, and reporting it as an unreadable session
// would hide it behind a name in a list.
const filesystemFailures = new Set(["ENOENT", "EACCES", "EISDIR"]);

function isFilesystemFailure(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;

  return code !== undefined && filesystemFailures.has(code);
}

function contextMatches(session: SearchableSession, wanted: string): boolean {
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
