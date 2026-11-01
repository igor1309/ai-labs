import { expect, it, vi } from "vitest";
import { coloringWorkshop, type WorkshopNavigation } from "../src/coloringWorkshop.ts";
import type { ColoringRecord } from "../src/indexedColoringWorks.ts";
import { coloringFixture } from "./coloringFixture.ts";
import type { Work } from "../src/coloring/index.ts";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture(saved = false) {
  const { model, dot, thumbnail } = coloringFixture();
  const initial = saved ? model.append(model.newWork("work"), dot) : model.newWork("work");
  const writes: { record: ColoringRecord; expected: number | null; done: ReturnType<typeof deferred> }[] = [];
  const navigations: WorkshopNavigation[] = [];
  const image = vi.fn(async (_work: Work) => thumbnail());
  const write = (record: ColoringRecord, expected: number | null) => { const done = deferred(); writes.push({ record, expected, done }); return done.promise; };
  const session = coloringWorkshop(initial, saved ? initial.revision : null, {
    model, thumbnail: image,
    write,
    complete: (record, expected) => write(record, expected).then(() => ({ completedCount: 3, earned: true })),
    navigate: navigation => { navigations.push(navigation); }
  });
  // Thumbnail delivery is a microtask, rather than a timer or a storage poll.
  const started = async () => { await Promise.resolve(); await Promise.resolve(); };
  return { model, dot, session, initial, writes, navigations, image, started };
}

it("saves every accepted stroke/fill/undo in order and never acknowledges newer paint early", async () => {
  const f = fixture();
  f.session.append(f.dot);
  f.session.append({ kind: "fill", region: "body", color: "#42a5f5" });
  f.session.undo();
  await f.started();
  expect(f.writes.map(w => [w.record.document.revision, w.expected])).toEqual([[1, null]]);
  expect(f.session.getSnapshot()).toMatchObject({ work: { revision: 3, actions: [f.dot] }, save: "saving" });
  for (let i = 0; i < 3; i++) {
    const write = f.writes[i]!;
    expect(write.record.document.revision).toBe(i + 1);
    expect(write.expected).toBe(i === 0 ? null : i);
    expect(write.record.thumbnail.type).toBe("image/png");
    write.done.resolve();
    await f.started();
    if (i < 2) expect(f.session.getSnapshot().save).toBe("saving");
  }
  await f.session.settled();
  expect(f.session.getSnapshot().save).toBe("saved");
});

it("opens no save for tool-independent no-ops or undo on an untouched work", async () => {
  const f = fixture();
  f.session.undo();
  f.session.append({ ...f.dot, color: "#fff0cf" });
  f.session.append({ ...f.dot, points: [{ x: -1, y: 0 }] });
  f.session.go("result");
  await f.session.settled();
  expect(f.session.getSnapshot()).toMatchObject({ save: "untouched", work: { revision: 0, actions: [] } });
  expect(f.writes).toEqual([]);
  expect(f.navigations).toEqual([]);
  f.session.go("gallery");
  expect(f.navigations.map(n => n.destination)).toEqual(["gallery"]);
});

it.each(["home", "gallery", "new", "result"] as const)("waits for autosave before %s and blocks edits while leaving", async destination => {
  const f = fixture();
  f.session.append(f.dot);
  f.session.go(destination);
  f.session.go(destination);
  f.session.undo();
  f.session.append({ ...f.dot, color: "#42a5f5" });
  await f.started();
  expect(f.navigations).toEqual([]);
  expect(f.session.getSnapshot()).toMatchObject({ frozen: true, work: { actions: [f.dot], revision: 1 } });
  f.writes[0]!.done.resolve();
  await f.started();
  if (destination === "result") {
    expect(f.navigations).toEqual([]);
    expect(f.writes[1]!.record.document).toMatchObject({ completed: true, rewarded: true, actions: [f.dot], revision: 2 });
    f.writes[1]!.done.resolve();
  }
  await f.session.settled();
  expect(f.navigations).toEqual([{ destination, work: f.writes.at(-1)!.record.document, ...(destination === "result" ? { completion: { completedCount: 3, earned: true } } : {}) }]);
});

