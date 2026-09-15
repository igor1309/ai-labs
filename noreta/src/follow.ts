import { oldestFirst } from "./ordering.js";

// What following pushes: the records the sources handed over, so a caller keeps
// its own records through the call, and undefined when the sources hold no
// session of that id. The transcript comes oldest first.
export type FollowedSession<Session, Entry> = {
  session: Session | undefined;
  transcript: Entry[];
};

// "The sources may have changed" — implemented by a filesystem watcher or a
// poller. Following pushes a fresh view on each signal, so the reader never has
// to ask. Subscribing hands back the way to stop.
export type SessionChanges = (onChange: () => void) => () => void;

// What following reads of a session and an entry, and nothing besides: the id
// it was asked to follow, and when each entry happened. Whatever else a source
// keeps comes back untouched in what is pushed.
export function followSession<Session extends { id: string }, Entry extends { at: Date }>(
  sessions: () => Session[],
  transcripts: (sessionId: string) => Entry[],
  sessionId: string,
  changes: SessionChanges,
  onUpdate: (followed: FollowedSession<Session, Entry>) => void,
): () => void {
  const push = (): void =>
    onUpdate({
      session: sessions().find((session) => session.id === sessionId),
      transcript: oldestFirst(transcripts(sessionId)),
    });

  push();

  return changes(push);
}
