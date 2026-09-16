type SearchableSession = {
  id: string;
  agent: string;
  repository?: string;
  branch?: string;
};

type SearchedEntry = { kind: string; text?: string };

type SearchedTranscripts = (sessionId: string) => SearchedEntry[];

export type SearchResults<Session> = {
  matches: Session[];
  unreadable: string[];
};

export function searchSessions<Session extends SearchableSession>(
  sessions: Session[],
  transcripts: SearchedTranscripts,
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

function wasSpokenIn(
  transcripts: SearchedTranscripts,
  sessionId: string,
  wanted: string,
): boolean {
  return transcripts(sessionId).some(
    (entry) =>
      entry.kind === "message" &&
      entry.text !== undefined &&
      entry.text.toLowerCase().includes(wanted),
  );
}
