import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { App, type SizeClass } from "../src/App.tsx";
import { TEXTS } from "../src/language/texts.ts";
import { extendPart, turnFrame } from "../src/root.ts";
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
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";

// The parts of the home page both layouts share, COMPARE featured, in
// the page's order.
const PARTS = ["wordmark", "corner", "greeting", "featured-card", "tiles", "tile-catalogue", "tile-pairs", "tile-skeletons", "tile-dig", "tile-sort", "tile-care", "more-coming"];

// Those that stand on the page itself, not in another part.
const OUTER = ["wordmark", "corner", "greeting", "featured-card", "tiles"];

// Those that paint a frame of their own, by the stylesheet.
const FRAMED = PARTS.filter((name) => name === "featured-card" || name.startsWith("tile-") || name === "more-coming");

type Recorded = TurnAnimation & { name: string; keyframes: Keyframe[]; options: KeyframeAnimationOptions; progress: number; cancelled: boolean };

const nameOf = (element: Element) => element.getAttribute("data-turn-part") ?? "";

// A part's frame is named for the part it is drawn under, which follows it,
// and what the page fades by its id or its classes.
const recordedName = (element: Element) => {
  if (element.hasAttribute("data-turn-frame")) return `frame of ${nameOf(element.nextElementSibling!)}`;
  if (element.hasAttribute("data-turn-fade")) return `faded ${element.id || element.className}`;
  return nameOf(element);
};

// Whether an animation is a part's own glide, not its frame's nor a fade.
const ownGlide = ({ name }: { name: string }) => !name.startsWith("frame of ") && !name.startsWith("faded ");

// index.html's version footer, which stands outside the app.
const VERSION_FOOTER = /<footer id="version"[^>]*>[^<]*<\/footer>/.exec(readFileSync(join(import.meta.dirname, "../index.html"), "utf8"))![0];

// Where the page lays a part out in each layout, in the test's window as
// it is now: every part stands somewhere else, and is larger, upright
// than in landscape, and each stands and is sized by the window's width
// and height too. The tiles stand where the row is scrolled to.
function laidOut(name: string, size: string | undefined): Box {
  const at = PARTS.indexOf(name);
  const [width, height] = [window.innerWidth, window.innerHeight];
  const scrolled = name.startsWith("tile-") || name === "more-coming" ? (document.querySelector(".games-tiles")?.scrollLeft ?? 0) : 0;
  return size === "tall"
    ? { left: 40 + 6 * at + (width - 820) / 4 - scrolled, top: 90 + 30 * at + (height - 1180) / 8, width: 400 + (width - 820) / 2, height: 260 + (height - 1180) / 4 }
    : { left: 100 + 10 * at + (width - 1180) / 4 - scrolled, top: 50 + 20 * at + (height - 820) / 8, width: 300 + (width - 1180) / 2, height: 200 + (height - 820) / 4 };
}

const offsetOf = (keyframe: Keyframe | undefined) => String(keyframe?.translate ?? "0px 0px").split(" ").map(Number.parseFloat);

