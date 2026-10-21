import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App, type SizeClass } from "../src/App.tsx";
import { TEXTS } from "../src/language/texts.ts";
import type { Box, TurnAnimation } from "../src/turnMotion.ts";
import { openMenu } from "./menus.ts";
import {
  SHIPPED_CATALOGUE,
  SHIPPED_DINOSAURS,
  emptyCare,
  emptyDig,
  emptyPairs,
  emptyProgress,
  emptySkeletons,
  emptySorting,
  englishDevice,
  fakeBodyPicture,
  featuredCard,
  featuring,
  gameDoor,
  layOutTilesRow,
  lightDevice,
  manualPictures,
  manualViewport,
  seededRandom,
  swipeTiles,
  tilesRow,
  unsetAgeLevel
} from "./support.ts";
import { clickOf, filterTaps, pressAt, releaseAt, tapAt } from "./taps.ts";
import { openWindow } from "./windowSizes.ts";

// turn-motion.feature, on the home page, and home-portrait.feature's
// "Turning the window keeps the open menu and the large card" beside
// homePortrait.test.tsx. The motion's own rules are proved in
// turnMotion.test.tsx and the row's place in rowAnchor.test.ts; here the
// app is rendered as a browser shows it, the page's parts measured as the
// test lays them out and their animations recorded.

const GLIDE = 240;
const FADE = 160;
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";

// The parts of the home page both layouts share, COMPARE featured, in
// the page's order.
const PARTS = ["wordmark", "corner", "greeting", "featured-card", "tiles", "tile-catalogue", "tile-pairs", "tile-skeletons", "tile-dig", "tile-sort", "tile-care", "more-coming"];

// Those that stand on the page itself, not in another part.
const OUTER = ["wordmark", "corner", "greeting", "featured-card", "tiles"];

type Recorded = TurnAnimation & { name: string; keyframes: Keyframe[]; options: KeyframeAnimationOptions; progress: number; cancelled: boolean };

const nameOf = (element: Element) => element.getAttribute("data-turn-part") ?? "";

// Where the test lays a part out in each layout: every part stands
// somewhere else, and is larger, upright than in landscape.
function laidOut(name: string, size: string | undefined): Box {
  const at = PARTS.indexOf(name);
  return size === "tall" ? { left: 40 + 6 * at, top: 90 + 30 * at, width: 400, height: 260 } : { left: 100 + 10 * at, top: 50 + 20 * at, width: 300, height: 200 };
}

const offsetOf = (keyframe: Keyframe | undefined) => String(keyframe?.translate ?? "0px 0px").split(" ").map(Number.parseFloat);

// The home page in a window `width` by `height` of `size`, a screen
// `upright` or not, its pictures loaded, its timers fired by hand, and
// the device asking for reduced motion when `reduced`. A part is drawn
// where the test lays it out, moved by the animation running on it and
// on the parts around it, as far as each has gone.
function openTurning(width: number, height: number, size: SizeClass, { upright = size.startsWith("tall"), reduced = false } = {}) {
  openWindow(width, height);
  const viewport = manualViewport("landscape");
  viewport.resize(size, upright);
  const pictures = manualPictures();
  const animations: Recorded[] = [];
  const fades: Array<() => void> = [];
  const running = (element: Element) => animations.filter((animation) => animation.name === nameOf(element) && !animation.cancelled).at(-1);
  const drawn = (element: Element): Box => {
    const box = { ...laidOut(nameOf(element), document.documentElement.dataset.size) };
    for (let part: Element | null = element; part; part = part.parentElement?.closest("[data-turn-part]") ?? null) {
      const animation = running(part);
      const [x = 0, y = 0] = offsetOf(animation?.keyframes[0]);
      box.left += x * (1 - (animation?.progress ?? 1));
      box.top += y * (1 - (animation?.progress ?? 1));
    }
    return box;
  };
  render(
    <App
      {...featuring("compare")}
      dinosaurs={SHIPPED_DINOSAURS}
      catalogue={SHIPPED_CATALOGUE}
      bodyPicture={fakeBodyPicture}
      random={seededRandom(7)}
      portraitLayouts={{ home: ["tall"] }}
      viewport={viewport}
      progress={emptyProgress()}
      {...englishDevice()}
      {...lightDevice()}
      {...unsetAgeLevel()}
      {...emptyCare()}
      reducedMotion={() => reduced}
      {...emptySorting()}
      {...emptyPairs()}
      {...emptySkeletons()}
      {...emptyDig()}
      layoutMotion={{
        parts: document,
        measure: drawn,
        animate: (element, keyframes, options) => {
          const animation: Recorded = {
            name: nameOf(element),
            keyframes,
            options,
            progress: 0,
            cancelled: false,
            cancel: () => void (animation.cancelled = true),
            effect: { getComputedTiming: () => ({ progress: animation.progress }) }
          };
          animations.push(animation);
          return animation;
        },
        startViewTransition: (update) => {
          fades.push(update);
          update();
        },
        timing: { glide: GLIDE, easing: EASE_OUT, fade: FADE }
      }}
      {...pictures}
    />
  );
  act(() => pictures.finishAll());
  const resize = (to: readonly [number, number, SizeClass], screenUpright = to[2].startsWith("tall")) => {
    openWindow(to[0], to[1]);
    act(() => viewport.resize(to[2], screenUpright));
  };
  // Every motion running has gone `progress` of its way.
  const halfWay = (progress: number) => animations.filter(({ cancelled }) => !cancelled).forEach((animation) => (animation.progress = progress));
  return { pictures, animations, fades, drawn, resize, halfWay, user: userEvent.setup() };
}

