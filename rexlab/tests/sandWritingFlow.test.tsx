import { emptyLabyrinth } from "./support.ts";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { addTransitionType } from "react";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { App } from "../src/App.tsx";
import type { Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { SCREEN_CHANGE } from "../src/screens.ts";
import { badgeOf } from "./homePage.tsx";
import { writingCanvasSpy } from "./sandWritingCanvasSpy.ts";
import {
  PORTRAIT_LAYOUTS, SHIPPED_CATALOGUE, SHIPPED_DINOSAURS, countedStarts,
  emptyCare, emptyDig, emptyPairs, emptyProgress, emptySkeletons, emptySorting,
  englishDevice, fakeBodyPicture, featuredCard, featuring, gameDoor, homeTile,
  lightDevice, manualTimers, manualViewport, pageAtRest, symbolOf, unsetAgeLevel
} from "./support.ts";
import { openWindow } from "./windowSizes.ts";

vi.mock("react", async (actual) => {
  const react = await actual<typeof import("react")>();
  return { ...react, addTransitionType: vi.fn(react.addTransitionType) };
});

function openFlow(language: Language, portrait: boolean, featured: boolean, reduced: boolean) {
  const size = portrait ? [600, 800] as const : [1024, 690] as const;
  openWindow(size[0], size[1]);
  vi.stubGlobal("devicePixelRatio", 1.5);
  onTestFinished(() => { vi.unstubAllGlobals(); });
  const measure = vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect")
    .mockImplementation(() => new DOMRect(0, 0, window.innerWidth, window.innerHeight));
  onTestFinished(() => measure.mockRestore());
  const canvases = new Map<HTMLCanvasElement, ReturnType<typeof writingCanvasSpy>>();
  const sandContext = (canvas: HTMLCanvasElement) => {
    let spy = canvases.get(canvas);
    if (!spy) { spy = writingCanvasSpy(); canvases.set(canvas, spy); }
    return spy.context;
  };
  const footer = Object.assign(document.createElement("footer"), { id: "version", textContent: "v0.10.24" });
  document.body.append(footer);
  onTestFinished(() => footer.remove());
  const viewport = manualViewport(portrait ? "portrait" : "landscape");
  const timers = manualTimers();
  const starts = countedStarts();
  render(<App {...emptyLabyrinth()}
    dinosaurs={SHIPPED_DINOSAURS} catalogue={SHIPPED_CATALOGUE} bodyPicture={fakeBodyPicture}
    random={() => 0} viewport={viewport} portraitLayouts={PORTRAIT_LAYOUTS}
    progress={emptyProgress()} {...englishDevice()} deviceLanguage={language}
    nameVersion={(name) => footer.setAttribute("aria-label", name)}
    {...lightDevice()} {...unsetAgeLevel()} {...emptyCare()} {...emptySorting()}
    {...emptyPairs()} {...emptySkeletons()} {...emptyDig()} sandContext={sandContext}
    {...pageAtRest()} {...featuring(featured ? "sandWriting" : "compare")}
    startCounter={starts.startCounter} {...timers} reducedMotion={() => reduced}
  />);
  vi.mocked(addTransitionType).mockClear();
  return { size, viewport, timers, starts: starts.counted, canvases, footer };
}

const canvas = () => document.querySelector<HTMLCanvasElement>(".sand-writing-canvas")!;
const changes = () => vi.mocked(addTransitionType).mock.calls.map(([type]) => type);
const gateShown = () => document.querySelector(".orientation-gate")!.hasAttribute("data-shown");

const cases = (["en", "ru"] as const).flatMap((language) => [false, true].flatMap((portrait) =>
  [false, true].flatMap((featured) => [false, true].map((reduced) => [language, portrait, featured, reduced] as const))));

describe("sand writing through Home", () => {
  it.each(cases)("in %s, portrait %s, featured %s, reduced motion %s: opens once, leaves Home intact and reopens fresh", async (language, portrait, featured, reduced) => {
    const app = openFlow(language, portrait, featured, reduced);
    const text = TEXTS[language];
    const door = featured ? featuredCard() : homeTile(text.sandWriting);
    expect(door.getAttribute("aria-label")).toBe(text.sandWriting);
    expect(text.sandWriting).toBe(text.sandWriting.toLocaleUpperCase(language));
    expect(symbolOf(door)).toBe("pencil");
    expect(door.querySelector("img")).toBeNull();
    expect(badgeOf(door)).toBeNull();
    expect(app.starts).toEqual([]);
    const layout = () => {
      const home = getComputedStyle(document.querySelector(".home")!);
      return [home.display, home.position, home.padding, getComputedStyle(document.body).overflow,
        getComputedStyle(document.documentElement).overflow, getComputedStyle(app.footer).display, app.footer.getAttribute("aria-label")];
    };
    const initialLayout = layout();
    expect(initialLayout[5]).not.toBe("none");
    expect(gateShown()).toBe(false);

    // Both activations reach the same Home door before React commits it.
    await act(async () => { fireEvent.click(door); fireEvent.click(door); });
    const first = canvas();
    const drawing = app.canvases.get(first)!;
    const marks = () => drawing.paths.filter(({ colour }) => colour === "#98723f");
    expect(app.starts).toEqual(["sandWriting"]);
    expect(changes()).toEqual([SCREEN_CHANGE]);
    expect(gateShown()).toBe(false);
    expect(screen.getByRole("region", { name: text.sandWriting })).toBe(first.closest("section"));
    expect([first.width, first.height]).toEqual(app.size.map((side) => side * 1.5));
    expect(drawing.transforms.at(-1)).toEqual([1.5, 0, 0, 1.5, 0, 0]);
    expect(marks()).toEqual([]);
    expect(document.querySelector(".home")).toBeNull();
    expect(getComputedStyle(app.footer).display).toBe("none");
    expect(getComputedStyle(document.body).overflow).toBe("hidden");
    const home = screen.getByRole("button", { name: text.home });
    expect(home.textContent).toBe("");
    fireEvent.click(screen.getByRole("button", { name: text.sandTipPicker }));
    fireEvent.click(screen.getByRole("button", { name: text.sandTip(8) }));
    fireEvent.pointerDown(first, { pointerId: 1, button: 0, clientX: 30, clientY: 40 });
    fireEvent.pointerUp(first, { pointerId: 1, button: 0, clientX: 50, clientY: 60 });
    expect(marks().map(({ width }) => width)).toEqual([8, 8]);

    for (const [size, upright] of [["tall", true], ["tall-narrow", true], ["tall-narrow", false], ["wide-short", false], ["wide", false]] as const) {
      act(() => app.viewport.resize(size, upright));
      expect(gateShown()).toBe(false);
      expect(canvas()).toBe(first);
      expect(first.closest(".gated-screen")!.hasAttribute("inert")).toBe(false);
      act(() => app.timers.settle());
    }
    expect(app.starts).toEqual(["sandWriting"]);
    expect(changes()).toEqual([SCREEN_CHANGE]);
    act(() => app.viewport.turn(portrait ? "portrait" : "landscape"));
    act(() => app.timers.settle());
    fireEvent.click(screen.getByRole("button", { name: text.sandTipPicker }));
    fireEvent.click(home);
    expect(first.isConnected).toBe(false);
    expect(gateShown()).toBe(false);
    expect(layout()).toEqual(initialLayout);
    expect(app.footer.textContent).toBe("v0.10.24");
    expect(changes()).toEqual([SCREEN_CHANGE, SCREEN_CHANGE]);

    fireEvent.click(gameDoor(text.sandWriting));
    const second = canvas();
    expect(second).not.toBe(first);
    expect(app.canvases.get(second)!.paths).toEqual([]);
    fireEvent(window, new Event("resize"));
    expect(app.canvases.get(second)!.paths).toEqual([]);
    expect(screen.getByRole("button", { name: text.sandTipPicker }).getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: text.sandTipPicker }));
    expect(screen.getByRole("button", { name: text.sandTip(4) }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: text.sandTip(4) }));
    fireEvent.pointerDown(second, { pointerId: 2, button: 0, clientX: 70, clientY: 80 });
    fireEvent.pointerUp(second, { pointerId: 2, button: 0, clientX: 90, clientY: 100 });
    expect(app.canvases.get(second)!.paths.filter(({ colour }) => colour === "#98723f").map(({ width }) => width)).toEqual([4, 4]);
    expect(app.starts).toEqual(["sandWriting", "sandWriting"]);
    expect(changes()).toEqual([SCREEN_CHANGE, SCREEN_CHANGE, SCREEN_CHANGE]);
  });
});
