import type { Work } from "./coloring/index.ts";

export type ColoringRecord = Readonly<{ document: Work; thumbnail: Blob }>;
export type ColoringCollection = {
  works: ColoringRecord[];
  unavailable: IDBValidKey[];
  recentId: string | null;
  // Unreadable reward history must never become a partial collection best.
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
  type History = { schema: 1; sequence: number; rewarded: boolean };
  type Row = { key: IDBValidKey; value: unknown };
  function history(row: Row): History {
    const value = row.value;
    if (!value || typeof value !== "object") throw new Error("Coloring history unreadable");
    if ("history" in value) {
      const entry = value.history as History;
      if (!entry || entry.schema !== 1 || !Number.isSafeInteger(entry.sequence) || entry.sequence < 1 || typeof entry.rewarded !== "boolean" || typeof row.key !== "string") {
        throw new Error("Coloring history unreadable");
      }
      return { schema: 1, sequence: entry.sequence, rewarded: entry.rewarded };
    }
    // Earlier documents kept rewards in the journal. Read them through its
    // validator; a malformed legacy journal cannot establish reward history.
    if (!("document" in value)) throw new Error("Coloring history unreadable");
    const document = model.readWork(value.document);
    if (document.id !== row.key) throw new Error("Coloring identity mismatch");
    return { schema: 1, sequence: 0, rewarded: document.rewarded };
  }
  function inspect(rows: Row[]) {
    const works: ColoringRecord[] = [], unavailable: IDBValidKey[] = [];
    const histories = new Map<IDBValidKey, History>();
    let readable = true;
    for (const row of rows) {
      let entry: History | undefined;
      try { entry = history(row); histories.set(row.key, entry); }
      catch { readable = false; }
      try {
        const record = readRecord(row.value, row.key);
        if (entry && record.document.rewarded !== entry.rewarded) { readable = false; throw new Error("Coloring reward mismatch"); }
        works.push(record);
      } catch { unavailable.push(row.key); }
    }
    works.sort((a, b) => (histories.get(b.document.id)?.sequence ?? 0) - (histories.get(a.document.id)?.sequence ?? 0));
    const ordered = [...histories].sort((a, b) => b[1].sequence - a[1].sequence);
    return { works, unavailable, histories, completedCount: readable ? ordered.filter(([, entry]) => entry.rewarded).length : null,
      recentId: typeof ordered[0]?.[0] === "string" ? ordered[0][0] : null };
  }
  function scan(store: IDBObjectStore, done: (rows: Row[]) => void) {
    const rows: Row[] = [];
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) { done(rows); return; }
      rows.push({ key: cursor.key, value: cursor.value });
      cursor.continue();
    };
  }
  return {
    async list(): Promise<ColoringCollection> {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("works", "readonly");
        let collection: ColoringCollection;
        scan(tx.objectStore("works"), rows => {
          const { works, unavailable, completedCount, recentId } = inspect(rows);
          collection = { works, unavailable, completedCount, recentId };
        });
        tx.oncomplete = () => resolve(collection);
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
        // The shared transaction orders edits across works, including windows.
        // Reward receipts remain readable independently of paint and thumbnails.
        scan(store, rows => {
          try {
            const collection = inspect(rows);
            if (collection.completedCount === null) throw new Error("Coloring history unreadable");
            const row = rows.find(row => row.key === safe.document.id);
            const previous = row ? readRecord(row.value, row.key).document : null;
            if ((previous?.revision ?? null) !== expected || (previous && safe.document.revision <= previous.revision)) {
              throw new Error("Stored coloring work changed; reopen before saving");
            }
            if (previous?.completed && !safe.document.completed) throw new Error("A coloring reward cannot be removed");
            if (!previous?.completed && safe.document.completed && model.isEmpty(safe.document)) throw new Error("Empty coloring work cannot complete");
            if (!previous && model.isEmpty(safe.document)) throw new Error("An empty new work is not saved");
            const sequence = [...collection.histories.values()].reduce((latest, entry) => Math.max(latest, entry.sequence), 0) + 1;
            if (!Number.isSafeInteger(sequence)) throw new Error("Coloring edit order exhausted");
            store.put({ ...safe, history: { schema: 1, sequence, rewarded: safe.document.rewarded } }, safe.document.id);
          } catch (error) { failure = error; tx.abort(); }
        });
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(failure ?? tx.error ?? new Error("Coloring save aborted"));
        tx.onerror = () => {};
      });
    },
    async reset(): Promise<void> {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("works", "readwrite");
        tx.objectStore("works").clear();
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error ?? new Error("Coloring reset aborted"));
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
