import { readRecord, type RecordData } from "./model.ts";

export type StoredEntry = { id: IDBValidKey; value: unknown };
export function indexedWorks(factory: Pick<IDBFactory, "open">, name: string) {
  let connection: Promise<IDBDatabase> | undefined;
  const open = () => {
    if (!connection) {
      const pending = new Promise<IDBDatabase>((resolve, reject) => {
        const request = factory.open(name, 1);
        let blocked = false;
        request.onupgradeneeded = () => request.result.createObjectStore("works");
        request.onerror = () => reject(request.error);
        request.onblocked = () => { blocked = true; reject(new Error("Database blocked by another window")); };
        request.onsuccess = () => {
          const db = request.result;
          if (blocked) { db.close(); return; }
          db.onversionchange = () => { db.close(); connection = undefined; };
          resolve(db);
        };
      });
      connection = pending.catch(error => { connection = undefined; throw error; });
    }
    return connection;
  };
  return {
    async list(): Promise<StoredEntry[]> {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("works", "readonly");
        const entries: StoredEntry[] = [];
        const request = tx.objectStore("works").openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) { entries.push({ id: cursor.key, value: cursor.value }); cursor.continue(); }
        };
        tx.oncomplete = () => resolve(entries);
        tx.onabort = () => reject(tx.error ?? new Error("Read aborted"));
        tx.onerror = () => {};
      });
    },
    async write(record: RecordData, expected: number | null): Promise<void> {
      const safe = readRecord(record, record.document.id);
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("works", "readwrite");
        const store = tx.objectStore("works");
        let failure: unknown;
        const request = store.get(safe.document.id);
        request.onsuccess = () => {
          try {
            const previous = request.result === undefined ? null : readRecord(request.result, safe.document.id).document.revision;
            if (previous !== expected || (previous !== null && safe.document.revision <= previous)) throw new Error("Stored work changed; reopen before saving");
            store.put(safe, safe.document.id);
          } catch (error) { failure = error; tx.abort(); }
        };
        // A successful put is provisional until the entire transaction commits.
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(failure ?? tx.error ?? new Error("Save aborted"));
        tx.onerror = () => {};
      });
    },
    async close() { if (connection) (await connection).close(); connection = undefined; }
  };
}
