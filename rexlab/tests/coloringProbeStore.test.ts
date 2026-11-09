import { describe, expect, it } from "vitest";
import { indexedWorks } from "../src/coloringProbe/store.ts";
import { append, newWork, type RecordData } from "../src/coloringProbe/model.ts";
import { COLORS } from "../src/coloringProbe/geometry.ts";

function signal<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}
function harness() {
  type Request = { result: unknown; error: Error | null; onsuccess?: () => void; onerror?: () => void; onupgradeneeded?: () => void; onblocked?: () => void };
  const opened = signal<void>(), requested = signal<void>();
  const open: Request = { result: undefined, error: null };
  const request: Request = { result: undefined, error: null };
  const puts: { value: unknown; key: unknown }[] = [];
  let aborted = false, closed = false;
  const tx = {
    error: null as Error | null, oncomplete: undefined as (() => void) | undefined,
    onabort: undefined as (() => void) | undefined, onerror: undefined as (() => void) | undefined,
    abort() { aborted = true; tx.onabort?.(); },
    objectStore() { return {
      get() { requested.resolve(); return request; },
      put(value: unknown, key: unknown) { puts.push({ value, key }); },
      openCursor() { requested.resolve(); return request; }
    }; }
  };
  const db = { close() { closed = true; }, transaction() { return tx; } };
  open.result = db;
  const factory = { open() { opened.resolve(); return open; } } as unknown as IDBFactory;
  return { factory, open, request, tx, puts, opened, requested, get aborted() { return aborted; }, get closed() { return closed; } };
}
function record(): RecordData {
  return { document: append(newWork("one"), { kind: "fill", color: COLORS[1], region: "body" }), thumbnail: new Blob(["png"], { type: "image/png" }) };
}
describe("IndexedDB transaction boundary", () => {
  it("acknowledges document and thumbnail together only at transaction completion", async () => {
    const spy = harness(); const store = indexedWorks(spy.factory, "test");
    let acknowledged = false;
    const saving = store.write(record(), null).then(() => { acknowledged = true; });
    await spy.opened.promise; spy.open.onsuccess!(); await spy.requested.promise;
    spy.request.onsuccess!();
    expect(spy.puts).toEqual([{ value: record(), key: "one" }]);
    expect(acknowledged).toBe(false);
    spy.tx.oncomplete!(); await saving; expect(acknowledged).toBe(true);
    await store.close(); expect(spy.closed).toBe(true);
  });
  it.each([
    { document: { ...newWork("one"), schema: 99 }, thumbnail: new Blob(["png"], { type: "image/png" }) },
    { document: { ...newWork("one"), actions: [null] }, thumbnail: null },
    { ...record(), document: { ...record().document, revision: 4 } }
  ])("aborts instead of overwriting corrupted, unsupported or externally advanced records %#", async previous => {
    const spy = harness(); const store = indexedWorks(spy.factory, "test");
    const saving = store.write(record(), null);
    const rejected = expect(saving).rejects.toThrow();
    await spy.opened.promise; spy.open.onsuccess!(); await spy.requested.promise;
    spy.request.result = previous; spy.request.onsuccess!();
    await rejected; expect(spy.aborted).toBe(true); expect(spy.puts).toEqual([]);
    await store.close();
  });
  it("rejects transaction failure even after put succeeds", async () => {
    const spy = harness(); const store = indexedWorks(spy.factory, "test");
    const saving = store.write(record(), null); const rejected = expect(saving).rejects.toThrow("Quota");
    await spy.opened.promise; spy.open.onsuccess!(); await spy.requested.promise;
    spy.request.onsuccess!(); expect(spy.puts).toHaveLength(1);
    spy.tx.error = new Error("Quota"); spy.tx.onabort!(); await rejected;
    await store.close();
  });
  it("does not present a read abort as an empty collection", async () => {
    const spy = harness(); const store = indexedWorks(spy.factory, "test");
    const listing = store.list(); const rejected = expect(listing).rejects.toThrow("Read denied");
    await spy.opened.promise; spy.open.onsuccess!(); await spy.requested.promise;
    spy.tx.error = new Error("Read denied"); spy.tx.onabort!(); await rejected;
    await store.close();
  });
  it("retries after a synchronous open failure", async () => {
    const spy = harness(); let fail = true;
    const store = indexedWorks({ open(...args: unknown[]) {
      if (fail) throw new Error("Unavailable");
      return (spy.factory.open as (...args: unknown[]) => unknown)(...args);
    } } as unknown as IDBFactory, "test");
    await expect(store.list()).rejects.toThrow("Unavailable"); fail = false;
    const listing = store.list(); await spy.opened.promise; spy.open.onsuccess!(); await spy.requested.promise;
    spy.request.result = null; spy.request.onsuccess!(); spy.tx.oncomplete!();
    expect(await listing).toEqual([]); await store.close();
  });
  it("closes a connection that finishes opening after it was blocked", async () => {
    const spy = harness(); const store = indexedWorks(spy.factory, "test");
    const listing = store.list(); const rejected = expect(listing).rejects.toThrow("blocked");
    await spy.opened.promise; spy.open.onblocked!(); await rejected;
    spy.open.onsuccess!(); expect(spy.closed).toBe(true);
  });
});