// The home page in a window `width` by `height` of `size`, under
// index.html's version footer, a screen `upright` or not, its pictures
// loaded, its timers fired by hand, and
// the device asking for reduced motion when `reduced`. A part is
// measured where the test lays it out, its frame drawn and its window
// widened by the browser's own means, and its animations recorded; a
// view transition's update and its end wait for the test.
function openTurning(width: number, height: number, size: SizeClass, { upright = size.startsWith("tall"), reduced = false } = {}) {
  openWindow(width, height);
  const viewport = manualViewport("landscape");
  viewport.resize(size, upright);
  const pictures = manualPictures();
  const animations: Recorded[] = [];
  const frames: Array<{ name: string; box: Box }> = [];
  const extended: Array<{ name: string; right: number; bottom: number }> = [];
  const fades: Array<{ update: () => void; finished: () => void }> = [];
  const running = (name: string) => animations.filter((animation) => animation.name === name && !animation.cancelled).at(-1);
  // Where a part is drawn: where it is laid out, moved by the animation
  // running on it and on the parts around it, as far as each has gone.
  const drawn = (element: Element): Box => {
    const box = { ...laidOut(nameOf(element), document.documentElement.dataset.size) };
    for (let part: Element | null = element; part; part = part.parentElement?.closest("[data-turn-part]") ?? null) {
      const animation = running(nameOf(part));
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
        measure: (element) => laidOut(nameOf(element), document.documentElement.dataset.size),
        frame: (element, box) => {
          const frame = turnFrame(element, box);
          if (frame) frames.push({ name: nameOf(element), box });
          return frame;
        },
        extend: (element, right, bottom) => {
          extended.push({ name: nameOf(element), right, bottom });
          return extendPart(element, right, bottom);
        },
        animate: (element, keyframes, options) => {
          const animation: Recorded = {
            name: recordedName(element),
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
        startViewTransition: (update, finished) => void fades.push({ update, finished }),
        timing: { glide: GLIDE, easing: EASE_OUT }
      }}
      {...pictures}
    />
  );
  act(() => pictures.finishAll());
  document.body.insertAdjacentHTML("beforeend", VERSION_FOOTER);
  onTestFinished(() => document.getElementById("version")?.remove());
  const resize = (to: readonly [number, number, SizeClass], screenUpright = to[2].startsWith("tall")) => {
    openWindow(to[0], to[1]);
    act(() => viewport.resize(to[2], screenUpright));
  };
  // Every motion running has gone `progress` of its way.
  const halfWay = (progress: number) => animations.filter(({ cancelled }) => !cancelled).forEach((animation) => (animation.progress = progress));
  // The browser runs the update of the view transition `at`, then ends it.
  const updateFade = (at: number) => act(() => fades[at]?.update());
  const endFade = (at: number) => act(() => fades[at]?.finished());
  // The animations of the parts themselves, apart from their frames' and
  // the fades.
  const glides = () => animations.filter(ownGlide);
  return { pictures, animations, frames, extended, fades, drawn, resize, halfWay, updateFade, endFade, glides, user: userEvent.setup() };
}

const turning = () => document.documentElement.hasAttribute("data-turning");
const sizeShown = () => document.documentElement.dataset.size;
const partNamed = (name: string) => document.querySelector(`[data-turn-part="${name}"]`)!;
const gate = () => document.querySelector(".orientation-gate")!;
const themeMenuOpen = () => screen.getByRole("button", { name: "Theme" }).getAttribute("aria-expanded") === "true";

describe("the home page glides to its other layout", () => {
  it.each([
    // An iPad turned, both ways, and a Mac window made upright on a
    // screen that stays landscape: its parts grow, shrink, and grow wider
    // as they shrink shorter.
    [[1180, 820, "wide"], [820, 1180, "tall"], true],
    [[820, 1180, "tall"], [1180, 820, "wide"], false],
    [[1440, 900, "wide"], [900, 1000, "tall"], false]
  ] as const)("from %j to %j, the theme menu open, every shared part together over 240 ms easing out from where it was drawn, by translation and clip alone", async (from, to, screenUpright) => {
    const app = openTurning(from[0], from[1], from[2]);
    await openMenu(app.user, "Theme");
    const card = featuredCard();
    const rise = getComputedStyle(card).animationName;
    const pictures = [...document.querySelectorAll("img")];
    const before = Object.fromEntries(PARTS.map((name) => [name, laidOut(name, from[2])]));

    app.resize(to, screenUpright);

    const after = Object.fromEntries(PARTS.map((name) => [name, laidOut(name, to[2])]));
    const glideOf = (name: string) => app.glides().find((animation) => animation.name === name);
    expect(sizeShown()).toBe(to[2]);
    expect(app.glides().map(({ name }) => name)).toEqual(PARTS);
    expect(app.animations.map(({ options }) => options)).toEqual(app.animations.map(() => ({ duration: GLIDE, easing: EASE_OUT })));
    // Each part on the page starts from where it was drawn before the
    // window changed, though the page was laid out for the new one first.
    expect(OUTER.map((name) => glideOf(name)?.keyframes[0]?.translate)).toEqual(OUTER.map((name) => `${before[name]!.left - after[name]!.left}px ${before[name]!.top - after[name]!.top}px`));
    // A part with a frame of its own glides with it drawn under it, sized
    // from its old box to its new one; the part itself is only moved and
    // clipped, never scaled or resized.
    expect(app.glides().flatMap(({ keyframes }) => keyframes.flatMap(Object.keys)).filter((property) => property !== "translate" && property !== "clipPath")).toEqual([]);
    expect(app.frames).toEqual(FRAMED.map((name) => ({ name, box: after[name] })));
    expect(FRAMED.map((name) => app.animations.find((animation) => animation.name === `frame of ${name}`)?.keyframes.map(({ width, height }) => [width, height]))).toEqual(
      FRAMED.map((name) => [
        [`${before[name]!.width}px`, `${before[name]!.height}px`],
        [`${after[name]!.width}px`, `${after[name]!.height}px`]
      ])
    );
    // The row's window goes from its old box to its new one, widened past
    // its new box while it shrinks.
    const right = Math.max(0, before.tiles!.width - after.tiles!.width);
    const bottom = Math.max(0, before.tiles!.height - after.tiles!.height);
    expect([glideOf("tiles")?.keyframes.map(({ clipPath }) => clipPath), app.extended]).toEqual([
      [`inset(0px ${Math.max(0, after.tiles!.width - before.tiles!.width)}px ${Math.max(0, after.tiles!.height - before.tiles!.height)}px 0px)`, `inset(0px ${right}px ${bottom}px 0px)`],
      right > 0 || bottom > 0 ? [{ name: "tiles", right, bottom }] : []
    ]);
    // The open menu hangs below the corner, past its box, and moves with
    // it uncut.
    const menu = screen.getByRole("menu", { name: "Theme" });
    expect([getComputedStyle(menu).position, getComputedStyle(menu).top]).toEqual(["absolute", "calc(100% + 8px)"]);
    expect([glideOf("corner")?.keyframes.some((keyframe) => "clipPath" in keyframe), app.frames.some(({ name }) => name === "corner"), app.extended.some(({ name }) => name === "corner")]).toEqual([false, false, false]);
    expect([menu.hasAttribute("data-leaving"), menu.closest("[data-turn-part]"), app.fades]).toEqual([false, partNamed("corner"), []]);
    expect([featuredCard(), getComputedStyle(card).animationName, [...document.querySelectorAll("img")], app.pictures.loading()]).toEqual([card, rise, pictures, []]);
    expect([turning(), app.pictures.timers()]).toEqual([true, [GLIDE]]);

    act(() => app.pictures.fire(GLIDE));

    expect([turning(), screen.getByRole("menu", { name: "Theme" }).hasAttribute("data-leaving"), document.querySelectorAll("[data-turn-frame]").length, tilesRow().style.paddingRight]).toEqual([false, false, 0, ""]);
  });

  it("draws a part's frame as a copy of the part alone under it, hidden from taps and assistive technology, its own frame taken off, and the row's window widened by padding as it shrinks", () => {
    const app = openTurning(820, 1180, "tall");
    const card = featuredCard();
    const row = tilesRow();

    app.resize([1180, 820, "wide"]);

    const frame = card.previousElementSibling as HTMLElement;
    const { right, bottom } = app.extended[0]!;
    expect([frame.className, frame.hasAttribute("data-turn-frame"), frame.hasAttribute("data-turn-part"), frame.childNodes.length, frame.getAttribute("aria-hidden"), frame.hasAttribute("inert")]).toEqual([card.className, true, false, 0, "true", true]);
    expect([frame.style.position, frame.style.zIndex, frame.style.width, frame.style.height, frame.style.animation, frame.style.pointerEvents]).toEqual(["absolute", "-1", "300px", "200px", "none", "none"]);
    expect([card.hasAttribute("data-turn-framed"), getComputedStyle(card).boxShadow, card.parentElement?.hasAttribute("data-turn-frames")]).toEqual([true, "none", true]);
    expect([row.style.paddingRight, row.style.marginRight, row.style.paddingBottom, row.style.marginBottom]).toEqual([`${right}px`, `${-right}px`, `${bottom}px`, `${-bottom}px`]);

    act(() => app.pictures.fire(GLIDE));

    expect([document.querySelectorAll("[data-turn-frame]").length, card.hasAttribute("data-turn-framed"), card.parentElement?.hasAttribute("data-turn-frames"), row.getAttribute("style")]).toEqual([0, false, false, "--tile-column: 310px;"]);
  });

  it("starts each tile from where the child's swipe left it", () => {
    const app = openTurning(1180, 820, "wide");
    const row = layOutTilesRow();
    swipeTiles(row, 334);
    // Where SKELETONS stands within the row.
    const within = (size: SizeClass) => {
      const [row, tile] = [laidOut("tiles", size), laidOut("tile-skeletons", size)];
      return [tile.left - row.left, tile.top - row.top];
    };
    const [left, top] = within("wide");

    app.resize([820, 1180, "tall"]);

    const [x, y] = within("tall");
    expect(app.glides().find(({ name }) => name === "tile-skeletons")?.keyframes[0]?.translate).toBe(`${left! - x!}px ${top! - y!}px`);
  });

  it("fades in what both layouts do not share, the bands of rock and the version footer, where the new layout puts them, over the same motion", () => {
    const app = openTurning(1180, 820, "wide");

    app.resize([820, 1180, "tall"]);

    const faded = app.animations.filter(({ name }) => name.startsWith("faded "));
    expect(faded.map(({ name, keyframes, options }) => [name, keyframes, options])).toEqual(
      ["stratum stratum-1", "stratum stratum-2", "stratum stratum-3", "version"].map((name) => [`faded ${name}`, [{ opacity: 0 }, { opacity: 1 }], { duration: GLIDE, easing: EASE_OUT }])
    );

    act(() => app.pictures.fire(GLIDE));

    expect(faded.every(({ cancelled }) => cancelled)).toBe(true);
  });
});

describe("a part's frame in a browser", () => {
  // A part 120 by 80 laid out at 934, 116 on the window, in a parent
  // whose box starts at 600, 100 and that is scrolled by `scroll`. The
  // browser draws an element its parent holds at `left` and `top` that
  // far from the parent's box, less its scroll.
  it.each([
    ["stands still", { left: 0, top: 0 }],
    ["is scrolled", { left: 334, top: 20 }]
  ])("is drawn where the part is laid out, inside a parent that %s", (_, scroll) => {
    const parent = document.createElement("div");
    const part = document.createElement("div");
    part.style.backgroundColor = "rgb(246, 241, 230)";
    parent.append(part);
    document.body.append(parent);
    onTestFinished(() => parent.remove());
    Object.assign(parent, { scrollLeft: scroll.left, scrollTop: scroll.top });
    const spy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const at = (offset: string) => Number.parseFloat(offset) || 0;
      if (this.parentElement !== parent) return new DOMRect();
      return new DOMRect(600 - parent.scrollLeft + at(this.style.left), 100 - parent.scrollTop + at(this.style.top), at(this.style.width), at(this.style.height));
    });
    onTestFinished(() => spy.mockRestore());
    const laidOut = { left: 934, top: 116, width: 120, height: 80 };

    const frame = turnFrame(part, laidOut)!.element as HTMLElement;

    expect([frame.style.left, frame.style.top]).toEqual([`${934 - 600 + scroll.left}px`, `${116 - 100 + scroll.top}px`]);
    const { left, top, width, height } = frame.getBoundingClientRect();
    expect({ left, top, width, height }).toEqual(laidOut);
  });
});

