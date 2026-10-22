import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { SandWritingScreen } from "../src/SandWritingScreen.tsx";
import { TEXTS } from "../src/language/texts.ts";
import type { Language } from "../src/language/language.ts";
import { writingCanvasSpy } from "./sandWritingCanvasSpy.ts";
import { filterTaps, tapAt } from "./taps.ts";
import { appStylesheet } from "./stylesheet.ts";
import { openWindow } from "./windowSizes.ts";

function openScreen(language: Language = "en", ratio = 1) {
  let rect = new DOMRect(13, 17, 800, 600);
  const measure = vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockImplementation(() => rect);
  onTestFinished(() => measure.mockRestore());
  vi.stubGlobal("devicePixelRatio", ratio);
  onTestFinished(() => { vi.unstubAllGlobals(); });
  const base = writingCanvasSpy(), grooves = writingCanvasSpy();
  const home = vi.fn();
  const view = render(<SandWritingScreen language={language} sandContext={(canvas) => canvas.classList.contains("sand-writing-base") ? base.context : grooves.context} onHome={home} />);
  const canvas = view.container.querySelector<HTMLCanvasElement>(".sand-writing-canvas")!;
  const captured = new Set<number>();
  canvas.setPointerCapture = vi.fn((pointer) => { captured.add(pointer); });
  canvas.hasPointerCapture = (pointer) => captured.has(pointer);
  canvas.releasePointerCapture = vi.fn((pointer) => { captured.delete(pointer); });
  return {
    ...view, canvas, base, grooves, home, captured,
    trigger: () => screen.getByRole<HTMLButtonElement>("button", { name: TEXTS[language].sandTipPicker }),
    marks: () => grooves.paths.filter(({ colour }) => colour === "#98723f"),
    resize(width: number, height: number) {
      rect = new DOMRect(13, 17, width, height);
      fireEvent(window, new Event("resize"));
    }
  };
}

function pointer(target: Element, type: string, x: number, y: number, pointerId = 1, extra: PointerEventInit = {}, samples?: [number, number][]) {
  const event = new PointerEvent(type, { clientX: x + 13, clientY: y + 17, pointerId, button: 0, bubbles: true, cancelable: true, ...extra });
  if (samples) Object.defineProperty(event, "getCoalescedEvents", { value: () => samples.map(([clientX, clientY]) => new PointerEvent(type, { clientX: clientX + 13, clientY: clientY + 17 })) });
  fireEvent(target, event);
}

function stroke(canvas: Element, x: number, y: number) {
  pointer(canvas, "pointerdown", x, y);
  pointer(canvas, "pointermove", x + 30, y + 40);
  pointer(canvas, "pointerup", x + 50, y + 60);
}