const turning = () => document.documentElement.hasAttribute("data-turning");
const sizeShown = () => document.documentElement.dataset.size;
const partNamed = (name: string) => document.querySelector(`[data-turn-part="${name}"]`)!;
const gate = () => document.querySelector(".orientation-gate")!;

describe("the home page glides to its other layout", () => {
  it.each([
    // An iPad turned, both ways, and a Mac window made upright on a
    // screen that stays landscape.
    [[1180, 820, "wide"], [820, 1180, "tall"], true],
    [[820, 1180, "tall"], [1180, 820, "wide"], false],
    [[1440, 900, "wide"], [900, 1000, "tall"], false]
  ] as const)("from %j to %j, the theme menu open, every shared part together over 240 ms easing out, by translation and clip alone", async (from, to, screenUpright) => {
    const app = openTurning(from[0], from[1], from[2]);
    await openMenu(app.user, "Theme");
    const card = featuredCard();
    const rise = getComputedStyle(card).animationName;
    const pictures = [...document.querySelectorAll("img")];
    const before = Object.fromEntries(OUTER.map((name) => [name, laidOut(name, from[2])]));

    app.resize(to, screenUpright);

    expect(sizeShown()).toBe(to[2]);
    expect(app.animations.map(({ name }) => name)).toEqual(PARTS);
    expect(app.animations.map(({ options }) => options)).toEqual(PARTS.map(() => ({ duration: GLIDE, easing: EASE_OUT })));
    // A part that grows shows it by its clip; none is scaled or resized.
    expect(app.animations.flatMap(({ keyframes }) => keyframes.flatMap(Object.keys)).filter((property) => property !== "translate" && property !== "clipPath")).toEqual([]);
    expect(app.animations.some(({ keyframes }) => "clipPath" in (keyframes[0] ?? {}))).toBe(to[2] === "tall");
    // Each part on the page starts from where it stood before the change.
    expect(OUTER.map((name) => app.animations.find((animation) => animation.name === name)?.keyframes[0]?.translate)).toEqual(
      OUTER.map((name) => {
        const after = laidOut(name, to[2]);
        return `${before[name]!.left - after.left}px ${before[name]!.top - after.top}px`;
      })
    );
    const menu = screen.getByRole("menu", { name: "Theme" });
    expect([menu.hasAttribute("data-leaving"), menu.closest("[data-turn-part]"), app.fades]).toEqual([false, partNamed("corner"), []]);
    expect([featuredCard(), getComputedStyle(card).animationName, [...document.querySelectorAll("img")], app.pictures.loading()]).toEqual([card, rise, pictures, []]);
    expect([turning(), app.pictures.timers()]).toEqual([true, [GLIDE]]);

    act(() => app.pictures.fire(GLIDE));

    expect([turning(), screen.getByRole("menu", { name: "Theme" }).hasAttribute("data-leaving")]).toEqual([false, false]);
  });
});