it("stops at a failed revision, keeps the latest paint, and retries the entire remaining order", async () => {
  const f = fixture(true);
  f.session.append({ kind: "fill", region: "body", color: "#42a5f5" });
  f.session.undo();
  f.session.go("gallery");
  await f.started();
  f.writes[0]!.done.reject(new Error("quota"));
  await f.session.settled();
  expect(f.session.getSnapshot()).toMatchObject({ save: "error", errorOpen: true, frozen: false, work: { revision: 3, actions: [f.dot] } });
  expect(f.writes).toHaveLength(1);
  expect(f.navigations).toEqual([]);
  const retry = f.session.retry();
  await f.started();
  expect(f.session.getSnapshot()).toMatchObject({ save: "saving", saveError: true });
  expect(f.writes[1]!.record.document.revision).toBe(2);
  expect(f.writes[1]!.expected).toBe(1);
  f.writes[1]!.done.resolve(); await f.started();
  expect(f.writes[2]!.record.document).toMatchObject({ revision: 3, actions: [f.dot] });
  expect(f.writes[2]!.expected).toBe(2);
  f.writes[2]!.done.resolve(); await retry;
  expect(f.session.getSnapshot()).toMatchObject({ save: "saved", saveError: false });
  expect(f.navigations).toEqual([{ destination: "gallery", work: f.session.getSnapshot().work }]);
});

it.each([false, true])("requires confirmed loss, retains paint when cancelled, and returns only durable work (saved=%s)", async saved => {
  const f = fixture(saved);
  f.session.append({ ...f.dot, color: "#42a5f5" });
  await f.started();
  f.writes[0]!.done.reject(new Error("storage unavailable"));
  await f.session.settled();
  const paint = f.session.getSnapshot().work;
  f.session.confirmLoss();
  expect(f.navigations).toEqual([]);
  f.session.askLoss(); f.session.cancelLoss();
  expect(f.session.getSnapshot()).toMatchObject({ confirmingLoss: false, work: paint });
  f.session.keepEditing();
  expect(f.session.getSnapshot()).toMatchObject({ errorOpen: false, save: "error", work: paint });
  f.session.askLoss(); f.session.confirmLoss();
  expect(f.navigations).toEqual([{ destination: "home", work: f.initial }]);
});

it("a failed completion stays a draft; keep editing then retry does not silently complete it", async () => {
  const f = fixture(true);
  f.session.go("result"); await f.started();
  expect(f.session.getSnapshot()).toMatchObject({ save: "saving", frozen: true, work: f.initial });
  f.writes[0]!.done.reject(new Error("quota")); await f.session.settled();
  expect(f.session.getSnapshot()).toMatchObject({ work: f.initial, save: "error", frozen: false });
  expect(f.navigations).toEqual([]);
  f.session.keepEditing(); f.session.undo();
  const retry = f.session.retry(); await f.started();
  expect(f.writes[1]!.record.document).toMatchObject({ completed: false, rewarded: false, actions: [], revision: 2 });
  f.writes[1]!.done.resolve(); await retry;
  expect(f.navigations).toEqual([]);
});

it("retries completion once after failure and cannot duplicate navigation or its reward", async () => {
  const f = fixture(true);
  f.session.go("result"); await f.started();
  f.writes[0]!.done.reject(new Error("quota")); await f.session.settled();
  const retry = f.session.retry(); void f.session.retry();
  await f.started();
  expect(f.writes[1]!.record.document).toMatchObject({ completed: true, rewarded: true, revision: 2 });
  f.writes[1]!.done.resolve(); await retry;
  f.session.go("result");
  expect(f.navigations).toHaveLength(1);
  expect(f.writes).toHaveLength(2);
});

