import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, onTestFinished, vi } from "vitest";
import { ColoringWorkshopScreen } from "../src/ColoringWorkshopScreen.tsx";
import { coloringWorkshop } from "../src/coloringWorkshop.ts";
import { coloringFixture } from "./coloringFixture.ts";
import { filterTaps } from "./taps.ts";
import type { Action } from "../src/coloring/index.ts";
import type { Language } from "../src/language/language.ts";

function open(language: Language = "en", failure = false) {
  const { model, dot, thumbnail } = coloringFixture();
  const write = vi.fn(async () => { if (failure) throw new Error("quota"); });
  const complete = vi.fn(async () => ({ completedCount: 1, earned: true }));
  const navigate = vi.fn();
  const session = coloringWorkshop(model.newWork("screen"), null, { model, write, complete, thumbnail: async () => thumbnail(), navigate });
  const painter = { width: 920, height: 620, render: vi.fn(), preview: vi.fn(), regionAt: vi.fn((): string | undefined => "body") };
  const view = render(<ColoringWorkshopScreen session={session} painter={painter} language={language} />);
  let canvas = view.container.querySelector("canvas")!;
  const captured = new Set<number>();
  const surface = () => {
    canvas = view.container.querySelector("canvas")!;
    canvas.getBoundingClientRect = () => new DOMRect(13, 17, 920, 620);
    canvas.setPointerCapture = id => { captured.add(id); };
    canvas.releasePointerCapture = id => { captured.delete(id); };
    canvas.hasPointerCapture = id => captured.has(id);
    return canvas;
  };
  surface();
  const step = (type: string, x: number, y: number, id = 1, time = 1000, target: Element = canvas) => {
    const event = new PointerEvent(type, { clientX: x + 13, clientY: y + 17, pointerId: id, button: 0, pointerType: "touch", bubbles: true, cancelable: true });
    Object.defineProperty(event, "timeStamp", { value: time });
    fireEvent(target, event);
    return event;
  };
  const tap = (x = 0, y = 0, time = 1000) => { step("pointerdown", x, y, 1, time); step("pointerup", x, y, 1, time + 30); };
  const settled = async () => { await act(async () => { await session.settled(); }); };
  return { ...view, surface, canvas, captured, step, tap, settled, session, painter, write, complete, navigate, dot };
}

it.each(["en", "ru"] as Language[])("offers 12 colors, 3 sizes and symbol controls in %s without saving tool choices", language => {
  const f = open(language);
  const colors = screen.getAllByRole("group", { name: language === "en" ? "COLOR" : "ЦВЕТ" });
  expect(within(colors[0]!).getAllByRole("button")).toHaveLength(12);
  const sizes = screen.getAllByRole("group", { name: language === "en" ? "SIZE" : "РАЗМЕР" });
  expect(within(sizes[0]!).getAllByRole("button")).toHaveLength(3);
  fireEvent.click(within(colors[0]!).getAllByRole("button")[6]!);
  fireEvent.click(within(sizes[0]!).getAllByRole("button")[2]!);
  fireEvent.click(screen.getByRole("button", { name: language === "en" ? "FILL" : "ЗАЛИВКА" }));
  expect(f.write).not.toHaveBeenCalled();
  expect(f.session.getSnapshot().work.revision).toBe(0);
  const done = screen.getByRole("button", { name: language === "en" ? "DONE" : "ГОТОВО" });
  expect((done as HTMLButtonElement).disabled).toBe(true);
  for (const b of f.container.querySelectorAll("button")) {
    expect(b.querySelector("svg, .coloring-dot, .coloring-swatch")).not.toBeNull();
    if (b.textContent) expect(b.textContent).toBe(b.textContent.toUpperCase());
  }
});

it("previews one continuous contact, commits once at release and retains selected color/size", async () => {
  const f = open();
  fireEvent.click(screen.getByRole("button", { name: "BLUE" }));
  fireEvent.click(screen.getByRole("button", { name: "BRUSH LARGE" }));
  f.step("pointerdown", 0, 0); f.step("pointermove", 1, 0); f.step("pointerup", 2, 0);
  await f.settled();
  const action: Action = { kind: "stroke", color: "#42a5f5", size: 40, points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }] };
  expect(f.session.getSnapshot().work.actions).toEqual([action]);
  expect(f.painter.preview).toHaveBeenLastCalledWith(f.canvas, [], action);
  expect(f.write).toHaveBeenCalledTimes(1);
  expect(f.captured.size).toBe(0);
  expect(f.painter.render).toHaveBeenLastCalledWith(f.canvas, [action]);
});