describe("sand writing input", () => {
  it.each(["pen", "mouse", "touch"])("captures a %s, keeps CSS coordinates and draws only new rounded segments", (pointerType) => {
    const app = openScreen();
    pointer(app.canvas, "pointerdown", 20, 30, 7, { pointerType });
    expect(app.canvas.setPointerCapture).toHaveBeenCalledWith(7);
    expect(app.captured.has(7)).toBe(true);
    pointer(app.canvas, "pointermove", 80, 90, 7, { pointerType });
    pointer(app.canvas, "pointerup", 120, 130, 7, { pointerType });
    expect(app.marks()).toEqual([
      { colour: "#98723f", width: 4, points: [[20, 30, 2]], rounded: true },
      { colour: "#98723f", width: 4, points: [[20, 30], [80, 90]], rounded: true },
      { colour: "#98723f", width: 4, points: [[80, 90], [120, 130]], rounded: true }
    ]);
    expect(app.canvas.releasePointerCapture).toHaveBeenCalledWith(7);
    expect(app.captured.size).toBe(0);
    expect(app.base.rectangles.filter(({ colour }) => colour === "#d9b77e")).toHaveLength(1);
  });

  it("uses every coalesced Pencil point, includes an uncoalesced endpoint and deduplicates it", () => {
    const app = openScreen();
    pointer(app.canvas, "pointerdown", 10, 20, 1, { pointerType: "pen" });
    pointer(app.canvas, "pointermove", 90, 100, 1, { pointerType: "pen" }, [[30, 70], [60, 40]]);
    pointer(app.canvas, "pointerup", 120, 110, 1, { pointerType: "pen" }, [[100, 120], [120, 110]]);
    expect(app.marks().map(({ points }) => points)).toEqual([
      [[10, 20, 2]], [[10, 20], [30, 70]], [[30, 70], [60, 40]],
      [[60, 40], [90, 100]], [[90, 100], [100, 120]], [[100, 120], [120, 110]]
    ]);
  });

  it.each(["pointercancel", "lostpointercapture"])("ignores other pointers and stops on %s without adding its coordinates", (ending) => {
    const app = openScreen();
    pointer(app.canvas, "pointerdown", 10, 20, 1);
    pointer(app.canvas, "pointerdown", 700, 500, 2);
    pointer(app.canvas, "pointermove", 750, 550, 2);
    pointer(app.canvas, ending, 750, 550, 2);
    pointer(app.canvas, "pointermove", 40, 60, 1);
    pointer(app.canvas, ending, 800, 600, 1);
    pointer(app.canvas, "pointermove", 300, 300, 1);
    pointer(app.canvas, "pointerup", 400, 400, 1);
    pointer(app.canvas, "pointerdown", 100, 200, 2);
    pointer(app.canvas, "pointerup", 100, 200, 2);
    expect(app.marks().map(({ points }) => points)).toEqual([[[10, 20, 2]], [[10, 20], [40, 60]], [[100, 200, 2]]]);
    expect(app.canvas.setPointerCapture).toHaveBeenCalledTimes(2);
  });

  it("ignores secondary mouse buttons and suppresses the long-press context menu", () => {
    const app = openScreen();
    pointer(app.canvas, "pointerdown", 20, 30, 1, { button: 2, pointerType: "mouse" });
    expect(app.marks()).toEqual([]);
    expect(fireEvent.contextMenu(app.canvas)).toBe(false);
    expect(getComputedStyle(app.canvas).touchAction).toBe("none");
    const style = getComputedStyle(app.canvas.closest("section")!);
    expect(style.getPropertyValue("-webkit-user-select")).toBe("none");
  });

  it("uses the root filter to swallow the whole stroke after a tap, but opens no window after a drag", () => {
    filterTaps();
    const app = openScreen();
    tapAt(app.canvas, 0, { x: 30, y: 40 });
    const first = [...app.marks()];
    const event = (type: string, time: number, x: number, y: number) => {
      const input = new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, button: 0, bubbles: true, cancelable: true });
      Object.defineProperty(input, "timeStamp", { value: time });
      fireEvent(app.canvas, input);
    };
    event("pointerdown", 100, 35, 45);
    event("pointermove", 150, 500, 500);
    event("pointerup", 200, 600, 500);
    expect(app.marks()).toEqual(first);
    event("pointerdown", 1000, 30, 40);
    event("pointermove", 1050, 200, 200);
    event("pointerup", 1100, 200, 200);
    const dragged = app.marks().length;
    event("pointerdown", 1150, 205, 205);
    event("pointermove", 1200, 300, 300);
    event("pointerup", 1250, 300, 300);
    expect(app.marks().slice(dragged).map(({ points }) => points)).toEqual([[[192, 188, 2]], [[192, 188], [287, 283]]]);
  });
});

describe("the retained drawing", () => {
  it.each([1, 1.5, 3])("clips and reveals both original edges at density %s without scaling or deleting strokes", (density) => {
    const app = openScreen("en", density);
    const ratio = Math.min(2, density);
    stroke(app.canvas, 5, 6);
    stroke(app.canvas, 730, 530);
    const original = [...app.marks()];
    expect([app.canvas.width, app.canvas.height]).toEqual([800 * ratio, 600 * ratio]);
    for (const [width, height] of [[400, 800], [800, 600]]) {
      const previous = app.marks().length;
      app.resize(width!, height!);
      expect([app.canvas.width, app.canvas.height]).toEqual([width! * ratio, height! * ratio]);
      expect(app.marks().slice(previous)).toEqual(original);
      expect(app.grooves.transforms.at(-1)).toEqual([ratio, 0, 0, ratio, 0, 0]);
      expect(app.grooves.cleared.at(-1)).toEqual([0, 0, width, height]);
    }
    stroke(app.canvas, 300, 200);
    expect(app.marks().at(-1)).toEqual({ colour: "#98723f", width: 4, points: [[330, 240], [350, 260]], rounded: true });
    app.unmount();
    const count = app.marks().length;
    app.resize(200, 100);
    expect(app.marks()).toHaveLength(count);
  });

  it("observes canvas size changes and disconnects the observer on leaving", () => {
    const callbacks: ResizeObserverCallback[] = [];
    const observe = vi.fn(), disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: ResizeObserverCallback) { callbacks.push(callback); }
      observe = observe;
      disconnect = disconnect;
    });
    onTestFinished(() => { vi.unstubAllGlobals(); });
    const app = openScreen();
    stroke(app.canvas, 10, 20);
    const original = [...app.marks()];
    expect(observe).toHaveBeenCalledWith(app.canvas);
    act(() => callbacks[0]!([], {} as ResizeObserver));
    expect(app.marks().slice(original.length)).toEqual(original);
    app.unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});