it("thumbnail failure is a save failure and retry keeps the accepted paint", async () => {
  const f = fixture();
  f.image.mockRejectedValueOnce(new Error("encoding failed"));
  f.session.append(f.dot); await f.session.settled();
  expect(f.writes).toEqual([]);
  expect(f.session.getSnapshot()).toMatchObject({ save: "error", errorOpen: true, work: { actions: [f.dot] } });
  const retry = f.session.retry(); await f.started();
  f.writes[0]!.done.resolve(); await retry;
  expect(f.session.getSnapshot().save).toBe("saved");
});

it("freezes every accepted revision until ordered edits and their atomic completion have committed", async () => {
  const f = fixture();
  f.session.append(f.dot);
  f.session.append({ kind: "fill", region: "head", color: "#42a5f5" });
  const accepted = f.session.getSnapshot().work;
  f.session.go("result"); f.session.go("result"); f.session.go("home");
  f.session.undo(); f.session.append({ ...f.dot, color: "#9ccc65" });
  expect(f.session.getSnapshot().work).toBe(accepted);
  await f.started();
  for (let i = 0; i < 2; i++) {
    expect(f.writes[i]!.record.document).toMatchObject({ revision: i + 1, completed: false, rewarded: false });
    expect(f.navigations).toEqual([]); f.writes[i]!.done.resolve(); await f.started();
  }
  expect(f.writes[2]!.record.document).toEqual(f.model.complete(accepted));
  expect(f.navigations).toEqual([]); expect(f.session.getSnapshot().work.rewarded).toBe(false);
  f.writes[2]!.done.resolve(); await f.session.settled();
  expect(f.navigations).toEqual([{ destination: "result", work: f.model.complete(accepted), completion: { earned: true, completedCount: 3 } }]);
});

it.each(["queued edit", "completion"])("restores editing after a failed %s without claiming a reward", async failure => {
  const f = fixture(true);
  f.session.append({ kind: "fill", region: "head", color: "#42a5f5" });
  const accepted = f.session.getSnapshot().work;
  f.session.go("result"); await f.started();
  if (failure === "completion") { f.writes[0]!.done.resolve(); await f.started(); }
  f.writes.at(-1)!.done.reject(new Error("quota")); await f.session.settled();
  expect(f.session.getSnapshot()).toMatchObject({ work: accepted, save: "error", frozen: false, errorOpen: true });
  expect(f.navigations).toEqual([]); expect(f.session.getSnapshot().work.rewarded).toBe(false);
  f.session.keepEditing(); f.session.undo();
  expect(f.session.getSnapshot().work.actions).toEqual(f.initial.actions);
});

it("revalidates an already durable completion and never creates another earned receipt, including after reopening and undo to empty", async () => {
  const { model, dot, thumbnail } = coloringFixture();
  const original = model.complete(model.append(model.newWork("repeat"), dot));
  let durable = original;
  const completions: Work[] = [], navigations: WorkshopNavigation[] = [];
  const dependencies = { model, thumbnail: async () => thumbnail(), navigate: (navigation: WorkshopNavigation) => { navigations.push(navigation); },
    write: async (record: ColoringRecord) => { durable = record.document; },
    complete: async (record: ColoringRecord) => { completions.push(record.document); durable = record.document; return { earned: false, completedCount: 2 }; }
  };
  const session = coloringWorkshop(original, original.revision, dependencies);
  session.go("result"); await session.settled();
  expect(completions).toEqual([original]);
  expect(navigations).toEqual([{ destination: "result", work: original, completion: { earned: false, completedCount: 2 } }]);
  const reopened = coloringWorkshop(durable, durable.revision, dependencies);
  reopened.undo(); await reopened.settled(); reopened.go("result"); await reopened.settled();
  expect(reopened.getSnapshot().work).toMatchObject({ actions: [], rewarded: true, completed: true });
  expect(completions).toEqual([original]); expect(navigations).toHaveLength(1);
  reopened.append({ ...dot, color: "#42a5f5" }); await reopened.settled();
  reopened.go("result"); await reopened.settled();
  expect(navigations.at(-1)).toEqual({ destination: "result", work: durable, completion: { earned: false, completedCount: 2 } });
  expect(durable.actions).toEqual([{ ...dot, color: "#42a5f5" }]);
});
