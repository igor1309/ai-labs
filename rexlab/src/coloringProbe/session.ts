import { readWork, type RecordData, type Work } from "./model.ts";
export type SaveState = "unsaved" | "saving" | "saved" | "error";
export type Session = { work: Work; durable: number | null; state: SaveState; error: string; save(work: Work): Promise<void>; retry(): Promise<void>; settled(): Promise<void> };

export function workSession(initial: Work, durable: number | null, dependencies: {
  write(record: RecordData, expected: number | null): Promise<void>;
  thumbnail(work: Work): Promise<Blob>;
  changed(): void;
}): Session {
  let tail = Promise.resolve();
  const session: Session = {
    work: readWork(initial), durable, state: durable === initial.revision ? "saved" : "unsaved", error: "",
    save(work) {
      const snapshot = readWork(work);
      if (snapshot.id !== session.work.id || snapshot.revision < session.work.revision) throw new Error("Invalid revision order");
      session.work = snapshot; session.state = "saving"; session.error = ""; dependencies.changed();
      tail = tail.then(async () => {
        try {
          const thumbnail = await dependencies.thumbnail(snapshot);
          await dependencies.write({ document: snapshot, thumbnail }, session.durable);
          session.durable = snapshot.revision;
          if (session.work.revision === snapshot.revision) { session.state = "saved"; session.error = ""; }
        } catch (error) {
          if (session.work.revision === snapshot.revision) {
            session.state = "error"; session.error = error instanceof Error ? error.message : String(error);
          }
        }
        dependencies.changed();
      });
      return tail;
    },
    retry() { return session.state === "error" ? session.save(session.work) : tail; },
    settled() { return tail; }
  };
  return session;
}