describe("the viewport", () => {
  it.each([[320, 568], [568, 320], [1024, 690], [690, 1024], [1920, 1080]])("fills %i by %i with safe corner controls and no scrolling or footer", (width, height) => {
    openWindow(width, height);
    const sheet = document.createElement("style");
    sheet.textContent = appStylesheet({ top: 11, right: 13, bottom: 17, left: 19 });
    document.head.append(sheet);
    onTestFinished(() => { sheet.remove(); });
    const footer = document.createElement("footer");
    footer.id = "version";
    document.body.append(footer);
    onTestFinished(() => { footer.remove(); });
    const app = openScreen("ru");
    const outer = getComputedStyle(app.canvas.closest("section")!);
    expect([outer.position, outer.inset, outer.overflow, outer.touchAction]).toEqual(["fixed", "0px", "hidden", "none"]);
    expect([getComputedStyle(document.documentElement).overflow, getComputedStyle(document.body).overflow, getComputedStyle(footer).display]).toEqual(["hidden", "hidden", "none"]);
    const surface = getComputedStyle(app.canvas);
    expect([surface.width, surface.height, surface.inset, surface.position]).toEqual(["100%", "100%", "0px", "absolute"]);
    const home = getComputedStyle(screen.getByRole("button", { name: "ДОМОЙ" }));
    const picker = getComputedStyle(app.trigger().parentElement!);
    expect([home.width, home.height, home.borderRadius, home.top, home.insetInlineStart, picker.top, picker.insetInlineEnd]).toEqual(["60px", "60px", "20px", "31px", "39px", "31px", "33px"]);
    expect(screen.queryByRole("heading")).toBeNull();
    expect(app.canvas.closest("section")!.textContent).toBe("248ОЧИСТИТЬ");
    expect(getComputedStyle(app.canvas.closest("section")!.querySelector(".sand-writing-options")!).visibility).toBe("hidden");
    fireEvent.click(app.trigger());
    const options = screen.getByRole("group", { name: "ТОЛЩИНА ЛИНИИ" });
    const style = getComputedStyle(options);
    expect([style.visibility, style.gridTemplateColumns]).toEqual(["visible", "repeat(3, 60px)"]);
    const clear = getComputedStyle(within(options).getByRole("button", { name: "ОЧИСТИТЬ" }));
    expect(clear.gridColumn).toBe("1 / -1");
    // jsdom does not lay out: budget the two rows and three columns from
    // the delivered CSS against the safe viewport, including the clear row.
    const panelWidth = 3 * 60 + 2 * parseFloat(style.gap) + 2 * parseFloat(style.padding);
    const panelHeight = 2 * parseFloat(clear.minHeight) + parseFloat(style.gap) + 2 * parseFloat(style.padding);
    expect(panelWidth).toBeLessThanOrEqual(width - 19 - 13 - 40);
    expect(parseFloat(picker.top) + parseFloat(style.top) + panelHeight).toBeLessThanOrEqual(height - 17 - 20);
  });
});

