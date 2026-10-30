import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ColoringGame } from "../src/ColoringGame.tsx";
import type { GalleryCollection, GallerySource } from "../src/coloringGallery.ts";
import { coloringWorkshop, type ColoringWorkshopSession, type WorkshopNavigation } from "../src/coloringWorkshop.ts";
import { coloringFixture } from "./coloringFixture.ts";

beforeEach(() => vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:thumbnail"), revokeObjectURL: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const { model, dot, thumbnail } = coloringFixture();
  const red = { document: model.complete(model.append(model.newWork("red"), dot)), thumbnail: thumbnail() };
  const blue = { document: model.append(model.newWork("blue"), { ...dot, color: "#42a5f5" }), thumbnail: thumbnail() };
  const records = new Map([["red", red], ["blue", blue]]);
  let recentId = "blue", identity = 0, failed = false;
  let active!: ColoringWorkshopSession;
  const source: GallerySource = {
    async list(): Promise<GalleryCollection> { return { works: [...records.values()], unavailable: [], recentId, completedCount: [...records.values()].filter(r => r.document.completed).length }; },
    async reset() { records.clear(); },
    async newWork(id, navigate) { return make(model.newWork(id), null, navigate); },
    async open(id, navigate) { const record = records.get(id)!; return make(record.document, record.document.revision, navigate); }
  };
  function make(work: typeof red.document, durable: number | null, navigate: (navigation: WorkshopNavigation) => void) {
    active = coloringWorkshop(work, durable, { model, navigate, thumbnail: async () => thumbnail(),
      async write(record) { if (failed) throw new Error("quota"); records.set(record.document.id, record); recentId = record.document.id; }
    });
    return active;
  }
  const props = { source, painter: { width: 920, height: 620, render: vi.fn(), preview: vi.fn(), regionAt: vi.fn(() => "body") }, identity: () => `new-${++identity}`, countStart: vi.fn(), home: vi.fn(), result: vi.fn(), language: "en" as const };
  const view = render(<ColoringGame {...props} />);
  const click = async (name: string) => { await act(async () => fireEvent.click(screen.getByRole("button", { name }))); };
  const settle = async () => { await act(async () => { await active.settled(); }); };
  return { ...view, props, records, dot, red, blue, click, settle, active: () => active, fail: (value: boolean) => { failed = value; } };
}
it("integrates the gallery and workshop: durable changes, independent history, completed flags and untouched new works", async () => {
  const f = fixture(); await act(async () => {});
  await f.click("CONTINUE"); expect(f.active().getSnapshot().work.id).toBe("blue");
  act(() => f.active().append({ ...f.dot, color: "#9ccc65" })); await f.settle();
  await f.click("GALLERY");
  expect(f.records.get("red")).toEqual(f.red); expect(f.records.get("blue")!.document.actions.at(-1)).toMatchObject({ color: "#9ccc65" });
  await f.click("CONTINUE"); act(() => f.active().undo()); await f.settle();
  expect(f.active().getSnapshot().work.actions).toEqual(f.blue.document.actions);
  await f.click("GALLERY");
  await act(async () => fireEvent.click(f.container.querySelector('[data-work-id="red"] button')!));
  act(() => f.active().undo()); await f.settle(); await f.click("GALLERY");
  expect(f.records.get("red")!.document).toMatchObject({ id: "red", completed: true, rewarded: true, actions: [] });
  expect(f.container.querySelector('[data-work-id="red"] .gallery-earned-star')).not.toBeNull();
  await f.click("CONTINUE"); expect((screen.getByRole("button", { name: "DONE" }) as HTMLButtonElement).disabled).toBe(true);
  await f.click("NEW WORK"); expect(f.active().getSnapshot().work).toMatchObject({ id: "new-1", actions: [], completed: false });
  expect(f.props.countStart).toHaveBeenCalledTimes(1);
  await f.click("GALLERY"); expect(f.records.size).toBe(2); expect(f.records.has("new-1")).toBe(false);
  await f.click("CONTINUE"); expect(f.active().getSnapshot().work.id).toBe("red");
  expect(f.props.countStart).toHaveBeenCalledTimes(1);
});
it("keeps unsaved paint in the workshop and shows only the durable thumbnail after successful retry", async () => {
  const f = fixture(); await act(async () => {}); await f.click("CONTINUE");
  f.fail(true); act(() => f.active().append({ ...f.dot, color: "#9ccc65" })); await f.settle();
  await f.click("KEEP EDITING"); await f.click("GALLERY");
  expect(screen.getByRole("alertdialog")).toBeTruthy(); expect(f.container.querySelector(".coloring-gallery")).toBeNull();
  expect(f.records.get("blue")).toEqual(f.blue);
  expect(f.active().getSnapshot().work.actions.at(-1)).toMatchObject({ color: "#9ccc65" });
  f.fail(false); await f.click("RETRY"); await f.settle();
  expect(screen.queryByRole("alertdialog")).toBeNull(); expect(screen.getByRole("region", { name: "MY ART" })).toBeTruthy();
  expect(f.records.get("blue")!.document.actions.at(-1)).toMatchObject({ color: "#9ccc65" });
  expect(f.props.countStart).not.toHaveBeenCalled();
});
it("retains the session across rotation and leaves result navigation to the host", async () => {
  const f = fixture(); await act(async () => {}); await f.click("CONTINUE");
  const before = f.active(); fireEvent(window, new Event("orientationchange")); f.rerender(<ColoringGame {...f.props} />);
  expect(f.active()).toBe(before); expect(f.active().getSnapshot().work).toEqual(f.blue.document);
  await f.click("DONE"); await f.settle();
  expect(f.props.result).toHaveBeenCalledExactlyOnceWith({ destination: "result", work: expect.objectContaining({ id: "blue", completed: true, rewarded: true }) });
});
