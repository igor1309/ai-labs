import { act, fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, onTestFinished } from "vitest";
import type { PortraitLayouts } from "../src/App.tsx";
import { TEXTS } from "../src/language/texts.ts";
import { PROGRESS_KEY } from "../src/localProgress.ts";
import { board, cleared, drag, openDigApp, placeBoard } from "./digApp.tsx";
import { appStylesheet, type SafeArea } from "./stylesheet.ts";
import { homeTile, manualViewport, memoryStorage } from "./support.ts";
import { openWindow, styleAt, type WindowSize } from "./windowSizes.ts";

// DIG's board at Hatchling on an iPhone on its side, full screen: the
// smallest, two common ones and the largest, each with its insets.
const PHONES = [
  [568, 320, { top: 0, right: 0, bottom: 0, left: 0 }],
  [667, 375, { top: 0, right: 0, bottom: 21, left: 0 }],
  [852, 393, { top: 0, right: 59, bottom: 21, left: 59 }],
  [932, 430, { top: 0, right: 59, bottom: 21, left: 59 }]
] as const;
const LANGUAGES = ["en", "ru"] as const;
const EVERY = PHONES.flatMap((phone) => LANGUAGES.map((language) => [...phone, language] as const));

const LAYOUTS: PortraitLayouts = { home: ["tall", "tall-narrow"], "dig-board": ["tall", "tall-narrow"] };

const part = (selector: string, root: ParentNode = document) => {
  const found = root.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector}`);
  return found;
};

function openBoard(size: WindowSize, insets: SafeArea, language: "en" | "ru" = "en") {
  openWindow(...size);
  const sheet = Object.assign(document.createElement("style"), { textContent: appStylesheet(insets) });
  document.head.append(sheet);
  onTestFinished(() => {
    sheet.remove();
    delete document.documentElement.dataset.size;
  });
  const viewport = manualViewport("landscape", { left: insets.left, right: insets.right });
  viewport.resize("wide-short", false);
  const storage = memoryStorage({ [PROGRESS_KEY]: JSON.stringify({ schemaVersion: 1, games: { dig: { dug: [], badges: [] } } }) });
  const app = openDigApp({ viewport, portraitLayouts: LAYOUTS, ageLevel: { level: "hatchling", revision: "parent" }, storage, language });
  fireEvent.click(homeTile(TEXTS[language].dig));
  return { ...app, viewport };
}

describe("DIG's board at Hatchling in a wide-short window", () => {
  it.each(EVERY)("stands the sand whole under a 48-pixel bar at %i by %i in %s", (width, height, insets, language) => {
    const size: WindowSize = [width, height];
    openBoard(size, insets, language);
    const at = (selector: string) => styleAt(part(selector), size);
    expect([document.documentElement.dataset.size, part(".orientation-gate").hasAttribute("data-shown")]).toEqual(["wide-short", false]);
    const page = at(".dig-board-screen");
    expect([page.px("padding-top"), page.px("padding-right"), page.px("padding-bottom"), page.px("padding-left"), page.rowGap()]).toEqual([8, 20 + insets.right, 12 + insets.bottom, 20 + insets.left, 8]);
    expect(page.value("overflow")).toBe("hidden");
    const bar = at(".dig-bar");
    expect([bar.value("height"), bar.columnGap()]).toEqual(["48px", 8]);
    // HOME a 48 square of its house, its name kept for screen readers.
    const home = styleAt(screen.getByRole("button", { name: TEXTS[language].home }), size);
    expect([home.value("width"), home.value("height"), home.px("padding-left"), home.value("justify-content")]).toEqual(["48px", "48px", 0, "center"]);
    const name = styleAt(part(".dig-bar .home-button .upright-hidden"), size);
    expect([name.value("position"), name.value("clip-path")]).toEqual(["absolute", "inset(50%)"]);
    // The brushes 44 inside a picker of 48, the FIELD GUIDE 48, DUG UP 40.
    const picker = at(".dig-brush-picker");
    expect([picker.value("height"), picker.px("padding-left")]).toEqual(["48px", 2]);
    for (const option of [TEXTS[language].brush, TEXTS[language].wideBrush]) {
      const brush = styleAt(screen.getByRole("button", { name: option }), size);
      expect([brush.value("width"), brush.value("height")]).toEqual(["44px", "44px"]);
    }
    const guide = at(".dig-field-guide-button");
    expect([guide.value("height"), guide.px("font-size")]).toEqual(["48px", 18]);
    const chip = at(".dig-chip");
    expect([chip.value("height"), chip.px("font-size")]).toEqual(["40px", 16]);
    // The title, its mark 40, takes the room the rest leave: each part
    // at its widest, the guide's count three digits and DUG UP's "52/52"
    // five glyphs, each at Lexend's widest 0.68 em.
    expect(at(".dig-board-screen .dig-mark").value("width")).toBe("40px");
    const pickerWidth = 2 * 2 + 2 * 44 + picker.columnGap();
    const guideWidth = guide.px("padding-left") + guide.px("padding-right") + 26 + guide.columnGap() + 3 * 0.68 * 18;
    const chipWidth = 2 * chip.px("padding-left") + 20 + chip.columnGap() + 5 * 0.68 * 16;
    const room = width - 40 - insets.left - insets.right - 48 - pickerWidth - guideWidth - chipWidth - 4 * 8 - 40 - 8;
    expect(at(".dig-board-screen .dig-title-words").value("font-size")).toBe("min(24px, (100cqi - 48px) / (var(--letters) * 0.75))");
    const title = TEXTS[language].dig;
    expect(Math.min(24, room / (title.length * 0.75)), title).toBeGreaterThanOrEqual(16);
    // The sand as tall as the room under the bar, centred, at 4:3.
    const sand = styleAt(board(), size);
    expect([sand.value("height"), sand.value("aspect-ratio"), sand.value("touch-action")]).toEqual(["100%", "var(--frame-width) / var(--frame-height)", "none"]);
    const body = at(".dig-body");
    expect([body.value("flex").replace("0px", "0"), body.value("max-height") || "none", body.value("justify-content"), body.value("align-items"), body.px("min-height")]).toEqual(["1 1 0", "none", "center", "center", 0]);
    const tall = height - 8 - 48 - 8 - 12 - insets.bottom;
    expect(Math.min(tall, ((width - 40 - insets.left - insets.right) * 3) / 4)).toBeGreaterThanOrEqual(220);
  });

  it("keeps the round and the brush when the phone turns upright mid-round", () => {
    const { viewport } = openBoard([852, 393], PHONES[2][2]);
    placeBoard(800);
    fireEvent.click(screen.getByRole("button", { name: TEXTS.en.wideBrush }));
    drag([[0, 100], [800, 100]]);
    const dug = cleared();
    expect(dug).toBeGreaterThan(0);
    act(() => viewport.resize("tall-narrow", true));
    openWindow(393, 852);
    expect(document.documentElement.dataset.size).toBe("tall-narrow");
    expect(cleared()).toBe(dug);
    expect(part(".dig-brush-menu .dig-brush-dot").hasAttribute("data-wide")).toBe(true);
    act(() => viewport.resize("wide-short", false));
    openWindow(852, 393);
    expect(cleared()).toBe(dug);
    expect(screen.getByRole("button", { name: TEXTS.en.wideBrush }).getAttribute("aria-pressed")).toBe("true");
  });
});
