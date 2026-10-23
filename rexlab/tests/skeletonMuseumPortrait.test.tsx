import { act, screen, within } from "@testing-library/react";
import { describe, expect, it, onTestFinished } from "vitest";
import type { AppProps, PortraitLayouts, SizeClass } from "../src/App.tsx";
import { TEXTS } from "../src/language/texts.ts";
import { drawnOpacity, extendPart, turnFrame, TURN_TIMING } from "../src/root.ts";
import type { Box, TurnAnimation } from "../src/turnMotion.ts";
import { NAME_EMS } from "./nameWidths.ts";
import { finishLoading, keptSkeletons, openSkeletonsApp, savedSkeletons, type SkeletonsAppOptions } from "./skeletonsApp.tsx";
import { neededBy, sizeOf, WORD_EMS } from "./skeletonTextFit.ts";
import { appStylesheet, NO_SAFE_AREA, type SafeArea } from "./stylesheet.ts";
import { manualViewport } from "./support.ts";
import { openWindow, styleAt, type WindowSize } from "./windowSizes.ts";

const LAYOUTS: PortraitLayouts = { home: ["tall"], "skeletons-choice": ["tall"], "skeletons-museum": ["tall"] };
const WINDOWS: readonly WindowSize[] = [[600, 800], [744, 1133], [820, 1180], [1024, 1366]];
const IDS = ["tyrannosaurus", "triceratops", "stegosaurus", "brachiosaurus", "spinosaurus"];
const EARNED = { earned: ["tyrannosaurus", "triceratops"], bestScore: 2, rebuilding: ["triceratops"], badges: { tyrannosaurus: ["explorer"], triceratops: ["paleontologist"] } };
const part = (selector: string) => {
  const found = [...document.querySelectorAll<HTMLElement>(selector)].find((element) => !element.closest("[data-turn-frame], [data-fitted-picture]"));
  if (!found) throw new Error(`No ${selector}`);
  return found;
};
const stands = () => [...part(".skeleton-hall").querySelectorAll<HTMLElement>(":scope > .skeleton-stand")];
const gateShown = () => part(".orientation-gate").hasAttribute("data-shown");
const px = (value: string) => Number.parseFloat(value) || 0;

async function openMuseum(size: WindowSize, options: SkeletonsAppOptions = {}) {
  openWindow(...size);
  const viewport = options.viewport ?? manualViewport(size[0] > size[1] ? "landscape" : "portrait");
  const app = openSkeletonsApp({ portraitLayouts: LAYOUTS, storage: keptSkeletons(EARNED), ...options, viewport });
  const text = TEXTS[options.deviceLanguage === "ru-RU" ? "ru" : "en"];
  await app.user.click(screen.getByRole("button", { name: text.museum }));
  return { ...app, text };
}

// jsdom has no layout. Resolve the flex budget from the rendered rules,
// including the minimum that wraps a stand onto its own centred row.
function hallLayout(size: WindowSize, scrollbar = 0) {
  const at = (selector: string) => styleAt(part(selector), size);
  const page = at(".skeleton-museum-screen");
  const hall = at(".skeleton-hall");
  const stand = at(".skeleton-stand");
  const bar = at(".skeleton-bar");
  const another = at(".skeleton-bar-button");
  // Its full-width non-shrinking action must take the second row.
  expect([bar.value("flex-wrap"), bar.value("flex-shrink"), another.value("order"), another.value("flex-basis"), another.value("flex-shrink")]).toEqual(["wrap", "0", "1", "100%", "0"]);
  const width = size[0] - page.px("padding-left") - page.px("padding-right") - hall.px("padding-left") - hall.px("padding-right") - scrollbar;
  expect(stand.value("flex-basis")).toBe("calc(0.5 * (100% - 12px))");
  expect(stand.value("min-width")).toBe("min(262px, 100%)");
  const cardWidth = Math.max(Math.min(262, width), (width - hall.columnGap()) / 2);
  const columns = Math.floor((width + hall.columnGap()) / (cardWidth + hall.columnGap()));
  const rows = Math.ceil(stands().length / columns);
  const rowHeight = Math.max(stand.px("min-height"), at(".skeleton-stand-top").px("min-height") + at(".skeleton-exhibit").px("min-height") + at(".skeleton-stand-button").px("height") + 2 * stand.rowGap());
  const contentHeight = rowHeight * rows + hall.rowGap() * (rows - 1) + hall.px("padding-top") + hall.px("padding-bottom");
  const barHeight = styleAt(part(".skeleton-bar > .home-button"), size).px("height") + another.px("height") + bar.rowGap();
  const visibleHeight = size[1] - page.px("padding-top") - page.px("padding-bottom") - barHeight - page.rowGap();
  const actionWidth = size[0] - page.px("padding-left") - page.px("padding-right") - scrollbar;
  return { width, cardWidth, columns, rows, contentHeight, visibleHeight, barHeight, actionWidth, page, hall, stand };
}

