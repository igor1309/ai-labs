import { describe, expect, it } from "vitest";
import { BASE, COLORS, GEOMETRY, REGIONS, SIZES } from "../src/coloringProbe/geometry.ts";
import { append, newWork, readRecord, readWork, undo, type Action, type RecordData } from "../src/coloringProbe/model.ts";
import { gesture } from "../src/coloringProbe/gesture.ts";
import { workSession } from "../src/coloringProbe/session.ts";

const dot: Action = { kind: "stroke", color: COLORS[1], size: 20, points: [{ x: 400, y: 400 }] };
const png = () => new Blob(["thumbnail"], { type: "image/png" });
const deferred = () => {
  let resolve!: () => void, reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
describe("editable coloring journal", () => {
  it("round trips every color, size and fill region, then undoes and continues independently", () => {
    let first = newWork("first");
    for (const color of COLORS) for (const size of SIZES) first = append(first, { ...dot, color, size });
    for (const region of REGIONS) first = append(first, { kind: "fill", color: BASE, region: region.id });
    const restored = readWork(JSON.parse(JSON.stringify(first)));
    expect(restored).toEqual(first);
    const continued = append(undo(restored), dot);
    expect(continued.id).toBe(first.id);
    expect(continued.revision).toBe(first.revision + 2);
    expect(continued.actions.at(-1)).toEqual(dot);
    expect(continued.actions.at(-2)).toEqual(first.actions.at(-2));
    const beforeOther = structuredClone(first);
    const other = append(newWork("second"), { kind: "fill", color: COLORS[2], region: "head" });
    expect(other.id).not.toBe(first.id);
    expect(first).toEqual(beforeOther);
    expect(other.actions).toEqual([{ kind: "fill", color: COLORS[2], region: "head" }]);
    expect(undo(newWork("empty"))).toEqual(newWork("empty"));
    restored.actions[0]!.color = COLORS[3];
    expect(first.actions[0]!.color).toBe(BASE);
  });
  it.each([
    null, {}, { ...newWork("a"), schema: 2 }, { ...newWork("a"), geometry: "future" },
    { ...newWork("a"), id: "../bad" }, { ...newWork("a"), revision: -1 }, { ...newWork("a"), revision: 0.5 },
    { ...newWork("a"), actions: [dot] },
    ...[
      { ...dot, color: "invisible" }, { ...dot, size: 9 }, { ...dot, points: [] },
      { ...dot, points: [{ x: Infinity, y: 0 }] }, { ...dot, points: [{ x: 0, y: NaN }] },
      { ...dot, points: [{ x: "5", y: 0 }] }, { ...dot, points: [null] },
      { kind: "fill", color: BASE, region: "unknown" }, { kind: "future", color: BASE }
    ].map(action => ({ ...newWork("a"), revision: 1, actions: [action] }))
  ])("rejects damaged or unsupported input %#", value => {
    expect(() => readWork(value)).toThrow();
  });
  it("rejects mismatched identity and damaged thumbnail without accepting a replacement work", () => {
    const record = { document: newWork("a"), thumbnail: png() };
    expect(readRecord(record, "a").document.geometry).toBe(GEOMETRY);
    expect(() => readRecord(record, "b")).toThrow("identity");
    for (const thumbnail of [null, "png", new Blob(), new Blob(["x"], { type: "image/jpeg" })]) expect(() => readRecord({ ...record, thumbnail }, "a")).toThrow();
  });
});

describe("one contact owns a stroke", () => {
  it.each([8, 20, 40])("retains brush %i and ignores the second pointer until release", size => {
    const input = gesture();
    input.start(1, { x: 100, y: 200 }, COLORS[1], size);
    expect(input.busy).toBe(true);
    expect(input.start(2, { x: 0, y: 0 }, BASE, 40)).toBeUndefined();
    expect(input.move(2, { x: 500, y: 500 })).toBeUndefined();
    expect(input.end(2, { x: 0, y: 0 })).toBeUndefined();
    input.move(1, { x: 110, y: 210 });
    expect(input.end(1, { x: 120, y: 220 })).toEqual({ kind: "stroke", size, color: COLORS[1], points: [{ x: 100, y: 200 }, { x: 110, y: 210 }, { x: 120, y: 220 }] });
    expect(input.busy).toBe(false);
  });
  it("discards cancellation and permits a fresh dot", () => {
    const input = gesture(); input.start(1, { x: 0, y: 0 }, BASE, 8); input.cancel();
    expect(input.end(1, { x: 10, y: 10 })).toBeUndefined();
    input.start(3, { x: 40, y: 50 }, COLORS[2], 20);
    expect(input.end(3, { x: 40, y: 50 })?.points).toEqual([{ x: 40, y: 50 }]);
  });
});

describe("durable work revisions", () => {
  it("orders writes, freezes snapshots and never acknowledges a stale completion as current", async () => {
    const started = [deferred(), deferred()]; const finish = [deferred(), deferred()];
    const calls: { record: RecordData; expected: number | null }[] = [];
    const session = workSession(newWork("a"), null, {
      thumbnail: async work => new Blob([String(work.revision)], { type: "image/png" }),
      changed() {},
      write: async (record, expected) => { const i = calls.length; calls.push({ record, expected }); started[i]!.resolve(); await finish[i]!.promise; }
    });
    const one = append(session.work, dot); const first = session.save(one);
    await started[0]!.promise;
    const two = append(session.work, { kind: "fill", color: COLORS[2], region: "body" });
    const second = session.save(two); one.actions[0]!.color = BASE;
    expect(calls).toHaveLength(1);
    finish[0]!.resolve(); await first; await started[1]!.promise;
    expect(session.durable).toBe(1); expect(session.state).toBe("saving");
    expect(calls[0]!.record.document.actions[0]!.color).toBe(COLORS[1]);
    expect(calls[1]!.expected).toBe(1);
    expect(await calls[1]!.record.thumbnail.text()).toBe("2");
    finish[1]!.resolve(); await second;
    expect(session.state).toBe("saved"); expect(session.durable).toBe(2);
  });
  it("retains current edits and the last durable snapshot on failure, retries the current undo", async () => {
    let durable: RecordData = { document: append(newWork("a"), dot), thumbnail: png() };
    let fail = true;
    const session = workSession(durable.document, 1, {
      changed() {}, thumbnail: async () => png(),
      write: async (record, expected) => {
        expect(expected).toBe(1);
        if (fail) throw new Error("Quota exceeded"); durable = record;
      }
    });
    await session.save(undo(session.work));
    expect(session.state).toBe("error"); expect(session.error).toBe("Quota exceeded");
    expect(session.work.actions).toEqual([]); expect(session.work.revision).toBe(2);
    expect(durable.document.actions).toEqual([dot]); expect(session.durable).toBe(1);
    fail = false; await session.retry();
    expect(session.state).toBe("saved"); expect(durable.document).toEqual(session.work);
  });
  it("keeps other work saves independent while one write waits", async () => {
    const finish = deferred(), started = deferred();
    const first = workSession(newWork("a"), null, { thumbnail: async () => png(), changed() {}, write: async () => { started.resolve(); await finish.promise; } });
    const second = workSession(newWork("b"), null, { thumbnail: async () => png(), changed() {}, write: async record => { expect(record.document.id).toBe("b"); } });
    const waiting = first.save(append(first.work, dot)); await started.promise;
    await second.save(append(second.work, { ...dot, color: COLORS[2] }));
    expect(second.state).toBe("saved"); expect(first.state).toBe("saving");
    finish.resolve(); await waiting;
    expect(first.work.actions[0]!.color).toBe(COLORS[1]);
  });
  it("coalesces repeated retry activation until the current revision settles", async () => {
    const started = deferred(), finish = deferred(); let fail = true, calls = 0;
    const session = workSession(newWork("a"), null, {
      changed() {}, thumbnail: async () => png(),
      write: async () => { calls++; if (fail) throw new Error("Unavailable"); started.resolve(); await finish.promise; }
    });
    await session.save(append(session.work, dot)); expect(session.state).toBe("error");
    fail = false; const retry = session.retry(); await started.promise;
    const repeated = session.retry(); expect(calls).toBe(2);
    finish.resolve(); await retry; await repeated;
    await session.retry(); expect(calls).toBe(2); expect(session.state).toBe("saved");
  });
  it("retains memory when thumbnail creation fails and rejects another work's identity", async () => {
    let writes = 0;
    const session = workSession(newWork("a"), null, { thumbnail: async () => { throw new Error("Canvas failed"); }, changed() {}, write: async () => { writes++; } });
    await session.save(append(session.work, dot));
    expect(session.state).toBe("error"); expect(session.work.actions).toEqual([dot]); expect(writes).toBe(0);
    expect(() => session.save(newWork("b"))).toThrow("order");
  });
});