describe("the tip picker", () => {
  it.each(["en", "ru"] as const)("localizes controls in %s and applies all three tips only to subsequent strokes", (language) => {
    const app = openScreen(language);
    const text = TEXTS[language];
    expect(screen.getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual([text.home, text.sandTipPicker]);
    expect(screen.getByRole("button", { name: text.home }).textContent).toBe("");
    stroke(app.canvas, 10, 20);
    expect(app.marks().every(({ width }) => width === 4)).toBe(true);
    let selected = 4;
    for (const width of [8, 2, 4]) {
      fireEvent.click(app.trigger());
      const choices = screen.getByRole("group", { name: text.sandTipPicker });
      expect(document.activeElement).toBe(within(choices).getByRole("button", { name: text.sandTip(selected) }));
      expect(within(choices).getAllByRole("button").map((button) => button.textContent)).toEqual(["2", "4", "8", text.sandClear]);
      const prior = [...app.marks()];
      fireEvent.click(within(choices).getByRole("button", { name: text.sandTip(width) }));
      expect(document.activeElement).toBe(app.trigger());
      expect(app.trigger().getAttribute("aria-expanded")).toBe("false");
      stroke(app.canvas, width * 50, 100);
      expect(app.marks().slice(0, prior.length)).toEqual(prior);
      expect(app.marks().slice(prior.length).map(({ width: used }) => used)).toEqual([width, width, width]);
      fireEvent.click(app.trigger());
      expect(screen.getByRole("button", { name: text.sandTip(width) }).getAttribute("aria-pressed")).toBe("true");
      fireEvent.keyDown(document, { key: "Escape" });
      selected = width;
    }
    expect(app.home).not.toHaveBeenCalled();
  });

  it("clears from inside the picker, retains the selected width and restores focus", () => {
    const app = openScreen();
    expect(screen.queryByRole("button", { name: "CLEAR" })).toBeNull();
    fireEvent.click(app.trigger());
    fireEvent.click(screen.getByRole("button", { name: TEXTS.en.sandTip(8) }));
    stroke(app.canvas, 10, 20);
    fireEvent.click(app.trigger());
    fireEvent.click(screen.getByRole("button", { name: "CLEAR" }));
    expect(document.activeElement).toBe(app.trigger());
    const before = app.marks().length;
    expect(app.grooves.cleared.at(-1)).toEqual([0, 0, 800, 600]);
    app.resize(400, 800);
    expect(app.marks()).toHaveLength(before);
    stroke(app.canvas, 100, 100);
    expect(app.marks().slice(before).map(({ width }) => width)).toEqual([8, 8, 8]);
  });

  it("closes on Escape, outside clicks and Tab without losing focus to a hidden option", async () => {
    const app = openScreen();
    const user = userEvent.setup();
    fireEvent.click(app.trigger());
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(document.activeElement).toBe(app.trigger());
    fireEvent.click(app.trigger());
    fireEvent.click(app.canvas);
    expect(app.trigger().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(app.trigger());
    fireEvent.click(app.trigger());
    act(() => screen.getByRole<HTMLButtonElement>("button", { name: "CLEAR" }).focus());
    await user.tab();
    expect(app.trigger().getAttribute("aria-expanded")).toBe("false");
    expect(app.canvas.closest("section")!.querySelector(".sand-writing-options")?.contains(document.activeElement)).toBe(false);
    fireEvent.click(app.trigger());
    const home = screen.getByRole<HTMLButtonElement>("button", { name: "HOME" });
    act(() => home.focus());
    fireEvent.click(home);
    expect(document.activeElement).toBe(home);
    expect(app.home).toHaveBeenCalledOnce();
    expect(app.marks()).toEqual([]);
  });

  it("stops an active stroke on opening, dismisses on canvas contact without drawing and follows root protection for controls", () => {
    filterTaps();
    const app = openScreen();
    tapAt(app.trigger(), 0, { x: 780, y: 40 });
    const selected = screen.getByRole("button", { name: TEXTS.en.sandTip(4) });
    tapAt(selected, 100, { x: 780, y: 80 });
    expect(app.trigger().getAttribute("aria-expanded")).toBe("true");
    tapAt(app.canvas, 1000, { x: 300, y: 300 });
    expect(app.trigger().getAttribute("aria-expanded")).toBe("false");
    expect(app.marks()).toEqual([]);
    pointer(app.canvas, "pointerdown", 10, 20);
    fireEvent.click(app.trigger());
    pointer(app.canvas, "pointermove", 100, 200);
    pointer(app.canvas, "pointerup", 100, 200);
    expect(app.marks().map(({ points }) => points)).toEqual([[[10, 20, 2]]]);
    const home = screen.getByRole("button", { name: "HOME" });
    tapAt(home, 2000, { x: 40, y: 40 });
    tapAt(home, 2100, { x: 40, y: 40 });
    expect(app.home).toHaveBeenCalledOnce();
  });
});