it("ignores another finger on canvas and controls through its release after the drawing finger", async () => {
  const f = open();
  const fill = screen.getByRole("button", { name: "FILL" });
  f.step("pointerdown", 0, 0);
  f.step("pointerdown", 2, 0, 2);
  f.step("pointermove", 3, 0, 2);
  f.step("pointerup", 3, 0, 2);
  f.step("pointerdown", 2, 0, 3, 1010, fill);
  fireEvent.click(fill);
  f.step("pointerup", 1, 0);
  f.step("pointerup", 2, 0, 3, 1100, fill);
  fireEvent(fill, new PointerEvent("click", { pointerId: 3, bubbles: true, cancelable: true }));
  await f.settled();
  expect(fill.getAttribute("aria-pressed")).toBe("false");
  expect(f.session.getSnapshot().work.actions).toEqual([{ ...f.dot, points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }]);
});

it.each(["pointercancel", "lostpointercapture", "resize", "orientationchange", "blur", "visibilitychange", "unmount"])("discards an interrupted preview on %s and keeps earlier saved paint", async reason => {
  const f = open(); f.tap(); await f.settled();
  f.step("pointerdown", 2, 0, 1, 2000); f.step("pointermove", 3, 0);
  if (reason === "unmount") f.unmount();
  else if (reason === "pointercancel" || reason === "lostpointercapture") f.step(reason, 3, 0);
  else if (reason === "visibilitychange") {
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    onTestFinished(() => visibility.mockRestore());
    fireEvent(document, new Event(reason));
  } else fireEvent(window, new Event(reason));
  f.step("pointerup", 3, 0);
  await f.settled();
  expect(f.session.getSnapshot().work).toMatchObject({ revision: 1, actions: [f.dot] });
  expect(f.painter.render).toHaveBeenLastCalledWith(f.canvas, [f.dot]);
  expect(f.write).toHaveBeenCalledTimes(1);
  expect(f.captured.size).toBe(0);
});

it("uses the shared tap filter: a second tap adds no action and an accepted drag leaves the next contact available", async () => {
  filterTaps(); const f = open();
  f.tap(0, 0, 1000); await f.settled();
  fireEvent.click(screen.getByRole("button", { name: "BLUE" }));
  f.tap(0, 0, 1200); await f.settled();
  expect(f.session.getSnapshot().work.revision).toBe(1);
  f.step("pointerdown", -20, 0, 1, 2000);
  f.step("pointermove", 1, 0, 1, 2030);
  f.step("pointerup", 1, 0, 1, 2060); await f.settled();
  fireEvent.click(screen.getByRole("button", { name: "RED" }));
  f.tap(1, 0, 2100); await f.settled();
  expect(f.session.getSnapshot().work.actions).toHaveLength(3);
});

it("fill uses the painter's region hit and undo restores paint; outside fill adds no revision", async () => {
  const f = open(); f.tap(); await f.settled();
  fireEvent.click(screen.getByRole("button", { name: "FILL" }));
  fireEvent.click(screen.getByRole("button", { name: "BLUE" }));
  f.tap(); await f.settled();
  expect(f.session.getSnapshot().work.actions).toEqual([f.dot, { kind: "fill", region: "body", color: "#42a5f5" }]);
  fireEvent.click(screen.getByRole("button", { name: "UNDO" })); await f.settled();
  expect(f.session.getSnapshot().work.actions).toEqual([f.dot]);
  f.painter.regionAt.mockReturnValue(undefined); f.tap(); await f.settled();
  expect(f.session.getSnapshot().work.revision).toBe(3);
});

it("chooser sheets replace the canvas and return with the chosen option without adding paint", async () => {
  const f = open(); f.tap(); await f.settled();
  const work = f.session.getSnapshot().work;
  fireEvent.click(screen.getByRole("button", { name: "COLOR" }));
  expect(f.container.querySelector("canvas")).toBeNull();
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getAllByRole("button")).toHaveLength(13);
  fireEvent.click(within(dialog).getByRole("button", { name: "BLUE" }));
  f.surface();
  expect(f.session.getSnapshot().work).toBe(work);
  expect(f.painter.render).toHaveBeenLastCalledWith(f.surface(), work.actions);
  fireEvent.click(screen.getByRole("button", { name: "SIZE" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "BRUSH LARGE" }));
  f.surface(); f.tap(2, 0); await f.settled();
  expect(f.session.getSnapshot().work.actions.at(-1)).toMatchObject({ color: "#42a5f5", size: 40 });
});

