import { describe, expect, it } from "vitest";
import { indexedColoringWorks, type ColoringRecord } from "../src/indexedColoringWorks.ts";
import { coloringFixture } from "./coloringFixture.ts";

function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>(yes => { resolve = yes; });
  return { promise, resolve };
}
// IndexedDB double: only complete() publishes staged writes; all events are test driven.
function database(initial: [IDBValidKey, unknown][] = []) {
  type Request = { result: unknown; error: Error | null; onsuccess?: () => void; onerror?: () => void; onblocked?: () => void; onupgradeneeded?: () => void };
  const rows = new Map<IDBValidKey, unknown>(initial);
  const opened = signal();
  const requestWaiters: (() => void)[] = []; let unreadRequests = 0;
  function requested(): Promise<void> {
    if (unreadRequests) { unreadRequests--; return Promise.resolve(); }
    return new Promise(resolve => requestWaiters.push(resolve));
  }
  const openRequest: Request = { result: undefined, error: null };
  const request: Request = { result: null, error: null };
  let staged: { key: IDBValidKey; value: unknown } | undefined;
  let cleared = false;
  let aborted = false, closed = false, opens = 0, transactions = 0;
  const tx = {
    error: null as Error | null,
    oncomplete: undefined as (() => void) | undefined,
    onabort: undefined as (() => void) | undefined,
    onerror: undefined as (() => void) | undefined,
    abort() { aborted = true; staged = undefined; cleared = false; tx.onabort?.(); },
    objectStore() { return {
      openCursor(key?: IDBValidKey) {
        request.result = key !== undefined && rows.has(key) ? { key, value: structuredClone(rows.get(key)) } : null;
        const waiter = requestWaiters.shift();
        if (waiter) waiter(); else unreadRequests++;
        return request;
      },
      clear() { cleared = true; const waiter = requestWaiters.shift(); if (waiter) waiter(); else unreadRequests++; },
      put(value: unknown, key: IDBValidKey) { staged = { key, value: structuredClone(value) }; }
    }; }
  };
  const db = {
    onversionchange: undefined as (() => void) | undefined,
    onclose: undefined as (() => void) | undefined,
    objectStoreNames: { contains: () => false },
    createObjectStore() {},
    close() { closed = true; },
    transaction() { transactions++; return tx; }
  };
  openRequest.result = db;
  const factory = { open() { opens++; opened.resolve(); return openRequest; } } as unknown as IDBFactory;
  return {
    factory, rows, opened, requested, openRequest, request, tx, db,
    get aborted() { return aborted; }, get closed() { return closed; }, get opens() { return opens; },
    get transactions() { return transactions; }, get staged() { return staged; },
    complete() {
      if (cleared) { rows.clear(); cleared = false; }
      if (staged) { rows.set(staged.key, staged.value); staged = undefined; }
      tx.oncomplete?.();
    },
    readAll() {
      const entries = [...rows]; let index = 0;
      function advance() {
        const entry = entries[index++];
        request.result = entry ? { key: entry[0], value: structuredClone(entry[1]), continue: advance } : null;
        request.onsuccess?.();
      }
      advance();
    }
  };
}
function stored(record: ColoringRecord, sequence: number) {
  return { ...record, history: { schema: 1, sequence, rewarded: record.document.rewarded } };
}
function fixture(initial: [IDBValidKey, unknown][] = []) {
  const { model, dot, thumbnail } = coloringFixture();
  const spy = database(initial);
  const repository = indexedColoringWorks(spy.factory, "production-coloring-test", model);
  const record: ColoringRecord = { document: model.append(model.newWork("one"), dot), thumbnail: thumbnail() };
  async function start() { await spy.opened.promise; spy.openRequest.onsuccess!(); await spy.requested(); }
  return { model, dot, thumbnail, spy, repository, record, start };
}

