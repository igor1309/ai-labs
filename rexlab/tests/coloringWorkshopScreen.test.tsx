import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, onTestFinished, vi } from "vitest";
import { ColoringWorkshopScreen } from "../src/ColoringWorkshopScreen.tsx";
import { coloringWorkshop } from "../src/coloringWorkshop.ts";
import { coloringFixture } from "./coloringFixture.ts";
import { tapAt } from "./taps.ts";
import { browserInput } from "../src/root.ts";
import { InputArbitrationContext } from "../src/inputArbitration.ts";
import type { Action } from "../src/coloring/index.ts";
import type { Language } from "../src/language/language.ts";

function open(language: Language = "en", failure = false, sharedFilter = false) {
  const { model, dot, thumbnail } = coloringFixture();
  const write = vi.fn(async () => { if (failure) throw new Error("quota"); });
  const complete = vi.fn(async () => ({ completedCount: 1, earned: true }));
  const navigate = vi.fn();
  const session = coloringWorkshop(model.newWork("screen"), null, { model, write, complete, thumbnail: async () => thumbnail(), navigate });
  const painter = { width: 920, height: 620, render: vi.fn(), preview: vi.fn(), regionAt: vi.fn((): string | undefined => "body") };
  const input = sharedFilter ? browserInput(window) : browserInput(window, () => true);
  onTestFinished(input.stop);
  const view = render(<ColoringWorkshopScreen session={session} painter={painter} language={language} />, {
    wrapper: ({ children }) => <InputArbitrationContext value={input.arbitrate}>{children}</InputArbitrationContext>
  });
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

function animationFrames() {
  const pending = new Map<number, FrameRequestCallback>();
  let id = 0;
  const request = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(callback => { pending.set(++id, callback); return id; });
  const cancel = vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(id => { pending.delete(id); });
  onTestFinished(() => { request.mockRestore(); cancel.mockRestore(); });
  return { pending, flush() {
    const callbacks = [...pending.values()]; pending.clear();
    act(() => callbacks.forEach(callback => callback(0)));
  } };
}

it("batches coalesced samples per frame in one contact buffer and commits the release before a pending frame", async () => {
  const frames = animationFrames();
  const f = open();
  f.step("pointerdown", 0, 0);
  const points = f.painter.preview.mock.calls[0]![2].points;
  for (let i = 1; i <= 10; i++) f.step("pointermove", i, 0);
  expect(f.painter.preview).toHaveBeenCalledTimes(1);
  expect(frames.pending.size).toBe(1);
  frames.flush();
  expect(f.painter.preview).toHaveBeenCalledTimes(2);
  expect(f.painter.preview.mock.lastCall![2].points).toBe(points);
  expect(points).toEqual(Array.from({ length: 11 }, (_, x) => ({ x, y: 0 })));
  const event = new PointerEvent("pointerup", { clientX: 26, clientY: 17, pointerId: 1, button: 0, bubbles: true, cancelable: true });
  Object.defineProperty(event, "getCoalescedEvents", { value: () => [{ clientX: 24, clientY: 18 }, { clientX: 25, clientY: 17 }] });
  f.step("pointermove", 10, 0);
  fireEvent(f.canvas, event);
  await f.settled();
  expect(frames.pending.size).toBe(0);
  frames.flush();
  expect(f.painter.preview).toHaveBeenCalledTimes(2);
  const accepted = f.session.getSnapshot().work.actions[0] as Extract<Action, { kind: "stroke" }>;
  expect(accepted.points).toEqual([...points.slice(0, 11), { x: 11, y: 1 }, { x: 12, y: 0 }, { x: 13, y: 0 }]);
  expect(accepted.points).not.toBe(points);
  expect(Object.isFrozen(accepted.points)).toBe(true);
  f.step("pointerdown", 14, 0);
  f.step("pointermove", 15, 0);
  expect(accepted.points.at(-1)).toEqual({ x: 13, y: 0 });
});

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
  const frames = animationFrames();
  const f = open(); f.tap(); await f.settled();
  f.step("pointerdown", 2, 0, 1, 2000); f.step("pointermove", 3, 0);
  expect(frames.pending.size).toBe(1);
  if (reason === "unmount") f.unmount();
  else if (reason === "pointercancel" || reason === "lostpointercapture") f.step(reason, 3, 0);
  else if (reason === "visibilitychange") {
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    onTestFinished(() => visibility.mockRestore());
    fireEvent(document, new Event(reason));
  } else fireEvent(window, new Event(reason));
  expect(frames.pending.size).toBe(0);
  const previews = f.painter.preview.mock.calls.length;
  frames.flush();
  expect(f.painter.preview).toHaveBeenCalledTimes(previews);
  f.step("pointerup", 3, 0);
  await f.settled();
  expect(f.session.getSnapshot().work).toMatchObject({ revision: 1, actions: [f.dot] });
  expect(f.painter.render).toHaveBeenLastCalledWith(f.canvas, [f.dot]);
  expect(f.write).toHaveBeenCalledTimes(1);
  expect(f.captured.size).toBe(0);
});