it("shows save failure while retaining paint, traps modal focus and requires confirmed loss", async () => {
  const f = open("en", true); f.tap(); await f.settled();
  expect(screen.getByRole("status").textContent).toContain("COULDN’T SAVE");
  const dialog = screen.getByRole("alertdialog");
  expect(within(dialog).getByRole("button", { name: "RETRY" })).toBe(document.activeElement);
  const loss = within(dialog).getByRole("button", { name: "HOME WITHOUT SAVING" });
  loss.focus(); fireEvent.keyDown(loss, { key: "Tab" });
  expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "RETRY" }));
  fireEvent.click(loss);
  fireEvent.click(screen.getByRole("button", { name: "STAY" }));
  expect(f.session.getSnapshot().work.actions).toEqual([f.dot]);
  expect(f.navigate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "KEEP EDITING" }));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  f.tap(2, 0); await f.settled();
  expect(f.session.getSnapshot().work.actions).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "HOME" }));
  fireEvent.click(screen.getByRole("button", { name: "HOME WITHOUT SAVING" }));
  fireEvent.click(screen.getByRole("button", { name: "LEAVE" }));
  expect(f.navigate).toHaveBeenCalledWith({ destination: "home", work: expect.objectContaining({ revision: 0, actions: [] }) });
});

it("retains coalesced pen samples and the final endpoint as one stroke", async () => {
  const f = open(); f.step("pointerdown", 0, 0);
  const event = new PointerEvent("pointermove", { clientX: 16, clientY: 17, pointerId: 1, button: 0, bubbles: true });
  Object.defineProperty(event, "getCoalescedEvents", { value: () => [1, 2, 3].map(x => new PointerEvent("pointermove", { clientX: x + 13, clientY: 17 })) });
  fireEvent(f.canvas, event); f.step("pointerup", 3, 0); await f.settled();
  expect(f.session.getSnapshot().work.actions).toEqual([{ ...f.dot, points: [0, 1, 2, 3].map(x => ({ x, y: 0 })) }]);
});

it("blocks a second finger's legacy mouse click after the painting contact ends", async () => {
  const f = open();
  const fill = screen.getByRole("button", { name: "FILL" });
  f.step("pointerdown", 0, 0);
  f.step("pointerdown", 100, 100, 2, 1010, fill);
  f.step("pointerup", 1, 0);
  f.step("pointerup", 100, 100, 2, 1050, fill);
  fireEvent(fill, new MouseEvent("click", { detail: 1, bubbles: true, cancelable: true }));
  await f.settled();
  expect(fill.getAttribute("aria-pressed")).toBe("false");
  fireEvent.click(fill);
  expect(fill.getAttribute("aria-pressed")).toBe("true");
});

it("disables drawing, undo and tool controls until one pending completion commits", async () => {
  const f = open(); f.tap(); await f.settled();
  let commit!: (receipt: { completedCount: number; earned: boolean }) => void;
  f.complete.mockImplementationOnce(() => new Promise(resolve => { commit = resolve; }));
  const accepted = f.session.getSnapshot().work;
  const done = screen.getByRole("button", { name: "DONE" });
  await act(async () => { fireEvent.click(done); fireEvent.click(done); });
  for (const button of f.container.querySelectorAll("button")) {
    expect(button.disabled).toBe(true); fireEvent.click(button);
  }
  f.tap(2, 0);
  expect(f.session.getSnapshot().work).toBe(accepted);
  expect(f.complete).toHaveBeenCalledTimes(1); expect(f.navigate).not.toHaveBeenCalled();
  commit({ completedCount: 1, earned: true }); await f.settled();
  expect(f.navigate).toHaveBeenCalledExactlyOnceWith({ destination: "result", work: expect.objectContaining({ actions: accepted.actions, completed: true, rewarded: true }), completion: { completedCount: 1, earned: true } });
});