describe("production coloring durable revisions", () => {
  it("commits an isolated journal, thumbnail and completion flags only on transaction completion", async () => {
    const { model, record, spy, repository, start } = fixture();
    const candidate = { ...record, document: model.complete(record.document) };
    const mutable = JSON.parse(JSON.stringify(candidate.document));
    let acknowledged = false;
    const saving = repository.write({ ...candidate, document: mutable }, null).then(() => { acknowledged = true; });
    mutable.actions[0].points[0].x = 99;
    await start(); spy.readAll();
    expect(spy.staged).toEqual({ key: "one", value: stored(candidate, 1) });
    expect(spy.rows.size).toBe(0); expect(acknowledged).toBe(false);
    spy.complete(); await saving;
    expect(acknowledged).toBe(true); expect(spy.rows.get("one")).toEqual(stored(candidate, 1));
    await repository.close(); expect(spy.closed).toBe(true);
  });

  it("preserves the previous editable revision and thumbnail on abort and can retry", async () => {
    const { model, dot, thumbnail } = coloringFixture();
    const previous = { document: model.append(model.newWork("one"), dot), thumbnail: thumbnail() };
    const { spy, repository, start } = fixture([["one", previous]]);
    const next = { document: model.complete(previous.document), thumbnail: new Blob(["completed"], { type: "image/png" }) };
    const saving = repository.write(next, 1); const rejected = expect(saving).rejects.toThrow("Quota");
    await start(); spy.readAll();
    expect(spy.staged?.value).toEqual(stored(next, 1));
    spy.tx.error = new Error("Quota"); spy.tx.abort(); await rejected;
    expect(spy.rows.get("one")).toEqual(previous);
    expect(previous.document.completed).toBe(false);
    const retry = repository.write(next, 1);
    await spy.requested(); spy.readAll(); spy.complete(); await retry;
    expect(spy.rows.get("one")).toEqual(stored(next, 1));
    await repository.close();
  });

  it.each(["stale", "same", "missing", "reward loss", "empty new", "empty completion"])("rejects %s writes without modifying durable data", async scenario => {
    const { model, dot, thumbnail } = coloringFixture();
    const draft = model.append(model.newWork("one"), dot);
    const completed = model.complete(draft);
    let previous: ColoringRecord | undefined = { document: draft, thumbnail: thumbnail() };
    let candidate: ColoringRecord = { document: completed, thumbnail: thumbnail() };
    let expected: number | null = 1;
    if (scenario === "stale") expected = 0;
    if (scenario === "same") candidate = previous;
    if (scenario === "missing") previous = undefined;
    if (scenario === "reward loss") {
      previous = { document: completed, thumbnail: thumbnail() }; expected = completed.revision;
      candidate = { document: { ...draft, revision: 3 }, thumbnail: thumbnail() };
    }
    if (scenario === "empty new") { previous = undefined; expected = null; candidate = { document: model.newWork("one"), thumbnail: thumbnail() }; }
    if (scenario === "empty completion") candidate = { document: { ...completed, actions: [] }, thumbnail: thumbnail() };
    const { spy, repository, start } = fixture(previous ? [["one", previous]] : []);
    const saving = repository.write(candidate, expected); const rejected = expect(saving).rejects.toThrow();
    await start(); spy.readAll(); await rejected;
    expect(spy.aborted).toBe(true); expect(spy.staged).toBeUndefined();
    expect([...spy.rows]).toEqual(previous ? [["one", previous]] : []);
    await repository.close();
  });

  it("retains a saved empty work and its reward with undo history intact", async () => {
    const { model, dot, thumbnail } = coloringFixture();
    const previous = { document: model.complete(model.append(model.newWork("one"), dot)), thumbnail: thumbnail() };
    const next = { document: model.undo(previous.document), thumbnail: thumbnail() };
    const { spy, repository, start } = fixture([["one", previous]]);
    const saving = repository.write(next, previous.document.revision);
    await start(); spy.readAll(); spy.complete(); await saving;
    expect(spy.rows.get("one")).toEqual(stored(next, 1));
    expect(next.document).toMatchObject({ id: "one", actions: [], completed: true, rewarded: true });
    const listing = repository.list(); await spy.requested(); spy.readAll(); spy.complete();
    expect(await listing).toEqual({ works: [next], unavailable: [], completedCount: 1, recentId: "one" });
    await repository.close();
  });

  it("derives one reward per durable identity, including repeat completion and independent works", async () => {
    const { model, dot, thumbnail } = coloringFixture();
    const one = { document: model.complete(model.append(model.newWork("one"), dot)), thumbnail: thumbnail() };
    const two = { document: model.append(model.newWork("two"), dot), thumbnail: thumbnail() };
    const { spy, repository, start } = fixture([["one", one], ["two", two]]);
    const repeat = { ...one, document: model.complete(model.append(one.document, { ...dot, color: "#42a5f5" })) };
    const saving = repository.write(repeat, one.document.revision);
    await start(); spy.readAll(); spy.complete(); await saving;
    expect(spy.rows.get("two")).toEqual(two);
    const listing = repository.list(); await spy.requested(); spy.readAll(); spy.complete();
    expect(await listing).toEqual({ works: [repeat, two], unavailable: [], completedCount: 1, recentId: "one" });
    const next = { ...two, document: model.complete(two.document) };
    const second = repository.write(next, two.document.revision);
    await spy.requested(); spy.readAll(); spy.complete(); await second;
    const listed = repository.list(); await spy.requested(); spy.readAll(); spy.complete();
    expect(await listed).toEqual({ works: [next, repeat], unavailable: [], completedCount: 2, recentId: "two" });
    await repository.close();
  });

  it("lists healthy rows and preserves corrupt/future rows without inventing a collection count", async () => {
    const { model, dot, thumbnail } = coloringFixture();
    const healthy = { document: model.append(model.newWork("healthy"), dot), thumbnail: thumbnail() };
    const bad: [IDBValidKey, unknown][] = [
      ["future", { document: { ...model.newWork("future"), schema: 99 }, thumbnail: thumbnail() }],
      ["geometry", { document: { ...model.newWork("geometry"), geometry: "future" }, thumbnail: thumbnail() }],
      ["undefined", undefined], ["broken", { document: {}, thumbnail: thumbnail() }],
      ["mismatch", healthy], ["thumbnail", { document: model.newWork("thumbnail"), thumbnail: new Blob() }]
    ];
    const initial: [IDBValidKey, unknown][] = [["healthy", healthy], ...bad];
    const { spy, repository, start } = fixture(initial);
    const listing = repository.list(); await start(); spy.readAll(); spy.complete();
    expect(await listing).toEqual({ works: [healthy], unavailable: bad.map(([key]) => key), completedCount: null, recentId: "healthy" });
    expect([...spy.rows]).toEqual(initial);
    const next = { ...healthy, document: model.complete(healthy.document) };
    const saving = repository.write(next, 1); const denied = expect(saving).rejects.toThrow("history unreadable");
    await spy.requested(); spy.readAll(); await denied;
    expect(bad.map(([key]) => [key, spy.rows.get(key)])).toEqual(bad);
    await repository.close();
  });

  it.each([undefined, null, "broken", { schema: 99 }])("refuses to overwrite an unreadable existing row %#", async corrupt => {
    const { record, spy, repository, start } = fixture([["one", corrupt]]);
    const saving = repository.write(record, null); const rejected = expect(saving).rejects.toThrow();
    await start(); spy.readAll(); await rejected;
    expect(spy.aborted).toBe(true); expect(spy.rows.has("one")).toBe(true);
    expect(spy.rows.get("one")).toEqual(corrupt); expect(spy.staged).toBeUndefined();
    await repository.close();
  });

  it.each(["schema", "geometry", "points", "flags", "thumbnail"])("preserves a damaged %s record on attempted replacement", async damage => {
    const { model, dot, thumbnail } = coloringFixture();
    const work = model.append(model.newWork("one"), dot);
    let previous: unknown = { document: work, thumbnail: thumbnail() };
    if (damage === "schema") previous = { document: { ...work, schema: 2 }, thumbnail: thumbnail() };
    if (damage === "geometry") previous = { document: { ...work, geometry: "future" }, thumbnail: thumbnail() };
    if (damage === "points") previous = { document: { ...work, actions: [{ ...dot, points: new Array(2) }] }, thumbnail: thumbnail() };
    if (damage === "flags") previous = { document: { ...work, rewarded: true }, thumbnail: thumbnail() };
    if (damage === "thumbnail") previous = { document: work, thumbnail: new Blob() };
    const before = structuredClone(previous);
    const { record, spy, repository, start } = fixture([["one", previous]]);
    const saving = repository.write({ ...record, document: model.complete(work) }, work.revision);
    const rejected = expect(saving).rejects.toThrow();
    await start(); spy.readAll(); await rejected;
    expect(spy.aborted).toBe(true); expect(spy.staged).toBeUndefined();
    expect(spy.rows.get("one")).toEqual(before);
    await repository.close();
  });

  it("does not turn read aborts into an empty collection", async () => {
    const { spy, repository, start } = fixture();
    const listing = repository.list(); const rejected = expect(listing).rejects.toThrow("Read denied");
    await start(); spy.tx.error = new Error("Read denied"); spy.tx.abort(); await rejected;
    await repository.close();
  });

  it("retries synchronous and asynchronous database open failures", async () => {
    const { model } = coloringFixture(); const spy = database(); let fail = true;
    const factory = { open(...args: Parameters<IDBFactory["open"]>) {
      if (fail) throw new Error("Unavailable"); return spy.factory.open(...args);
    } };
    const repository = indexedColoringWorks(factory, "test", model);
    await expect(repository.list()).rejects.toThrow("Unavailable"); fail = false;
    const failed = repository.list(); const rejected = expect(failed).rejects.toThrow("Version");
    await spy.opened.promise; spy.openRequest.error = new Error("Version"); spy.openRequest.onerror!(); await rejected;
    const listing = repository.list(); await Promise.resolve(); spy.openRequest.onsuccess!(); await spy.requested();
    spy.readAll(); spy.complete(); expect(await listing).toEqual({ works: [], unavailable: [], completedCount: 0, recentId: null });
    expect(spy.opens).toBe(2); await repository.close();
  });

  it("closes a late blocked open and reopens after a version change", async () => {
    const { spy, repository } = fixture();
    const listing = repository.list(); const rejected = expect(listing).rejects.toThrow("blocked");
    await spy.opened.promise; spy.openRequest.onblocked!(); await rejected;
    spy.openRequest.onsuccess!(); expect(spy.closed).toBe(true);
    const retry = repository.list(); await Promise.resolve(); spy.openRequest.onsuccess!(); await spy.requested();
    spy.readAll(); spy.complete(); await retry;
    spy.db.onversionchange!();
    const reopened = repository.list(); await Promise.resolve(); spy.openRequest.onsuccess!(); await spy.requested();
    spy.readAll(); spy.complete(); await reopened;
    expect(spy.opens).toBe(3); await repository.close();
  });

  it("orders CONTINUE by successful edits across independent works and restarts, never by reads or a failed save", async () => {
    const { model, dot, thumbnail } = coloringFixture();
    const one = { document: model.complete(model.append(model.newWork("one"), dot)), thumbnail: thumbnail() };
    const two = { document: model.append(model.newWork("two"), { ...dot, color: "#42a5f5" }), thumbnail: thumbnail() };
    const { spy, repository, start } = fixture([["one", stored(one, 10)], ["two", stored(two, 20)]]);
    const listing = repository.list(); await start(); spy.readAll(); spy.complete();
    expect(await listing).toMatchObject({ works: [two, one], recentId: "two" });
    const edited = { ...one, document: model.append(one.document, { ...dot, color: "#9ccc65" }) };
    const saving = repository.write(edited, one.document.revision);
    const rejected = expect(saving).rejects.toThrow("Quota");
    await spy.requested(); spy.readAll(); spy.tx.error = new Error("Quota"); spy.tx.abort(); await rejected;
    const unchanged = repository.list(); await spy.requested(); spy.readAll(); spy.complete();
    expect(await unchanged).toMatchObject({ recentId: "two", works: [two, one] });
    const retry = repository.write(edited, one.document.revision); await spy.requested(); spy.readAll(); spy.complete(); await retry;
    await repository.close();
    const reopened = indexedColoringWorks(spy.factory, "production-coloring-test", model);
    const restored = reopened.list(); await Promise.resolve(); spy.openRequest.onsuccess!(); await spy.requested(); spy.readAll(); spy.complete();
    expect(await restored).toEqual({ works: [edited, two], recentId: "one", completedCount: 1, unavailable: [] });
    expect(spy.rows.get("one")).toEqual(stored(edited, 21));
    expect(spy.rows.get("two")).toEqual(stored(two, 20));
    await reopened.close();
  });

  it.each(["journal", "thumbnail"])("retains the reward of a damaged %s and allows healthy and new works beside it", async damage => {
    const { model, dot, thumbnail } = coloringFixture();
    const healthy = { document: model.append(model.newWork("healthy"), dot), thumbnail: thumbnail() };
    const completed = { document: model.complete(model.append(model.newWork("broken"), dot)), thumbnail: thumbnail() };
    const broken = { ...stored(completed, 4), ...(damage === "journal" ? { document: { ...completed.document, actions: [null] } } : { thumbnail: new Blob() }) };
    const { spy, repository, start } = fixture([["healthy", stored(healthy, 2)], ["broken", broken]]);
    const listing = repository.list(); await start(); spy.readAll(); spy.complete();
    expect(await listing).toEqual({ works: [healthy], unavailable: ["broken"], recentId: "broken", completedCount: 1 });
    const next = { ...healthy, document: model.complete(healthy.document) };
    const saving = repository.write(next, healthy.document.revision); await spy.requested(); spy.readAll(); spy.complete(); await saving;
    const fresh = { document: model.append(model.newWork("fresh"), dot), thumbnail: thumbnail() };
    const creating = repository.write(fresh, null); await spy.requested(); spy.readAll(); spy.complete(); await creating;
    const after = repository.list(); await spy.requested(); spy.readAll(); spy.complete();
    expect(await after).toEqual({ works: [fresh, next], unavailable: ["broken"], recentId: "fresh", completedCount: 2 });
    expect(spy.rows.get("broken")).toEqual(broken);
    await repository.close();
  });

  it.each([null, { schema: 99, sequence: 1, rewarded: true }, { schema: 1, sequence: -1, rewarded: false }, { schema: 1, sequence: 1, rewarded: true }])("blocks edits when shared reward history is unreadable or inconsistent %#", async history => {
    const { record, spy, repository, start } = fixture();
    spy.rows.set("one", { ...record, history });
    const listing = repository.list(); await start(); spy.readAll(); spy.complete();
    expect((await listing).completedCount).toBeNull();
    const saving = repository.write(record, null); const rejected = expect(saving).rejects.toThrow("history unreadable");
    await spy.requested(); spy.readAll(); await rejected;
    expect(spy.rows.get("one")).toEqual({ ...record, history });
    await repository.close();
  });

  it("resets only coloring data atomically, retaining the original rows on failure", async () => {
    const { spy, repository } = fixture([["broken", { schema: 99 }]]);
    const reset = repository.reset(); const rejected = expect(reset).rejects.toThrow("Quota");
    await spy.opened.promise; spy.openRequest.onsuccess!(); await spy.requested();
    spy.tx.error = new Error("Quota"); spy.tx.abort(); await rejected;
    expect([...spy.rows]).toEqual([["broken", { schema: 99 }]]);
    const retry = repository.reset(); await spy.requested(); spy.complete(); await retry;
    expect([...spy.rows]).toEqual([]);
    await repository.close();
  });

  it("rejects malformed candidates and missing dependencies before opening storage", async () => {
    const { model, record, spy, repository } = fixture();
    for (const expected of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) await expect(repository.write(record, expected)).rejects.toThrow("expected");
    for (const thumbnail of [null, "png", new Blob(), new Blob(["x"], { type: "image/jpeg" })]) {
      await expect(repository.write({ ...record, thumbnail: thumbnail as Blob }, null)).rejects.toThrow("thumbnail");
    }
    expect(spy.opens).toBe(0); expect(spy.transactions).toBe(0);
    expect(() => indexedColoringWorks(undefined!, "test", model)).toThrow("requires");
    expect(() => indexedColoringWorks(spy.factory, "", model)).toThrow("requires");
    expect(() => indexedColoringWorks(spy.factory, "test", undefined!)).toThrow("requires");
  });
});