describe("under reduced motion", () => {
  it("only fades the landscape layout into the upright one, nothing moving or resizing, and holds keys until the view transition has finished", async () => {
    const app = openTurning(1180, 820, "wide", { reduced: true });
    const card = featuredCard();
    act(() => card.focus());

    app.resize([820, 1180, "tall"]);

    expect([app.fades.length, app.animations, sizeShown(), turning(), app.pictures.timers()]).toEqual([1, [], "wide", true, []]);

    app.updateFade(0);
    await app.user.keyboard("{Enter}");

    expect([sizeShown(), turning(), screen.queryByLabelText("PROGRESS")]).toEqual(["tall", true, null]);

    app.endFade(0);

    expect(turning()).toBe(false);
    await app.user.keyboard("{Enter}");
    expect(screen.getByLabelText("PROGRESS").textContent).toBe("1/10");
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

  it("judges where the row stands from before the motion began, through every change that cuts it short", () => {
    const app = openTurning(1180, 820, "wide");
    const row = layOutTilesRow();
    swipeTiles(row, 334);

    app.resize([820, 1180, "tall"]);
    swipeTiles(row, 0);
    app.halfWay(0.5);
    app.resize([1180, 820, "wide"]);

    expect(row.scrollLeft).toBe(334);
  });

  // Upright in a window 1400 wide, the four columns stand 310 wide and
  // fit, the row not scrolling.
  it.each([
    ['"SKELETONS" at its left edge', 334],
    ["at their end", 718]
  ] as const)("swiped with %s, stands at its start once a window it fits has settled, and there in the next", (_, swiped) => {
    const app = openTurning(1180, 820, "wide");
    const row = layOutTilesRow();
    swipeTiles(row, swiped);

    app.resize([1400, 1500, "tall"]);

    expect([row.scrollLeft, row.scrollWidth - row.clientWidth]).toEqual([0, -32]);
    act(() => app.pictures.fire(GLIDE));
    app.resize([1180, 820, "wide"]);

    expect(row.scrollLeft).toBe(0);
  });
});

describe("a turn through the picture asking to turn keeps the tiles the child was looking at", () => {
  // Upright in a window 1400 wide, the four columns fit, the row not
  // scrolling, so it stands at its start, though the child left it at its
  // end before the picture showed.
  it("stands at its start once a window it fits has settled after the picture, and there in the next", () => {
    const app = openTurning(1180, 820, "wide");
    const row = layOutTilesRow();
    swipeTiles(row, 718);

    app.resize([393, 852, "tall-narrow"]);
    app.resize([1400, 1500, "tall"]);

    expect([gate().hasAttribute("data-shown"), turning(), row.scrollLeft]).toEqual([false, false, 0]);

    app.resize([1180, 820, "wide"]);

    expect(row.scrollLeft).toBe(0);
  });
});

describe("taps and keys during the motion", () => {
  it("do nothing, and once it ends the large card is still focused and Enter opens its game", async () => {
    const app = openTurning(1180, 820, "wide");
    const card = featuredCard();
    act(() => card.focus());

    app.resize([820, 1180, "tall"]);
    await app.user.keyboard("{Enter}");
    // With no tap reaching the page, a press lands on the document.
    await app.user.pointer({ keys: "[MouseLeft]", target: document.documentElement });

    // No tap reaches the page, nor swipe scrolls the row.
    expect([getComputedStyle(document.body).pointerEvents, getComputedStyle(tilesRow()).overflowX]).toEqual(["none", "hidden"]);
    expect([featuredCard(), document.activeElement, screen.queryByLabelText("PROGRESS")]).toEqual([card, card, null]);

    act(() => app.pictures.fire(GLIDE));

    expect([getComputedStyle(document.body).pointerEvents, getComputedStyle(tilesRow()).overflowX, document.activeElement]).toEqual(["auto", "auto", card]);
    await app.user.keyboard("{Enter}");
    expect(screen.getByLabelText("PROGRESS").textContent).toBe("1/10");
  });

  // Escape closes the open menu, and ArrowDown moves its focus to the
  // next choice, once the motion has settled.
  it.each([
    ["{Escape}", "glide", [false, "button"]],
    ["{ArrowDown}", "glide", [true, "next choice"]],
    ["{Escape}", "fade", [false, "button"]],
    ["{ArrowDown}", "fade", [true, "next choice"]]
  ] as const)("%s reaches nothing during a %s, the theme menu open with its ticked choice focused until it settles", async (key, motion, settled) => {
    const app = openTurning(1180, 820, "wide", { reduced: motion === "fade" });
    const menu = await openMenu(app.user, "Theme");
    const ticked = within(menu).getByRole("menuitemradio", { checked: true });
    const focused = () => {
      if (document.activeElement === ticked) return "ticked choice";
      if (document.activeElement === ticked.nextElementSibling) return "next choice";
      return document.activeElement === screen.getByRole("button", { name: "Theme" }) ? "button" : "elsewhere";
    };

    app.resize([820, 1180, "tall"]);
    await app.user.keyboard(key);
    if (motion === "fade") {
      app.updateFade(0);
      await app.user.keyboard(key);
    }

    expect([turning(), themeMenuOpen(), focused()]).toEqual([true, true, "ticked choice"]);

    if (motion === "fade") app.endFade(0);
    else act(() => app.pictures.fire(GLIDE));

    expect([turning(), themeMenuOpen(), focused()]).toEqual([false, true, "ticked choice"]);
    await app.user.keyboard(key);
    expect([themeMenuOpen(), focused()]).toEqual(settled);
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
    [[900, 1180, "tall"], "upright"],
    // A Mac window made shorter alone, its width and size class kept.
    [[820, 1000, "tall"], "upright"]
  ] as const)("to %j glides every part on from where it is to the %s layout, with no jump", (to, _layout) => {
    const app = openTurning(1180, 820, "wide");
    app.resize([820, 1180, "tall"]);
    app.halfWay(0.5);
    const first = [...app.animations];
    const where = Object.fromEntries(OUTER.map((name) => [name, app.drawn(partNamed(name))]));

    app.resize(to);

    const fresh = app.glides().slice(first.filter(ownGlide).length);
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

  it.each([
    [[1180, 820, "wide"], "to the other layout"],
    [[712, 1180, "tall"], "keeping the layout"]
  ] as const)("fades again under reduced motion, %s, holding until the last fade has finished", (to, _change) => {
    const app = openTurning(1180, 820, "wide", { reduced: true });
    app.resize([820, 1180, "tall"]);

    app.resize(to);

    expect([app.fades.length, app.animations]).toEqual([2, []]);

    // The browser runs the first update, outdated, and skips its fade.
    app.updateFade(0);
    app.endFade(0);

    expect([sizeShown(), turning()]).toEqual(["wide", true]);

    app.updateFade(1);
    app.endFade(1);

    expect([sizeShown(), turning(), app.pictures.timers()]).toEqual([to[2], false, []]);
  });

  it("to a size with no layout for the page shows the picture, every part at rest", () => {
    const app = openTurning(1180, 820, "wide");
    app.resize([820, 1180, "tall"]);
    app.halfWay(0.5);
    const glides = app.animations.length;

    app.resize([393, 852, "tall-narrow"]);

    expect([app.animations.every(({ cancelled }) => cancelled), app.animations.length, turning(), app.pictures.timers(), document.querySelectorAll("[data-turn-frame]").length]).toEqual([true, glides, false, [], 0]);
    expect(gate().hasAttribute("data-shown")).toBe(true);
  });

  it("to a size with no layout for the page under reduced motion shows the picture, though the fade's update comes after", () => {
    const app = openTurning(1180, 820, "wide", { reduced: true });
    app.resize([820, 1180, "tall"]);

    app.resize([393, 852, "tall-narrow"]);
    app.updateFade(0);
    app.endFade(0);

    expect([sizeShown(), gate().hasAttribute("data-shown"), turning()]).toEqual(["tall-narrow", true, false]);
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
