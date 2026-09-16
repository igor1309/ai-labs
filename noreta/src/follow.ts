import { oldestFirst } from "./ordering.js";

export type FollowedSession<Session, Entry> = {
  session: Session | undefined;
  transcript: Entry[];
};

// "The sources may have changed" — implemented by a filesystem watcher or a
// poller. Following pushes a fresh view on each signal, so the reader never has
// to ask. Subscribing hands back the way to stop.
export type SessionChanges = (onChange: () => void) => () => void;

type FollowedSource<Session> = () => Session[];

type FollowedTranscripts<Entry> = (sessionId: string) => Entry[];

export function followSession<Session extends { id: string }, Entry extends { at: Date }>(
  sessions: FollowedSource<Session>,
  transcripts: FollowedTranscripts<Entry>,
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