it("uses the shared tap filter: a second tap adds no action and an accepted drag leaves the next contact available", async () => {
  const f = open("en", false, true);
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

it.each(["canvas", "control"])("keeps the next stroke after a nearby ignored finger on %s outlives an accepted drag", async target => {
  const f = open("en", false, true);
  const fill = screen.getByRole("button", { name: "FILL" });
  const ignoredTarget = target === "canvas" ? f.canvas : fill;
  f.step("pointerdown", -20, 0, 1, 1000);
  f.step("pointermove", 1, 0, 1, 1030);
  f.step("pointerdown", 21, 0, 2, 1040, ignoredTarget);
  fireEvent.click(fill);
  f.step("pointerup", 1, 0, 1, 1060);
  f.step("pointerup", 21, 0, 2, 1070, ignoredTarget);
  fireEvent(ignoredTarget, new PointerEvent("click", { pointerId: 2, detail: 1, bubbles: true, cancelable: true }));
  fireEvent.click(screen.getByRole("button", { name: "BLUE" }));
  f.step("pointerdown", 1, 0, 1, 1100);
  f.step("pointermove", 2, 0, 1, 1120);
  f.step("pointerup", 3, 0, 1, 1140);
  await f.settled();
  expect(fill.getAttribute("aria-pressed")).toBe("false");
  expect(f.session.getSnapshot().work.actions).toEqual([
    { ...f.dot, points: [{ x: -20, y: 0 }, { x: 1, y: 0 }] },
    { ...f.dot, color: "#42a5f5", points: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }] }
  ]);
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

it.each([
  { name: "body", point: { x: 1, y: 0 }, region: "body" },
  { name: "head", point: { x: 3, y: 0 }, region: "head" },
  { name: "outside", point: { x: -1, y: 0 }, region: undefined },
  { name: "protected", point: { x: 1, y: 1 }, region: undefined }
].flatMap(hit => [
  { layout: "native offset", left: 13, top: 17, width: 920, height: 620, scaleX: 1, scaleY: 1 },
  { layout: "scaled offset", left: 101, top: 73, width: 460, height: 155, scaleX: 0.5, scaleY: 0.25 }
].map(bounds => ({ ...hit, ...bounds }))))("forwards the logical $name fill point with $layout bounds and applies only a region hit", async ({ point, region, left, top, width, height, scaleX, scaleY }) => {
  const f = open();
  f.canvas.getBoundingClientRect = () => new DOMRect(left, top, width, height);
  f.painter.regionAt.mockReturnValue(region);
  fireEvent.click(screen.getByRole("button", { name: "FILL" }));
  fireEvent.click(screen.getByRole("button", { name: "BLUE" }));
  const contact = { clientX: left + point.x * scaleX, clientY: top + point.y * scaleY, pointerId: 1, button: 0 };
  fireEvent.pointerDown(f.canvas, contact);
  fireEvent.pointerUp(f.canvas, contact);
  await f.settled();
  expect(f.painter.regionAt).toHaveBeenCalledExactlyOnceWith(point);
  const actions: Action[] = region ? [{ kind: "fill", color: "#42a5f5", region }] : [];
  expect(f.session.getSnapshot().work).toMatchObject({ actions, revision: actions.length });
  expect(f.write).toHaveBeenCalledTimes(actions.length);
});

it.each(["en", "ru"] as Language[])("overlays the mounted canvas with a color picker in %s and paints with its selection", async language => {
  const f = open(language); f.tap(); await f.settled();
  const work = f.session.getSnapshot().work;
  const trigger = screen.getByRole("button", { name: language === "en" ? "COLOR" : "ЦВЕТ" });
  fireEvent.click(trigger);
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  expect(f.container.querySelector("canvas")).toBe(f.canvas);
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getAllByRole("button")).toHaveLength(13);
  const blue = within(dialog).getByRole("button", { name: language === "en" ? "BLUE" : "ГОЛУБОЙ" });
  expect(dialog.contains(document.activeElement)).toBe(true);
  f.tap(2, 0);
  expect(f.session.getSnapshot().work).toBe(work);
  fireEvent.click(blue);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(trigger);
  expect(f.container.querySelector("canvas")).toBe(f.canvas);
  expect(f.session.getSnapshot().work).toBe(work);
  expect(f.write).toHaveBeenCalledTimes(1);
  expect(trigger.querySelector(".coloring-swatch")?.getAttribute("style")).toContain("rgb(66, 165, 245)");
  fireEvent.click(screen.getByRole("button", { name: language === "en" ? "BRUSH LARGE" : "КИСТЬ БОЛЬШОЙ" }));
  f.tap(2, 0); await f.settled();
  expect(f.session.getSnapshot().work.actions.at(-1)).toMatchObject({ kind: "stroke", color: "#42a5f5", size: 40 });
});

it.each(["close", "Escape", "resize", "orientationchange"])("dismisses the picker by %s without changing paint or the selected color", async method => {
  const f = open(); f.tap(); await f.settled();
  const work = f.session.getSnapshot().work;
  const trigger = screen.getByRole("button", { name: "COLOR" });
  fireEvent.click(trigger);
  const dialog = screen.getByRole("dialog");
  if (method === "close") fireEvent.click(within(dialog).getByRole("button", { name: "CLOSE" }));
  else if (method === "Escape") fireEvent.keyDown(dialog, { key: "Escape" });
  else fireEvent(window, new Event(method));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(f.container.querySelector("canvas")).toBe(f.canvas);
  expect(document.activeElement).toBe(trigger);
  expect(f.session.getSnapshot().work).toBe(work);
  expect(f.write).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "RED" }).getAttribute("aria-pressed")).toBe("true");
});

