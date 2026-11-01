import { expect, it, vi } from "vitest";
import { coloringResult } from "../src/coloringResult.ts";
import type { ColoringWorkshopSession } from "../src/coloringWorkshop.ts";

function fixture() {
  let resolve!: (session: ColoringWorkshopSession) => void;
  let reject!: (error: Error) => void;
  const opening = new Promise<ColoringWorkshopSession>((yes, no) => { resolve = yes; reject = no; });
  const open = vi.fn(() => opening), navigate = vi.fn(), workshop = vi.fn(), leave = vi.fn();
  const session = coloringResult("painted", { open, navigate, workshop, leave });
  return { session, open, navigate, workshop, leave, resolve, reject };
}
it("opens the durable identity once and blocks every result action while opening", async () => {
  const f = fixture(); const work = { getSnapshot: vi.fn() } as unknown as ColoringWorkshopSession;
  const opening = f.session.choose("edit");
  for (const action of ["edit", "home", "gallery", "new"] as const) await f.session.choose(action);
  expect(f.open).toHaveBeenCalledExactlyOnceWith("painted", f.navigate);
  expect(f.session.getSnapshot()).toEqual({ busy: true, error: false });
  expect(f.workshop).not.toHaveBeenCalled(); expect(f.leave).not.toHaveBeenCalled();
  f.resolve(work); await opening;
  expect(f.workshop).toHaveBeenCalledExactlyOnceWith(work);
  await f.session.choose("new"); expect(f.leave).not.toHaveBeenCalled();
});
it("shows read failure without departure and permits editing retry", async () => {
  const f = fixture(); const opening = f.session.choose("edit"); f.reject(new Error("read failed")); await opening;
  expect(f.session.getSnapshot()).toEqual({ busy: false, error: true });
  expect(f.workshop).not.toHaveBeenCalled(); expect(f.leave).not.toHaveBeenCalled();
  const work = {} as ColoringWorkshopSession; f.open.mockResolvedValueOnce(work);
  await f.session.choose("edit"); expect(f.workshop).toHaveBeenCalledExactlyOnceWith(work);
});
it.each(["home", "gallery", "new"] as const)("departs to %s once without reading or altering paint", async action => {
  const f = fixture(); await f.session.choose(action); await f.session.choose(action); await f.session.choose("edit");
  expect(f.leave).toHaveBeenCalledExactlyOnceWith(action); expect(f.open).not.toHaveBeenCalled();
});
it("ignores a late open after the result visit ends", async () => {
  const f = fixture(); const opening = f.session.choose("edit"); f.session.stop();
  f.resolve({} as ColoringWorkshopSession); await opening;
  expect(f.workshop).not.toHaveBeenCalled(); await f.session.choose("home"); expect(f.leave).not.toHaveBeenCalled();
});
