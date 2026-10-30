import type { Work } from "./coloring/index.ts";

export type ColoringRecord = Readonly<{ document: Work; thumbnail: Blob }>;
export type ColoringCollection = {
  works: ColoringRecord[];
  unavailable: IDBValidKey[];
  // An unreadable row may hold a reward; never present a partial count as a best.
  completedCount: number | null;
};
type WorkValidation = {
  readWork(value: unknown): Work;
  isEmpty(work: Work): boolean;
};

export function indexedColoringWorks(factory: Pick<IDBFactory, "open">, name: string, model: WorkValidation) {
  if (typeof factory?.open !== "function" || !name || typeof model?.readWork !== "function" || typeof model?.isEmpty !== "function") {
    throw new Error("Coloring storage requires a database factory, name and work validation");
  }
  let connection: Promise<IDBDatabase> | undefined;
  function open(): Promise<IDBDatabase> {
    if (!connection) {
      const pending = new Promise<IDBDatabase>((resolve, reject) => {
        const request = factory.open(name, 1);
        let blocked = false;
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains("works")) request.result.createObjectStore("works");
        };
        request.onerror = () => reject(request.error ?? new Error("Coloring database unavailable"));
        request.onblocked = () => { blocked = true; reject(new Error("Coloring database blocked by another window")); };
        request.onsuccess = () => {
          const db = request.result;
          if (blocked) { db.close(); return; }
          db.onversionchange = () => { db.close(); connection = undefined; };
          db.onclose = () => { connection = undefined; };
          resolve(db);
        };
      });
      connection = pending.catch(error => { connection = undefined; throw error; });
    }
    return connection;
  }
  function readRecord(value: unknown, key: IDBValidKey): ColoringRecord {
    if (!value || typeof value !== "object" || !("document" in value) || !("thumbnail" in value) ||
        !(value.thumbnail instanceof Blob) || value.thumbnail.type !== "image/png" || !value.thumbnail.size) {
      throw new Error("Damaged coloring thumbnail");
    }
    const document = model.readWork(value.document);
    if (document.id !== key) throw new Error("Coloring work identity mismatch");
    return Object.freeze({ document, thumbnail: value.thumbnail });
  }
  return {
    async list(): Promise<ColoringCollection> {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("works", "readonly");
        const works: ColoringRecord[] = [], unavailable: IDBValidKey[] = [];
        const request = tx.objectStore("works").openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          try { works.push(readRecord(cursor.value, cursor.key)); }
          catch { unavailable.push(cursor.key); }
          cursor.continue();
        };
        tx.oncomplete = () => resolve({ works, unavailable,
          completedCount: unavailable.length ? null : works.filter(work => work.document.completed).length });
        tx.onabort = () => reject(tx.error ?? new Error("Coloring read aborted"));
        tx.onerror = () => {};
      });
    },
    async write(record: ColoringRecord, expected: number | null): Promise<void> {
      const safe = readRecord(record, record.document.id);
      if (expected !== null && (!Number.isSafeInteger(expected) || expected < 0)) throw new Error("Invalid expected coloring revision");
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("works", "readwrite");
        const store = tx.objectStore("works");
        let failure: unknown;
        // A cursor distinguishes a missing key from an existing, corrupt undefined value.
        const request = store.openCursor(safe.document.id);
        request.onsuccess = () => {
          try {
            const cursor = request.result;
            const previous = cursor ? readRecord(cursor.value, cursor.key).document : null;
            if ((previous?.revision ?? null) !== expected || (previous && safe.document.revision <= previous.revision)) {
              throw new Error("Stored coloring work changed; reopen before saving");
            }
            if (previous?.completed && !safe.document.completed) throw new Error("A coloring reward cannot be removed");
            if (!previous?.completed && safe.document.completed && model.isEmpty(safe.document)) throw new Error("Empty coloring work cannot complete");
            if (!previous && model.isEmpty(safe.document)) throw new Error("An empty new work is not saved");
            store.put(safe, safe.document.id);
          } catch (error) { failure = error; tx.abort(); }
        };
        // Request success is provisional: document, thumbnail and reward commit together.
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(failure ?? tx.error ?? new Error("Coloring save aborted"));
        tx.onerror = () => {};
      });
    },
    async close(): Promise<void> {
      const current = connection;
      connection = undefined;
      if (current) (await current).close();
    }
  };
}