it.each(["close", "selection"])("filters a second tap after picker %s dismissal before it can paint", async method => {
  const f = open("en", false, true);
  fireEvent.click(screen.getByRole("button", { name: "COLOR" }));
  const target = method === "close" ? within(screen.getByRole("dialog")).getByRole("button", { name: "CLOSE" }) : within(screen.getByRole("dialog")).getByRole("button", { name: "BLUE" });
  tapAt(target, 1000, { x: 15, y: 17 });
  expect(screen.queryByRole("dialog")).toBeNull();
  f.tap(2, 0, 1200); await f.settled();
  expect(f.session.getSnapshot().work.revision).toBe(0);
  expect(f.write).not.toHaveBeenCalled();
  f.tap(2, 0, 2000); await f.settled();
  expect(f.session.getSnapshot().work.actions).toEqual([{ ...f.dot, color: method === "close" ? "#ef5350" : "#42a5f5", points: [{ x: 2, y: 0 }] }]);
});

it("keeps keyboard focus inside the temporary picker", () => {
  open(); fireEvent.click(screen.getByRole("button", { name: "COLOR" }));
  const dialog = screen.getByRole("dialog");
  const buttons = within(dialog).getAllByRole("button");
  buttons.at(-1)!.focus(); fireEvent.keyDown(document.activeElement!, { key: "Tab" });
  expect(document.activeElement).toBe(buttons[0]);
  fireEvent.keyDown(document.activeElement!, { key: "Tab", shiftKey: true });
  expect(document.activeElement).toBe(buttons.at(-1));
});

it("keeps the palette closed when an extra finger touches it during painting", async () => {
  const f = open();
  const trigger = screen.getByRole("button", { name: "COLOR" });
  f.step("pointerdown", 0, 0);
  f.step("pointerdown", 100, 100, 2, 1010, trigger);
  fireEvent.click(trigger);
  f.step("pointerup", 1, 0);
  f.step("pointerup", 100, 100, 2, 1050, trigger);
  fireEvent(trigger, new PointerEvent("click", { pointerId: 2, bubbles: true, cancelable: true }));
  await f.settled();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(f.session.getSnapshot().work.actions).toEqual([{ ...f.dot, points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }]);
});

it.each(["SMALL", "MEDIUM", "LARGE"] as const)("selects the %s brush directly from fill without adding a revision", async label => {
  const f = open();
  const fill = screen.getByRole("button", { name: "FILL" });
  fireEvent.click(fill);
  const sizes = within(screen.getByRole("group", { name: "SIZE" }));
  for (const button of sizes.getAllByRole("button")) expect(button.getAttribute("aria-pressed")).toBe("false");
  const brush = sizes.getByRole("button", { name: `BRUSH ${label}` });
  fireEvent.click(brush);
  expect(brush.getAttribute("aria-pressed")).toBe("true");
  expect(brush.querySelector(".coloring-selection")).not.toBeNull();
  expect(fill.getAttribute("aria-pressed")).toBe("false");
  expect(f.write).not.toHaveBeenCalled();
  f.tap(); await f.settled();
  expect(f.session.getSnapshot().work.actions).toEqual([{ ...f.dot, size: { SMALL: 8, MEDIUM: 20, LARGE: 40 }[label] }]);
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
  const f = open("en", false, true);
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

it.each(["en", "ru"] as Language[])("chooses a brush size on its own sheet in %s without replacing paint or saving", language => {
  const f = open(language);
  const before = f.session.getSnapshot().work;
  const trigger = screen.getByRole("button", { name: language === "en" ? "SIZE" : "РАЗМЕР" });
  fireEvent.click(trigger);
  const dialog = screen.getByRole("dialog", { name: language === "en" ? "SIZE" : "РАЗМЕР" });
  expect(within(dialog).getAllByRole("button")).toHaveLength(4);
  fireEvent.click(within(dialog).getByRole("button", { name: language === "en" ? "BRUSH LARGE" : "КИСТЬ БОЛЬШОЙ" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(f.container.querySelector("canvas")).toBe(f.canvas);
  expect(f.session.getSnapshot().work).toBe(before);
  expect(f.write).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: language === "en" ? "BRUSH LARGE" : "КИСТЬ БОЛЬШОЙ" }).getAttribute("aria-pressed")).toBe("true");
});