describe("under reduced motion", () => {
  it("only fades the landscape layout into the upright one, over 160 ms, nothing moving or resizing", () => {
    const app = openTurning(1180, 820, "wide", { reduced: true });

    app.resize([820, 1180, "tall"]);

    expect([app.fades.length, app.animations, sizeShown(), turning(), app.pictures.timers()]).toEqual([1, [], "tall", true, [FADE]]);

    act(() => app.pictures.fire(FADE));

    expect(turning()).toBe(false);
  });
});

describe("a turn keeps the tiles the child was looking at, there and back", () => {
  // The row with COMPARE featured holds four columns 310 wide and 24
  // apart, upright as in landscape at these windows: SKELETONS stands at
  // its left edge at 334, and its end is at 718 in landscape and 548
  // upright.
  it.each([
    ['so "SKELETONS" stands exactly at its left edge', 334, 334, 334],
    ['so 60 pixels of "SKELETONS" are hidden', 334 + 60, 334, 334],
    ['so 200 of "ANCIENT REPTILES" are hidden', 200, 334, 334],
    ["to their end", 718, 548, 718]
  ] as const)("swiped %s", (_, swiped, upright, back) => {
    const app = openTurning(1180, 820, "wide");
    const row = layOutTilesRow();
    swipeTiles(row, swiped);

    app.resize([820, 1180, "tall"]);

    expect([row.scrollLeft, row.scrollWidth - row.clientWidth]).toEqual([upright, 548]);
    act(() => app.pictures.fire(GLIDE));
    app.resize([1180, 820, "wide"]);

    expect([row.scrollLeft, row.scrollWidth - row.clientWidth]).toEqual([back, 718]);
  });

  it("judges where the row stands from before the motion began", () => {
    const app = openTurning(1180, 820, "wide");
    const row = layOutTilesRow();
    swipeTiles(row, 334);

    app.resize([820, 1180, "tall"]);
    swipeTiles(row, 0);
    act(() => app.pictures.fire(GLIDE));
    app.resize([1180, 820, "wide"]);

    expect(row.scrollLeft).toBe(334);
  });
});

describe("taps and keys during the motion", () => {
  it("do nothing, and once it ends the large card is still focused and Enter opens its game", async () => {
    const app = openTurning(1180, 820, "wide");
    const card = featuredCard();
    act(() => card.focus());

    app.resize([820, 1180, "tall"]);
    await app.user.keyboard("{Enter}");

    // No tap reaches the page, nor swipe scrolls the row.
    expect([getComputedStyle(document.body).pointerEvents, getComputedStyle(tilesRow()).overflowX]).toEqual(["none", "hidden"]);
    expect([featuredCard(), document.activeElement, screen.queryByLabelText("PROGRESS")]).toEqual([card, card, null]);

    act(() => app.pictures.fire(GLIDE));

    expect([getComputedStyle(document.body).pointerEvents, getComputedStyle(tilesRow()).overflowX, document.activeElement]).toEqual(["auto", "auto", card]);
    await app.user.keyboard("{Enter}");
    expect(screen.getByLabelText("PROGRESS").textContent).toBe("1/10");
  });

  it("leave the double-tap filter's rule as it was: a tap during it is the first of a double tap", () => {
    const app = openTurning(1180, 820, "wide");
    filterTaps();
    app.resize([820, 1180, "tall"]);
    // With no tap reaching the page, a finger lands on the document.
    pressAt(document.documentElement, 0);
    releaseAt(document.documentElement, 50);
    clickOf(document.documentElement);
    act(() => app.pictures.fire(GLIDE));

    tapAt(featuredCard(), 300);
    expect(screen.queryByLabelText("PROGRESS")).toBeNull();
    tapAt(featuredCard(), 900);
    expect(screen.getByLabelText("PROGRESS").textContent).toBe("1/10");
  });
});

describe("a resize that keeps the layout", () => {
  // SKELETONS's column is the second: it stands at the row's left edge
  // one column and its gap in, upright 310 wide, then 292 at 712.
  it.each([
    [[820, 1180, "tall"], [712, 1180, "tall"], 334, 316],
    [[1440, 900, "wide"], [1440, 560, "wide-short"], 334, 334]
  ] as const)("from %j to %j moves nothing, SKELETONS still at the row's left edge", (from, to, before, after) => {
    const app = openTurning(from[0], from[1], from[2]);
    const row = layOutTilesRow();
    swipeTiles(row, before);

    app.resize(to);

    expect([app.animations, app.fades, turning(), app.pictures.timers(), sizeShown()]).toEqual([[], [], false, [], to[2]]);
    expect(row.scrollLeft).toBe(after);
  });
});