describe("the upright skeleton museum", () => {
  it.each(WINDOWS)("lays out its five stands at %i by %i without shrinking the exhibits", async (width, height) => {
    const size = [width, height] as const;
    const { text } = await openMuseum(size);
    expect([document.documentElement.dataset.size, gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual(["tall", false, false]);
    const layout = hallLayout(size);
    expect([layout.columns, layout.rows]).toEqual([2, 3]);
    expect(layout.cardWidth).toBeGreaterThanOrEqual(262);
    expect([layout.hall.px("padding-left"), layout.hall.px("padding-right"), layout.hall.columnGap(), layout.hall.value("justify-content"), layout.page.value("overflow-x"), layout.page.value("overflow-y")]).toEqual([0, 0, 12, "center", "hidden", "auto"]);
    expect(layout.hall.value("flex-shrink")).toBe("0");
    expect(stands().map((stand) => stand.dataset.turnPart)).toEqual(IDS.map((id) => `skeleton-stand-${id}`));
    for (const stand of stands()) {
      const [top, exhibit, button] = [...stand.children].map((child) => styleAt(child, size));
      expect(top!.px("min-height") + exhibit!.px("min-height") + button!.px("height") + 2 * layout.stand.rowGap()).toBeLessThanOrEqual(layout.stand.px("min-height"));
      expect(exhibit!.px("min-height")).toBeGreaterThanOrEqual(96);
      expect(button!.px("height")).toBeGreaterThanOrEqual(44);
    }
    const another = styleAt(screen.getByRole("button", { name: text.buildAnother }), size);
    expect([another.value("order"), another.value("flex-basis"), another.value("width"), another.px("height")]).toEqual(["1", "100%", "100%", 56]);
    if (height === 800) expect(layout.contentHeight).toBeGreaterThan(layout.visibleHeight);
  });

  it.each((["en", "ru"] as const).flatMap((language) => (["light", "dark"] as const).map((theme) => [language, theme] as const)))("fits measured names and actions in %s, %s, at least as large as landscape", async (language, appearance) => {
    const { text, viewport } = await openMuseum([1024, 768], { deviceLanguage: language === "ru" ? "ru-RU" : "en-GB", appearance });
    const pageStyle = getComputedStyle(part(".skeleton-museum-screen"));
    const hallStyle = getComputedStyle(part(".skeleton-hall"));
    const baselineWidth = (1024 - px(pageStyle.paddingLeft) - px(pageStyle.paddingRight) - px(hallStyle.paddingLeft) - px(hallStyle.paddingRight) - 2 * px(hallStyle.gap.split(" ").at(-1)!)) / 3;
    const baseline = stands().map((stand) => [sizeOf(stand.querySelector("h2")!, baselineWidth), sizeOf(within(stand).getByRole("button"), baselineWidth)]);
    openWindow(600, 800);
    act(() => viewport.resize("tall", true));
    const { cardWidth: width, actionWidth } = hallLayout([600, 800]);
    stands().forEach((stand, index) => {
      const name = stand.querySelector("h2")!;
      const button = within(stand).getByRole("button");
      const nameSize = sizeOf(name, width);
      const actionSize = sizeOf(button, width);
      expect(nameSize).toBeGreaterThanOrEqual(baseline[index]![0]!);
      expect(actionSize).toBeGreaterThanOrEqual(baseline[index]![1]!);
      const top = getComputedStyle(name.parentElement!);
      const star = stand.querySelector(".skeleton-stand-star");
      expect((NAME_EMS[name.textContent!] ?? NaN) * nameSize + (star ? px(getComputedStyle(star).width) + px(top.gap) : 0)).toBeLessThanOrEqual(width);
      expect(neededBy(button, actionSize)).toBeLessThanOrEqual(width);
      expect(getComputedStyle(button).whiteSpace).toBe("nowrap");
    });
    const another = screen.getByRole("button", { name: text.buildAnother });
    expect(neededBy(another, sizeOf(another))).toBeLessThanOrEqual(actionWidth);
    const home = screen.getByRole("button", { name: text.home });
    expect([getComputedStyle(home).width, home.querySelector(".upright-hidden")?.textContent, home.querySelector("svg")?.getAttribute("width")]).toEqual(["56px", text.home, "24"]);
    const chips = [...part(".skeleton-bar").querySelectorAll(".skeleton-chip")];
    const bar = getComputedStyle(part(".skeleton-bar"));
    const titleRoom = 536 - 56 - chips.reduce((sum, chip) => sum + neededBy(chip, sizeOf(chip)), 0) - 3 * px(bar.gap);
    const title = part(".skeleton-title-words");
    expect(getComputedStyle(title).fontSize).toBe("min(40px, (100cqi - 66px) / (var(--letters) * 0.8))");
    const titleSize = Math.min(40, (titleRoom - 66) / (text.museum.length * 0.8));
    expect(titleSize).toBeGreaterThan(0);
    expect((WORD_EMS[text.museum] ?? NaN) * titleSize + 66).toBeLessThanOrEqual(titleRoom);
    const rebuilding = stands()[1]!;
    for (const ring of [rebuilding.querySelector(".skeleton-exhibit")!, within(rebuilding).getByRole("button")]) {
      expect(getComputedStyle(ring).outline).toContain("dashed");
      expect(getComputedStyle(ring).outlineOffset).toBe("-1px");
    }
  });

  it.each([
    [[600, 800], { ...NO_SAFE_AREA, top: 24, bottom: 20 }, 0, 2],
    [[600, 800], { top: 24, bottom: 20, left: 40, right: 40 }, 0, 1],
    [[600, 800], { ...NO_SAFE_AREA, top: 24, bottom: 20 }, 1, 1],
    [[820, 1180], { ...NO_SAFE_AREA, top: 24, bottom: 20 }, 0, 2]
  ] as const)("keeps actions reachable at %j with safe areas %j and scrollbar %i", async (size, insets: SafeArea, scrollbar, columns) => {
    const sheet = document.createElement("style");
    sheet.textContent = appStylesheet(insets);
    document.head.append(sheet);
    onTestFinished(() => sheet.remove());
    await openMuseum(size);
    const layout = hallLayout(size, scrollbar);
    expect(layout.columns).toBe(columns);
    expect(layout.cardWidth).toBeLessThanOrEqual(layout.width);
    expect([layout.page.px("padding-top"), layout.page.px("padding-bottom")]).toEqual([64, 68]);
    expect(layout.page.value("height")).toBe(`${size[1]}px`);
    const scrolledToEnd = Math.max(0, layout.contentHeight - layout.visibleHeight);
    const lastActionBottom = layout.page.px("padding-top") + layout.barHeight + layout.page.rowGap() + layout.contentHeight - layout.hall.px("padding-bottom") - scrolledToEnd;
    expect(lastActionBottom).toBeLessThanOrEqual(size[1] - insets.bottom);
  });

  it("keeps an unearned collection empty upright", async () => {
    const { text } = await openMuseum([600, 800], { storage: keptSkeletons({ earned: [], rebuilding: [] }) });
    expect(stands().map((stand) => [stand.dataset.state, !!stand.querySelector(".skeleton-silhouette"), stand.querySelectorAll(".skeleton-stand-star, .level-badge").length])).toEqual(IDS.map(() => ["empty", true, 0]));
    expect([screen.getByLabelText(text.starsEarned).textContent, screen.queryByLabelText(text.bestScore)]).toEqual(["0/5", null]);
  });
});

// The turn engine measures boxes through its existing seam. These boxes
// stand in for flex layout, whose fit is checked above from the stylesheet.
function museumBox(element: Element): Box {
  const tall = document.documentElement.dataset.size === "tall";
  const width = window.innerWidth;
  const index = IDS.findIndex((id) => element.getAttribute("data-turn-part") === `skeleton-stand-${id}`);
  if (index >= 0) {
    const columns = tall ? 2 : 3;
    const cardWidth = tall ? (width - 64 - 12) / 2 : (width - 112 - 64 - 64) / 3;
    const gap = tall ? 12 : 32;
    const count = Math.min(columns, IDS.length - Math.floor(index / columns) * columns);
    return { left: (width - count * cardWidth - (count - 1) * gap) / 2 + (index % columns) * (cardWidth + gap), top: (tall ? 220 : 148) + Math.floor(index / columns) * (tall ? 260 : 290), width: cardWidth, height: tall ? 244 : 274 };
  }
  if (element.matches(".skeleton-hall")) return { left: tall ? 32 : 56, top: tall ? 196 : 124, width: width - (tall ? 64 : 112), height: window.innerHeight - (tall ? 244 : 172) };
  return { left: tall ? 32 : 56, top: element.matches(".skeleton-bar-button") && tall ? 112 : 40, width: element.matches(".skeleton-bar-button") && tall ? width - 64 : 56, height: 56 };
}

function collection() {
  return {
    stands: stands(),
    shown: stands().map((stand) => [stand.getAttribute("aria-label"), stand.dataset.state, stand.querySelectorAll(".skeleton-stand-star").length, [...stand.querySelectorAll(".level-badge")].map((badge) => badge.getAttribute("data-badge")), within(stand).getByRole("button").textContent]),
    score: part(".skeleton-stars").textContent,
    best: screen.getByLabelText(TEXTS.en.bestScore).textContent
  };
}

async function turningMuseum(reduced = false, initialSize: WindowSize = [1180, 820]) {
  type Animation = TurnAnimation & { element: Element; frames: Keyframe[]; options: KeyframeAnimationOptions; cancelled: boolean };
  const animations: Animation[] = [];
  const fades: Array<{ update(): void; finished(): void }> = [];
  let holdFade = false;
  const layoutMotion: AppProps["layoutMotion"] = {
    parts: document, measure: museumBox, frame: turnFrame, extend: extendPart, opacity: drawnOpacity,
    animations: () => [], nextFrame: () => () => {}, timing: TURN_TIMING,
    animate: (element, frames, options) => {
      const animation: Animation = { element, frames, options, cancelled: false, cancel: () => { animation.cancelled = true; }, effect: { getComputedTiming: () => ({ progress: 0 }) } };
      animations.push(animation);
      return animation;
    },
    startViewTransition: (update, finished) => {
      if (holdFade) fades.push({ update, finished });
      else { update(); finished(); }
    }
  };
  const app = await openMuseum(initialSize, { layoutMotion, reducedMotion: reduced });
  act(() => finishLoading(app.pictures));
  holdFade = true;
  return {
    ...app, animations, fades,
    resize: (size: WindowSize, sizeClass: SizeClass) => {
      openWindow(...size);
      act(() => app.viewport.resize(sizeClass, sizeClass !== "wide"));
    },
    settle: () => act(() => app.pictures.fire(TURN_TIMING.glide)),
    fade: () => act(() => { fades.at(-1)!.update(); fades.at(-1)!.finished(); })
  };
}
const bounds = (box: Box) => ({ left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });

describe("the museum through turns", () => {
  it("lets fitted copies start smaller than the upright minimums", async () => {
    const app = await turningMuseum(false, [800, 600]);
    const oldBoxes = stands().map(museumBox);
    expect(oldBoxes.every((box) => box.width < 262)).toBe(true);
    app.resize([600, 800], "tall");
    const copies = app.animations.filter(({ element, cancelled }) => !cancelled && element.hasAttribute("data-fitted-picture"));
    expect(copies).toHaveLength(5);
    copies.forEach(({ element, frames }, index) => {
      expect(frames[0]).toEqual(bounds(oldBoxes[index]!));
      // Live layout minima must not clamp the fixed copies' animated boxes.
      const copy = styleAt(element, [600, 800]);
      expect([copy.px("min-width"), copy.px("min-height")]).toEqual([0, 0]);
      expect(styleAt(element.querySelector(".skeleton-exhibit")!, [600, 800]).px("min-height")).toBe(0);
    });
    expect(styleAt(stands()[0]!, [600, 800]).value("min-width")).toBe("min(262px, 100%)");
    app.settle();
    expect(document.querySelector("[data-fitted-picture]")).toBeNull();
  });

  it("glides fitted stands there and back, keeping collection, badges, focus and actions", async () => {
    const app = await turningMuseum();
    const before = collection();
    expect(before.shown.slice(0, 2)).toEqual([
      ["TYRANNOSAURUS", "built", 1, ["explorer"], TEXTS.en.rebuild],
      ["TRICERATOPS", "rebuilding", 1, ["paleontologist"], TEXTS.en.keepBuilding]
    ]);
    const focused = within(stands()[1]!).getByRole("button");
    focused.focus();
    for (const [size, sizeClass] of [[[820, 1180], "tall"], [[1180, 820], "wide"]] as const) {
      const boxes = stands().map(museumBox);
      app.animations.length = 0;
      app.resize(size, sizeClass);
      expect([gateShown(), document.documentElement.hasAttribute("data-turning")]).toEqual([false, true]);
      const copies = app.animations.filter((animation) => !animation.cancelled && animation.element.hasAttribute("data-fitted-picture"));
      expect(copies.map(({ frames, options }) => ({ frames, options }))).toEqual(stands().map((stand, index) => ({ frames: [bounds(boxes[index]!), bounds(museumBox(stand))], options: { duration: TURN_TIMING.glide, easing: TURN_TIMING.easing } })));
      expect(copies.every(({ element }) => element.hasAttribute("inert") && element.getAttribute("aria-hidden") === "true" && !element.hasAttribute("data-turn-part"))).toBe(true);
      app.settle();
      expect(collection()).toEqual(before);
      expect([document.activeElement, document.querySelector("[data-fitted-picture]"), document.documentElement.hasAttribute("data-turning")]).toEqual([focused, null, false]);
    }
    expect(savedSkeletons(app.storage)).toEqual(EARNED);
    // Every stand, including empty and rebuilding ones, still chooses its
    // own puzzle after the layouts have changed twice.
    for (const name of before.shown.map((stand) => String(stand[0]))) {
      await app.user.click(within(screen.getByRole("region", { name })).getByRole("button"));
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(name);
      await app.user.click(screen.getByRole("button", { name: TEXTS.en.museum }));
    }
    app.resize([820, 1180], "tall");
    app.settle();
    await app.user.click(screen.getByRole("button", { name: TEXTS.en.buildAnother }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(TEXTS.en.skeletonTitle);
    await app.user.click(screen.getByRole("button", { name: TEXTS.en.museum }));
    await app.user.click(part(".skeleton-bar > .home-button"));
    expect(document.querySelector(".home")).not.toBeNull();
  });

  it("fades only through the existing reduced-motion system", async () => {
    const app = await turningMuseum(true);
    const before = collection();
    for (const [size, sizeClass] of [[[820, 1180], "tall"], [[1180, 820], "wide"]] as const) {
      app.resize(size, sizeClass);
      expect(document.documentElement.hasAttribute("data-turning")).toBe(true);
      expect(app.fades).toHaveLength(sizeClass === "tall" ? 1 : 2);
      app.fade();
      expect([document.documentElement.dataset.size, app.animations.length, document.querySelector("[data-fitted-picture]")]).toEqual([sizeClass, 0, null]);
      expect(collection()).toEqual(before);
    }
  });

  it("fades the narrow gate over the same museum and restores the collection", async () => {
    const app = await turningMuseum();
    app.resize([820, 1180], "tall");
    app.settle();
    const before = collection();
    app.animations.length = 0;
    app.resize([393, 852], "tall-narrow");
    expect([gateShown(), part(".gated-screen").hasAttribute("inert"), app.animations.length]).toEqual([true, true, 0]);
    expect(getComputedStyle(part(".orientation-gate")).transition).toContain("opacity");
    app.resize([820, 1180], "tall");
    expect([gateShown(), part(".gated-screen").hasAttribute("inert"), app.animations.length]).toEqual([false, false, 0]);
    expect(collection()).toEqual(before);
    await app.user.click(within(stands()[1]!).getByRole("button"));
    expect([gateShown(), part(".skeleton-title-words").textContent]).toEqual([true, "TRICERATOPS"]);
  });
});
