import { readTranscript, type TranscriptEntry, type TranscriptSource } from "./transcript.js";

// What following pushes: the record the source handed over, so a caller keeps
// its own record through the call, and undefined when the sources hold no
// session of that id.
export type FollowedSession<Session> = {
  session: Session | undefined;
  transcript: TranscriptEntry[];
};

// "The sources may have changed" — implemented by a filesystem watcher or a
// poller. Following pushes a fresh view on each signal, so the reader never has
// to ask. Subscribing hands back the way to stop.
export type SessionChanges = (onChange: () => void) => () => void;

// What following reads of a session, and nothing besides: the id it was asked
// to follow. Whatever else a source keeps comes back untouched in what is
// pushed.
export function followSession<Session extends { id: string }>(
  sessions: () => Session[],
  transcripts: TranscriptSource,
  sessionId: string,
  changes: SessionChanges,
  onUpdate: (followed: FollowedSession<Session>) => void,
): () => void {
  const push = (): void =>
    onUpdate({
      session: sessions().find((session) => session.id === sessionId),
      transcript: readTranscript(transcripts, sessionId),
    });

  push();

  return changes(push);
}
