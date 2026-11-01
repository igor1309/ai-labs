import { describe, expect, it, vi } from "vitest";
import { coloringGallery, type GalleryCollection, type GallerySource } from "../src/coloringGallery.ts";
import type { ColoringWorkshopSession } from "../src/coloringWorkshop.ts";
import { coloringFixture } from "./coloringFixture.ts";

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture() {
  const { model, dot, thumbnail } = coloringFixture();
  const red = { document: model.complete(model.append(model.newWork("red"), dot)), thumbnail: thumbnail() };
  const blue = { document: model.append(model.newWork("blue"), { ...dot, color: "#42a5f5" }), thumbnail: thumbnail() };
  const collection: GalleryCollection = { works: [blue, red], unavailable: [], completedCount: 1, recentId: "blue" };
  const workshopSession = {} as ColoringWorkshopSession;
  const source = { list: vi.fn(async () => collection), reset: vi.fn(async () => {}), open: vi.fn(async () => workshopSession), newWork: vi.fn(async () => workshopSession) } satisfies GallerySource;
  const dependencies = { source, identity: vi.fn(() => "new-unique"), countStart: vi.fn(), workshop: vi.fn(), navigate: vi.fn() };
  return { ...dependencies, red, blue, collection, workshopSession, session: coloringGallery(dependencies) };
}

describe("coloring gallery", () => {
  it("loads durable paint, flags and recent identity without writing, opening or counting a start", async () => {
    const { session, collection, source, countStart } = fixture();
    await session.load();
    expect(session.getSnapshot()).toMatchObject({ collection, busy: false, warning: false });
    expect(source.newWork).not.toHaveBeenCalled(); expect(source.open).not.toHaveBeenCalled();
    expect(source.reset).not.toHaveBeenCalled(); expect(countStart).not.toHaveBeenCalled();
  });
  it.each(["red", "blue"])("opens %s under its existing identity without a new start", async id => {
    const { session, source, countStart, workshop, workshopSession, navigate } = fixture();
    await session.load(); await session.enter(id);
    expect(source.open).toHaveBeenCalledExactlyOnceWith(id, navigate);
    expect(workshop).toHaveBeenCalledExactlyOnceWith(workshopSession);
    expect(countStart).not.toHaveBeenCalled(); expect(source.newWork).not.toHaveBeenCalled();
  });
  it("counts exactly once when a new untouched session is created and does not store it", async () => {
    const { session, source, countStart, workshop, workshopSession, navigate } = fixture();
    await session.load(); await session.enter(); await session.enter();
    expect(source.newWork).toHaveBeenCalledExactlyOnceWith("new-unique", navigate);
    expect(countStart).toHaveBeenCalledTimes(1); expect(workshop).toHaveBeenCalledExactlyOnceWith(workshopSession);
    expect(source.reset).not.toHaveBeenCalled();
  });
  it("does not count failed creation and retains readable thumbnails with retry", async () => {
    const { session, source, countStart, collection } = fixture();
    source.newWork.mockRejectedValueOnce(new Error("unavailable"));
    await session.load(true);
    expect(session.getSnapshot()).toMatchObject({ collection, warning: true, busy: false });
    expect(countStart).not.toHaveBeenCalled();
    await session.enter(); expect(countStart).toHaveBeenCalledTimes(1);
  });
  it("preserves a readable collection on read failure and clears the warning only after retry", async () => {
    const { session, source, collection } = fixture();
    await session.load(); source.list.mockRejectedValueOnce(new Error("denied"));
    await session.load(); expect(session.getSnapshot()).toMatchObject({ collection, warning: true, busy: false });
    await session.load(); expect(session.getSnapshot()).toMatchObject({ collection, warning: false });
  });
  it("never presents an initial read failure as an empty collection", async () => {
    const { session, source, workshop } = fixture();
    source.list.mockRejectedValueOnce(new Error("denied"));
    await session.load(); await session.enter();
    expect(session.getSnapshot()).toMatchObject({ collection: null, warning: true, busy: false });
    expect(workshop).not.toHaveBeenCalled();
  });
  it("keeps healthy works editable beside an unavailable work whose reward is readable", async () => {
    const { session, source, collection, countStart } = fixture();
    source.list.mockResolvedValue({ ...collection, unavailable: ["damaged"], recentId: "damaged", completedCount: 2 });
    await session.load(); expect(session.getSnapshot().warning).toBe(true);
    session.recover(); expect(session.getSnapshot().recovery).toBe(false);
    await session.enter("damaged"); expect(source.open).not.toHaveBeenCalled();
    await session.enter(); expect(countStart).toHaveBeenCalledTimes(1);
  });
  it("allows viewing but no edits or new starts when reward history is unreadable", async () => {
    const { session, source, collection, red, workshop, countStart } = fixture();
    source.list.mockResolvedValue({ ...collection, completedCount: null, unavailable: ["bad"] });
    await session.load(); await session.enter("red"); await session.enter();
    expect(workshop).not.toHaveBeenCalled(); expect(countStart).not.toHaveBeenCalled();
    session.view(red); expect(session.getSnapshot().viewing).toEqual(red);
    session.closeView(); expect(session.getSnapshot().viewing).toBeNull();
  });
  it("requires explicit recovery confirmation, preserves failure and cancels without any reset", async () => {
    const { session, source, collection, countStart } = fixture();
    source.list.mockResolvedValue({ ...collection, completedCount: null });
    await session.load(); await session.reset(); expect(source.reset).not.toHaveBeenCalled();
    session.recover(); session.cancelRecovery(); expect(source.reset).not.toHaveBeenCalled();
    session.recover(); source.reset.mockRejectedValueOnce(new Error("quota")); await session.reset();
    expect(session.getSnapshot()).toMatchObject({ recovery: true, recoveryError: true, collection: { completedCount: null }, busy: false });
    await session.reset(); expect(session.getSnapshot()).toMatchObject({ recovery: false, warning: false, recoveryError: false, collection: { works: [], unavailable: [], completedCount: 0, recentId: null } });
    expect(countStart).not.toHaveBeenCalled();
  });
  it("ignores obsolete reads and creation after leaving, including an automatic new-work request", async () => {
    const { session, source, collection, workshop, countStart } = fixture();
    const first = deferred<GalleryCollection>(); source.list.mockReturnValueOnce(first.promise);
    const old = session.load(true); await session.load(); first.resolve({ ...collection, completedCount: null }); await old;
    expect(session.getSnapshot().collection).toEqual(collection); expect(source.newWork).not.toHaveBeenCalled();
    const creating = deferred<ColoringWorkshopSession>(); source.newWork.mockReturnValueOnce(creating.promise);
    const opening = session.enter(); session.stop(); creating.resolve({} as ColoringWorkshopSession); await opening;
    expect(workshop).not.toHaveBeenCalled(); expect(countStart).not.toHaveBeenCalled();
  });
});


it.each(["stegosaurus-production-1", "ankylosaurus-production-1", "ankylosaurus-hatchling-2", "ankylosaurus-explorer-1", "stegosaurus-explorer-1", "triceratops-production-1", "triceratops-explorer-1"])("preserves %s on automatic new work", async geometry => {
  const f = fixture(); await f.session.load(geometry);
  expect(f.source.newWork).toHaveBeenCalledExactlyOnceWith("new-unique", f.navigate, geometry);
  expect(f.countStart).toHaveBeenCalledTimes(1);
});