describe("a window that changes again mid-motion", () => {
  it.each([
    [[1180, 820, "wide"], "landscape"],
    [[900, 1180, "tall"], "upright"]
  ] as const)("to %j glides every part on from where it is to the %s layout, with no jump", (to, _layout) => {
    const app = openTurning(1180, 820, "wide");
    app.resize([820, 1180, "tall"]);
    app.halfWay(0.5);
    const first = [...app.animations];
    const where = Object.fromEntries(OUTER.map((name) => [name, app.drawn(partNamed(name))]));

    app.resize(to);

    const fresh = app.animations.slice(first.length);
    expect([first.every(({ cancelled }) => cancelled), fresh.map(({ name }) => name), sizeShown()]).toEqual([true, PARTS, to[2]]);
    expect(OUTER.map((name) => fresh.find((animation) => animation.name === name)?.keyframes[0]?.translate)).toEqual(
      OUTER.map((name) => {
        const after = laidOut(name, to[2]);
        return `${where[name]!.left - after.left}px ${where[name]!.top - after.top}px`;
      })
    );
    expect(fresh.every(({ keyframes }) => keyframes.at(-1)?.translate === "0px 0px")).toBe(true);
    // Input waits for the fresh motion to settle.
    expect([turning(), app.pictures.timers()]).toEqual([true, [GLIDE]]);
    act(() => app.pictures.fire(GLIDE));
    expect(turning()).toBe(false);
  });

  it("fades again under reduced motion", () => {
    const app = openTurning(1180, 820, "wide", { reduced: true });
    app.resize([820, 1180, "tall"]);

    app.resize([1180, 820, "wide"]);

    expect([app.fades.length, app.animations, sizeShown(), app.pictures.timers()]).toEqual([2, [], "wide", [FADE]]);
  });

  it("to a size with no layout for the page shows the picture, every part at rest", () => {
    const app = openTurning(1180, 820, "wide");
    app.resize([820, 1180, "tall"]);
    app.halfWay(0.5);
    const glides = app.animations.length;

    app.resize([393, 852, "tall-narrow"]);

    expect([app.animations.every(({ cancelled }) => cancelled), app.animations.length, turning(), app.pictures.timers()]).toEqual([true, glides, false, []]);
    expect(gate().hasAttribute("data-shown")).toBe(true);
  });
});

describe("a window the screen has no layout for", () => {
  it("fades in the picture over the care welcome screen, nothing gliding", async () => {
    const app = openTurning(1180, 820, "wide", { upright: false });
    await app.user.click(gameDoor(TEXTS.en.care));

    app.resize([820, 1180, "tall"]);

    expect([gate().hasAttribute("data-shown"), app.animations, app.fades, turning(), app.pictures.timers()]).toEqual([true, [], [], false, []]);
  });

  it("fades in the picture over the home page in a narrow window, nothing gliding", () => {
    const app = openTurning(852, 393, "wide-short");

    app.resize([393, 852, "tall-narrow"]);

    expect([gate().hasAttribute("data-shown"), app.animations, app.fades, turning(), app.pictures.timers()]).toEqual([true, [], [], false, []]);
  });
});

describe("the page's marked parts", () => {
  it("are each part of the home page both layouts share, a tile's name holding its game", () => {
    openTurning(1180, 820, "wide");

    expect([...document.querySelectorAll("[data-turn-part]")].map(nameOf)).toEqual(PARTS);
    expect(within(tilesRow()).getAllByRole("button").map((tile) => [tile.getAttribute("aria-label"), nameOf(tile)])).toEqual([
      ["ANCIENT REPTILES", "tile-catalogue"],
      ["FIND THE PAIR", "tile-pairs"],
      ["SKELETONS", "tile-skeletons"],
      ["DIG", "tile-dig"],
      ["SORT", "tile-sort"],
      ["CARE", "tile-care"]
    ]);
  });
});
