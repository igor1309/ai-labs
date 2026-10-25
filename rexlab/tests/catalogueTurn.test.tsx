import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addTransitionType, startTransition, ViewTransition, type ViewTransitionProps } from "react";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { App, type PortraitLayouts, type SizeClass } from "../src/App.tsx";
import { catalogueColumns } from "../src/catalogueColumns.ts";
import { TEXTS } from "../src/language/texts.ts";
import { localLanguage } from "../src/localLanguage.ts";
import { extendPart, turnFrame } from "../src/root.ts";
import { drawnOpacity } from "../src/root.ts";
import type { Box, TurnAnimation } from "../src/turnMotion.ts";
import { turnStyle, type ScreenLayout } from "../src/layoutTurns.ts";
import { emChipWidths } from "./chipWidths.ts";
import {
  SHIPPED_CATALOGUE,
  SHIPPED_DINOSAURS,
  emptyCare,
  emptyDig,
  emptyPairs,
  emptyProgress,
  emptySkeletons,
  emptySorting,
  fakeBodyPicture,
  featuring,
  lightDevice,
  manualPictures,
  manualViewport,
  memoryStorage,
  seededRandom,
  unreadVersion,
  unsetAgeLevel,
  type ManualPictures
} from "./support.ts";
import { openWindow } from "./windowSizes.ts";
import { CLOSE_DINOSAUR, OPEN_DINOSAUR } from "../src/SharedPicture.tsx";
import { chooseFrom } from "./menus.ts";
import { recordedSharedPictures } from "./sharedPictures.tsx";
import { NEXT_DINOSAUR, PREVIOUS_DINOSAUR } from "../src/DinosaurPage.tsx";

vi.mock("react", async (actual) => {
  const react = await actual<typeof import("react")>();
  return { ...react, ViewTransition: vi.fn((props: ViewTransitionProps) => react.createElement(react.ViewTransition, props)), addTransitionType: vi.fn(react.addTransitionType), startTransition: vi.fn(react.startTransition) };
});

const GLIDE = 240;
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
const IDS = SHIPPED_CATALOGUE.map(({ id }) => id);

type Recorded = TurnAnimation & { name: string; keyframes: Keyframe[]; options: KeyframeAnimationOptions; cancelled: boolean; progress: number };

const nameOf = (element: Element) => element.getAttribute("data-turn-part") ?? "";
const recordedName = (element: Element) => {
  if (element.hasAttribute("data-closing-picture")) return "closing-picture";
  if (element.hasAttribute("data-turn-frame")) return `frame of ${nameOf(element.nextElementSibling!)}`;
  return nameOf(element);
};

// A card's height: its picture over its footer, which a wide-short
// window closes up to 10 above and 12 below.
function cardHeight(width: number, size: SizeClass) {
  const [above, below] = size === "wide-short" ? [10, 12] : [14, 18];
  return (width * 200) / 317 + above + 1.25 * Math.min(20, 0.07 * width) + 10 + 32 + below;
}

// The list's padding on each side: 20 in a tall-narrow or wide-short
// window, 56 in any other.
const sideOf = (size: SizeClass) => (size === "tall-narrow" || size === "wide-short" ? 20 : 56);
// The list's padding below its last row: 20 in a wide-short window, 48
// in any other.
const endOf = (size: SizeClass) => (size === "wide-short" ? 20 : 48);

function listGeometry(width: number, height: number, size: SizeClass, count = IDS.length) {
  const columns = catalogueColumns(width, size, 0, 0);
  const card = (width - 2 * sideOf(size) - (columns - 1) * 20) / columns;
  const row = cardHeight(card, size);
  const top = size === "tall" ? 40 + 56 + 28 : size === "tall-narrow" ? 40 + 48 + 20 : size === "wide-short" ? 8 + 48 + 12 : 124;
  const listHeight = height - top;
  return { columns, card, row, top, listHeight, scrollHeight: Math.ceil(count / columns) * row + (Math.ceil(count / columns) - 1) * 20 + endOf(size) };
}

function listMetrics(list: HTMLElement, count = IDS.length) {
  Object.defineProperties(list, {
    clientHeight: { configurable: true, get: () => listGeometry(window.innerWidth, window.innerHeight, document.documentElement.dataset.size as SizeClass, count).listHeight },
    scrollHeight: { configurable: true, get: () => listGeometry(window.innerWidth, window.innerHeight, document.documentElement.dataset.size as SizeClass, count).scrollHeight }
  });
}

function rowScroll(id: string, width: number, height: number, size: SizeClass, count = IDS.length) {
  const layout = listGeometry(width, height, size, count);
  const index = IDS.indexOf(id);
  return Math.min(Math.floor(index / layout.columns) * (layout.row + 20), layout.scrollHeight - layout.listHeight);
}

function cardIn(list: HTMLElement, id: string) {
  const found = list.querySelector<HTMLElement>(`.catalogue-card[data-id="${id}"]:not([data-turn-frame])`);
  if (!found) throw new Error(`No ${id} card in the list`);
  return found;
}

function expectWholeInList(list: HTMLElement, id: string) {
  const listBox = list.getBoundingClientRect();
  const cardBox = cardIn(list, id).getBoundingClientRect();
  expect(cardBox.top).toBeGreaterThanOrEqual(listBox.top);
  expect(cardBox.bottom).toBeLessThanOrEqual(listBox.bottom);
}

function expectedCardBox(id: string, list: HTMLElement, width: number, height: number, size: SizeClass): Box {
  const layout = listGeometry(width, height, size);
  const index = IDS.indexOf(id);
  const row = Math.floor(index / layout.columns);
  const column = index % layout.columns;
  return {
    left: sideOf(size) + column * (layout.card + 20),
    top: layout.top + (row * (layout.row + 20) - list.scrollTop),
    width: layout.card,
    height: layout.row
  };
}

function boxFor(element: Element, width: number, height: number, size: SizeClass): Box {
  const name = nameOf(element);
  if (element.matches(".dinosaur-stage-picture")) return { left: 100, top: 170, width: 680, height: 510 };
  if (element.matches(".catalogue-picture")) {
    const card = element.closest(".catalogue-card")!;
    const box = boxFor(card, width, height, size);
    return { left: box.left + 16, top: box.top + 16, width: box.width - 32, height: box.width * 200 / 317 - 32 };
  }
  const list = listGeometry(width, height, size, document.querySelectorAll(".catalogue-card").length || IDS.length);
  const narrow = size === "tall-narrow";
  const portrait = narrow || size === "tall";
  const target = narrow ? 48 : 56;
  const chipGap = narrow ? 8 : 12;
  const chipsLeft = narrow ? 20 + 48 + 8 : 56 + 130 + 24;
  if (name === "catalogue-home") return { left: sideOf(size), top: 40, width: narrow ? 48 : 130, height: target };
  if (name === "catalogue-chips") return portrait
    ? { left: chipsLeft, top: 40, width: 4 * target + 3 * chipGap, height: target }
    : { left: 200, top: 40, width: width - 256, height: 56 };
  if (name.startsWith("catalogue-chip-")) {
    const chip = element as HTMLElement;
    const food = chip.dataset.food;
    if (portrait) return { left: chipsLeft + ["all", "meat", "plants", "both"].indexOf(food ?? "") * (target + chipGap), top: 40, width: target, height: target };
    const group = chip.closest<HTMLElement>(".food-chips");
    const arrangement = group?.dataset.arrangement;
    const rowWidth = width - 112;
    const gap = arrangement === "closed" ? 8 : 12;
    const row = arrangement === "stacked" ? (food === "all" || food === "meat" ? 0 : 1) : 0;
    const foods = arrangement === "stacked" ? (row === 0 ? ["all", "meat"] : ["plants", "both"]) : ["all", "meat", "plants", "both"];
    const index = foods.indexOf(food ?? "");
    const all = 56;
    const foodWidth = arrangement === "stacked" ? rowWidth - all - gap : (rowWidth - all - gap * 3) / 3;
    const left = 56 + foods.slice(0, index).reduce((sum, value) => sum + (value === "all" ? all : foodWidth) + gap, 0);
    return { left, top: 120 + row * (56 + (arrangement === "stacked" ? 12 : 0)), width: food === "all" ? all : foodWidth, height: 56 };
  }
  if (name === "catalogue-list") return { left: 0, top: list.top, width, height: list.listHeight };
  if (name.startsWith("catalogue-card-")) {
    const index = IDS.indexOf(name.slice("catalogue-card-".length));
    const row = Math.floor(index / list.columns);
    const column = index % list.columns;
    return { left: sideOf(size) + column * (list.card + 20), top: list.top + (row * (list.row + 20) - ((element.closest(".catalogue-grid") as HTMLElement | null)?.scrollTop ?? 0)), width: list.card, height: list.row };
  }
  return { left: 0, top: 0, width: 1, height: 1 };
}

type Rising = { y: number; opacity: number; running: boolean };

function openCatalogue(width = 1180, height = 820, { reduced = false, language = "en", pictures = manualPictures(), initial = "landscape" as "landscape" | "portrait", rising = new Map<string, Rising>(), productionPictures = false, portraitLayouts = { catalogue: ["tall"] } as PortraitLayouts }: { portraitLayouts?: PortraitLayouts; productionPictures?: boolean; reduced?: boolean; language?: "en" | "ru"; pictures?: ManualPictures; initial?: "landscape" | "portrait"; rising?: Map<string, Rising> } = {}) {
  openWindow(width, height);
  const viewport = manualViewport(initial);
  const animations: Recorded[] = [];
  const arrangement = () => ({
    columns: document.querySelector<HTMLElement>(".catalogue-grid")?.style.getPropertyValue("--columns"),
    chips: document.querySelector<HTMLElement>(".food-chips")?.dataset.arrangement
  });
  const fades: Array<{ update: () => void; finished: () => void; captured: ReturnType<typeof arrangement> }> = [];
  const paints: Array<{ fire: () => void; stopped: boolean }> = [];
  const nearestScrolls: Array<{ id: string; scroll: number; card: DOMRect; list: DOMRect }> = [];
  const spy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const name = this.getAttribute("data-turn-part");
    if (name || this.matches(".dinosaur-stage-picture, .catalogue-picture")) return new DOMRect(...Object.values(boxFor(this, window.innerWidth, window.innerHeight, document.documentElement.dataset.size as SizeClass)) as [number, number, number, number]);
    return new DOMRect();
  });
  onTestFinished(() => spy.mockRestore());
  const scroll = vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(function (this: HTMLElement, options) {
    const list = this.closest<HTMLElement>(".catalogue-grid");
    if (!list) return;
    expect(options).toMatchObject({ block: "nearest" });
    listMetrics(list);
    const card = this.getBoundingClientRect();
    const bounds = list.getBoundingClientRect();
    const delta = card.top < bounds.top ? card.top - bounds.top : card.bottom > bounds.bottom ? card.bottom - bounds.bottom : 0;
    list.scrollTop = Math.max(0, Math.min(list.scrollTop + delta, list.scrollHeight - list.clientHeight));
    nearestScrolls.push({ id: this.dataset.id!, scroll: list.scrollTop, card: this.getBoundingClientRect(), list: bounds });
  });
  onTestFinished(() => scroll.mockRestore());
  const measure = (element: Element) => {
    const box = boxFor(element, window.innerWidth, window.innerHeight, document.documentElement.dataset.size as SizeClass);
    const drawing = rising.get(nameOf(element));
    return drawing ? { ...box, top: box.top + drawing.y } : box;
  };
  const shared = recordedSharedPictures();
  let clock = 0;
  render(
    <App
      {...featuring()}
      dinosaurs={SHIPPED_DINOSAURS}
      catalogue={SHIPPED_CATALOGUE}
      bodyPicture={fakeBodyPicture}
      random={seededRandom(11)}
      portraitLayouts={portraitLayouts}
      viewport={viewport}
      progress={emptyProgress()}
      deviceLanguage={language === "ru" ? "ru-RU" : "en-GB"}
      languageStore={localLanguage(() => memoryStorage())}
      nameVersion={unreadVersion}
      {...lightDevice()}
      {...unsetAgeLevel()}
      {...emptyCare()}
      {...emptySorting()}
      {...emptyPairs()}
      {...emptySkeletons()}
      {...emptyDig()}
      chipWidths={emChipWidths()}
      reducedMotion={() => reduced}
      {...(productionPictures ? {} : { pictureTransition: shared.Transition })}
      pictureMotion={{ now: () => clock, duration: 320, easing: EASE_OUT }}
      layoutMotion={{
        parts: document,
        measure,
        frame: turnFrame,
        extend: extendPart,
        animate: (element, keyframes, options) => {
          const animation: Recorded = { name: recordedName(element), keyframes, options, cancelled: false, progress: 0, cancel: () => void (animation.cancelled = true), effect: { getComputedTiming: () => ({ progress: animation.progress }) } };
          animations.push(animation);
          return animation;
        },
        animations: (element) => {
          const drawing = rising.get(nameOf(element));
          return drawing?.running ? [{ finish: () => Object.assign(drawing, { running: false, y: 0, opacity: 1 }) }] : [];
        },
        opacity: (element) => rising.get(nameOf(element))?.opacity ?? drawnOpacity(element),
        nextFrame: (fire) => {
          const paint = { fire, stopped: false };
          paints.push(paint);
          return () => void (paint.stopped = true);
        },
        startViewTransition: (update, finished) => void fades.push({ update, finished, captured: arrangement() }),
        timing: { glide: GLIDE, easing: EASE_OUT }
      }}
      {...pictures}
    />
  );
  act(() => pictures.finishAll());
  const user = userEvent.setup();
  // The native transition paints above the document until a viewport
  // change cancels it, independently of the app's turn animations.
  let nativeDrawing: HTMLElement | undefined;
  const native = {
    draw: (box: Box) => {
      nativeDrawing = document.createElement("div");
      nativeDrawing.dataset.nativeClose = "";
      Object.assign(nativeDrawing.style, { position: "fixed", left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
      document.body.append(nativeDrawing);
    },
    drawn: (): Box => {
      if (!nativeDrawing) throw new Error("Native picture is not drawn");
      const { style } = nativeDrawing;
      return { left: Number.parseFloat(style.left), top: Number.parseFloat(style.top), width: Number.parseFloat(style.width), height: Number.parseFloat(style.height) };
    },
    skip: () => { nativeDrawing?.remove(); nativeDrawing = undefined; }
  };
  onTestFinished(native.skip);
  const resize = (to: readonly [number, number, SizeClass]) => {
    native.skip();
    openWindow(to[0], to[1]);
    act(() => viewport.resize(to[2], to[2] === "tall" || to[2] === "tall-narrow"));
  };
  const settle = () => act(() => pictures.fire(GLIDE));
  const paint = () => act(() => paints.filter(({ stopped }) => !stopped).forEach((frame) => { frame.stopped = true; frame.fire(); }));
  const progress = (at: number) => animations.filter(({ cancelled }) => !cancelled).forEach((animation) => (animation.progress = at));
  const updateFade = () => act(() => fades.at(-1)?.update());
  const endFade = () => act(() => fades.at(-1)?.finished());
  const parts = () => [...document.querySelectorAll<HTMLElement>("[data-turn-part]")];
  return { native, nearestScrolls, advance: (ms: number) => { clock += ms; }, user, pictures, shared, animations, fades, paints, resize, settle, updateFade, endFade, parts, paint, progress, rising, measure, grid: () => screen.getByRole("group", { name: TEXTS[language].catalogue }) };
}

const own = ({ name }: Recorded) => !name.startsWith("frame of ");

const px = (value: unknown) => Number.parseFloat(String(value));

// The glide still running on part `name`: the offset it starts from, the
// translation it ends at, and its frame's widths, from and to.
function glideOf(animations: readonly Recorded[], name: string) {
  const running = (named: string) => animations.filter((animation) => animation.name === named && !animation.cancelled).at(-1);
  const part = running(name);
  const frame = running(`frame of ${name}`);
  if (!part || !frame) throw new Error(`No glide with a frame on ${name}`);
  const [x = 0, y = 0] = String(part.keyframes[0]?.translate).split(" ").map(px);
  return { offset: { x, y }, end: part.keyframes[1]?.translate, widths: [px(frame.keyframes[0]?.width), px(frame.keyframes[1]?.width)] as const };
}

const card = (id: string) => document.querySelector<HTMLElement>(`[data-turn-part="catalogue-card-${id}"]`)!;

function clearScreenTransitions() {
  vi.mocked(addTransitionType).mockClear();
  vi.mocked(startTransition).mockClear();
}

function screenTransitionTypes(expected: string) {
  const types = vi.mocked(addTransitionType).mock.calls.map(([type]) => type);
  expect(types).toEqual([expected]);
  expect(vi.mocked(startTransition).mock.calls).toHaveLength(1);
  return types;
}

function sharedClass(props: ViewTransitionProps, types: string[]) {
  const { share, default: fallback } = props;
  return typeof share === "object" ? types.map((type) => share[type]).find(Boolean) ?? share.default : share ?? fallback;
}

function expectSharedPair(from: { props: ViewTransitionProps }[], to: { props: ViewTransitionProps }[], types: string[]) {
  const pairs = from.flatMap(({ props: old }) => to.filter(({ props }) => props.name === old.name).map(({ props }) => [old, props]));
  expect(pairs.map((pair) => pair.map(({ name }) => name))).toEqual([["dinosaur-baryonyx", "dinosaur-baryonyx"]]);
  for (const props of pairs.flat()) {
    expect(props.default).toBe("none");
    expect(sharedClass(props, types)).toBe("dinosaur-share");
  }
}

// At Bezier parameter 0.5, elapsed x is 0.3425 and eased y is 0.875.
// This is the native close's drawn box just before a resize skips it.
const closeFraction = 0.3425;
const mixBox = (from: Box, to: Box, progress: number): Box => ({
  left: from.left + (to.left - from.left) * progress,
  top: from.top + (to.top - from.top) * progress,
  width: from.width + (to.width - from.width) * progress,
  height: from.height + (to.height - from.height) * progress
});

function pictureGlide(app: ReturnType<typeof openCatalogue>) {
  const animation = app.animations.filter(({ name, cancelled }) => name === "closing-picture" && !cancelled).at(-1);
  if (!animation) throw new Error("No closing picture glide");
  const destination = app.measure(card("baryonyx").querySelector(".catalogue-picture")!);
  const start = animation.keyframes[0]!;
  const end = animation.keyframes[1]!;
  expectBox({ left: px(end.left), top: px(end.top), width: px(end.width), height: px(end.height) }, destination);
  return { animation, destination, from: { left: px(start.left), top: px(start.top), width: px(start.width), height: px(start.height) } };
}

function expectPictureFit(copy: HTMLElement, animation: Recorded) {
  const style = getComputedStyle(copy);
  expect(style.objectFit).toBe("contain");
  expect(copy.style.transform).toBe("");
  for (const frame of animation.keyframes) {
    expect(frame.transform).toBeUndefined();
  }
  // jsdom draws no bitmap: fit its 800 by 600 image in the animated
  // bounds, then apply any scale, as the browser does after object-fit.
  const [start, end] = animation.keyframes;
  const scales = animation.keyframes.map((frame) => {
    const value = String(frame.scale ?? (style.scale || "none"));
    const [x = 1, y = x] = value === "none" ? [1, 1] : value.split(" ").map(Number);
    return { x, y };
  });
  for (const progress of [0, 0.4, 0.875, 1]) {
    const width = px(start!.width) + (px(end!.width) - px(start!.width)) * progress;
    const height = px(start!.height) + (px(end!.height) - px(start!.height)) * progress;
    const fit = Math.min(width / 800, height / 600);
    const sx = scales[0]!.x + (scales[1]!.x - scales[0]!.x) * progress;
    const sy = scales[0]!.y + (scales[1]!.y - scales[0]!.y) * progress;
    const image = { width: 800 * fit * sx, height: 600 * fit * sy };
    expect(image.width / image.height).toBeCloseTo(4 / 3, 6);
    expect(image.width).toBeLessThanOrEqual(width + 1e-6);
    expect(image.height).toBeLessThanOrEqual(height + 1e-6);
  }
}

function expectBox(actual: Box, expected: Box) {
  for (const key of ["left", "top", "width", "height"] as const) expect(actual[key]).toBeCloseTo(expected[key], 6);
}

async function closeBaryonyx(app: ReturnType<typeof openCatalogue>, loaded = false) {
  await app.user.click(screen.getByRole("button", { name: TEXTS.en.catalogueTile }));
  expect(app.pictures.loading()).toContain("/pictures/baryonyx.webp");
  if (loaded) act(() => app.pictures.finish("/pictures/baryonyx.webp"));
  await app.user.click(card("baryonyx"));
  const picture = document.querySelector(".dinosaur-stage-picture")!;
  expect(picture.getAttribute("src")).toBe(loaded ? "/pictures/baryonyx.webp" : null);
  expect(picture.getAttribute("data-picture")).toBe(loaded ? "shown" : "loading");
  const page = app.measure(picture);
  await app.user.click(screen.getByRole("button", { name: TEXTS.en.catalogue }));
  listMetrics(app.grid());
  return { page, target: app.measure(card("baryonyx").querySelector(".catalogue-picture")!) };
}

describe("the picture's close interrupted by a turn", () => {
  it.each([true, false])("continues the skipped native close from its drawn box through two turns, loaded: %s", async (loaded) => {
    const app = openCatalogue();
    const { page, target } = await closeBaryonyx(app, loaded);
    const nearest = app.nearestScrolls.find(({ id }) => id === "baryonyx")!;
    expect(nearest.card.bottom).toBeCloseTo(nearest.list.bottom);
    expect(nearest.scroll).toBeLessThan(app.grid().scrollTop);
    expect(app.grid().scrollTop).toBeCloseTo(rowScroll("baryonyx", 1180, 820, "wide"));
    // The native transition owns this drawing until the viewport skips it.
    app.advance(320 * closeFraction);
    app.native.draw(mixBox(page, target, 0.875));
    const nativeBox = app.native.drawn();
    expect(document.querySelector("[data-native-close]")).not.toBeNull();
    app.resize([820, 1180, "tall"]);

    const first = pictureGlide(app);
    expect(document.querySelector("[data-native-close]")).toBeNull();
    expectBox(first.from, nativeBox);
    expect(first.animation.options).toEqual({ duration: 240, easing: EASE_OUT });
    expect(first.from.width / first.from.height).not.toBeCloseTo(first.destination.width / first.destination.height, 2);
    const picture = card("baryonyx").querySelector<HTMLElement>(".catalogue-picture")!;
    const copy = document.querySelector<HTMLElement>("[data-closing-picture]")!;
    expect(copy.parentElement).toBe(document.body);
    expect(copy.style.position).toBe("fixed");
    expect([copy.style.left, copy.style.top, copy.style.width, copy.style.height]).toEqual([`${first.destination.left}px`, `${first.destination.top}px`, `${first.destination.width}px`, `${first.destination.height}px`]);
    expect(copy.getAttribute("src")).toBe(loaded ? "/pictures/baryonyx.webp" : null);
    expect(copy.dataset.picture).toBe(loaded ? "shown" : "loading");
    expectPictureFit(copy, first.animation);
    expect(picture.style.visibility).toBe("hidden");
    expectWholeInList(app.grid(), "baryonyx");

    app.progress(0.4);
    app.advance(320);
    app.resize([1180, 820, "wide"]);
    const second = pictureGlide(app);
    expect(first.animation.cancelled).toBe(true);
    expectBox(second.from, mixBox(first.from, first.destination, 0.4));
    const nextCopy = document.querySelector<HTMLElement>("[data-closing-picture]")!;
    expect(nextCopy.getAttribute("src")).toBe(loaded ? "/pictures/baryonyx.webp" : null);
    expect(nextCopy.dataset.picture).toBe(loaded ? "shown" : "loading");
    expectPictureFit(nextCopy, second.animation);
    expectWholeInList(app.grid(), "baryonyx");
    expect(document.querySelectorAll("[data-closing-picture]")).toHaveLength(1);
    app.settle();
    expect(document.querySelector("[data-closing-picture]")).toBeNull();
    expect(picture.style.visibility).toBe("");
    expect(picture.getAttribute("src")).toBe(loaded ? "/pictures/baryonyx.webp" : null);
    expect(picture.dataset.picture).toBe(loaded ? "shown" : "loading");
    expectBox(app.measure(picture), second.destination);
    expect(app.animations.filter(({ name, cancelled }) => name === "closing-picture" && !cancelled)).toEqual([]);
  });

  it.each([320, 500])("adds no picture glide after the close has ended at %i ms", async (elapsed) => {
    const app = openCatalogue();
    await closeBaryonyx(app);
    app.advance(elapsed);
    app.resize([820, 1180, "tall"]);
    expect(app.animations.some(({ name }) => name === "closing-picture")).toBe(false);
    expect(document.querySelector("[data-closing-picture]")).toBeNull();
    expectWholeInList(app.grid(), "baryonyx");
    app.settle();
  });

  it("adds no picture glide under reduced motion", async () => {
    const app = openCatalogue(1180, 820, { reduced: true });
    await closeBaryonyx(app);
    app.advance(320 * closeFraction);
    app.resize([820, 1180, "tall"]);
    app.updateFade();
    expect(app.animations).toEqual([]);
    expect(document.querySelector("[data-closing-picture]")).toBeNull();
    expectWholeInList(app.grid(), "baryonyx");
    app.endFade();
  });

  it("drops the close on the next screen change", async () => {
    const app = openCatalogue();
    await closeBaryonyx(app);
    await app.user.click(screen.getByRole("button", { name: "HOME" }));
    await app.user.click(screen.getByRole("button", { name: TEXTS.en.catalogueTile }));
    app.resize([820, 1180, "tall"]);
    expect(app.animations.some(({ name }) => name === "closing-picture")).toBe(false);
    app.settle();
  });
});

describe("the production shared picture binding", () => {
  it("gives React the same picture name and sharing props on a real card open and Back", async () => {
    const app = openCatalogue(1180, 820, { productionPictures: true });
    const pictures = () => [...new Map(vi.mocked(ViewTransition).mock.calls.map(([props]) => props).filter(({ name }) => name?.startsWith("dinosaur-")).map((props) => [props.name, props])).values()];
    vi.mocked(ViewTransition).mockClear();
    await app.user.click(screen.getByRole("button", { name: TEXTS.en.catalogueTile }));
    const cards = pictures();
    expect(new Set(cards.map(({ name }) => name))).toEqual(new Set(IDS.map((id) => `dinosaur-${id}`)));
    expect(cards.every(({ children }) => (children as { props: { className: string } }).props.className === "catalogue-picture")).toBe(true);
    vi.mocked(ViewTransition).mockClear();
    clearScreenTransitions();
    await app.user.click(card("baryonyx"));
    const page = pictures();
    expect(page.map(({ name }) => name)).toEqual(["dinosaur-baryonyx"]);
    expect((page[0]!.children as { props: { className: string } }).props.className).toBe("dinosaur-stage-picture");
    expectSharedPair(cards.map((props) => ({ props })), page.map((props) => ({ props })), screenTransitionTypes(OPEN_DINOSAUR));
    vi.mocked(ViewTransition).mockClear();
    clearScreenTransitions();
    await app.user.click(screen.getByRole("button", { name: TEXTS.en.catalogue }));
    const returned = pictures();
    expectSharedPair(page.map((props) => ({ props })), returned.map((props) => ({ props })), screenTransitionTypes(CLOSE_DINOSAUR));
    for (const props of [...cards, ...page, ...returned]) {
      expect(props.default).toBe("none");
      expect(props.share).toEqual({ [OPEN_DINOSAUR]: "dinosaur-share", [CLOSE_DINOSAUR]: "dinosaur-share", default: "none" });
    }
  });
});

describe("catalogue turn styles", () => {
  it.each([
    [undefined, { screen: "catalogue", portrait: false, gated: false }, "still"],
    [{ screen: "home", portrait: false, gated: false }, { screen: "home", portrait: true, gated: false }, "glide"],
    [{ screen: "catalogue", portrait: false, gated: false, arrangement: "4:landscape" }, { screen: "catalogue", portrait: true, gated: false, arrangement: "3:spaced" }, "glide"],
    [{ screen: "catalogue", portrait: true, gated: false, arrangement: "2:stacked" }, { screen: "catalogue", portrait: true, gated: false, arrangement: "2:closed" }, "glide"],
    [{ screen: "catalogue", portrait: true, gated: false, arrangement: "3:spaced" }, { screen: "catalogue", portrait: true, gated: false, arrangement: "3:spaced" }, "follow"],
    [{ screen: "catalogue", portrait: false, gated: false, arrangement: "4:landscape" }, { screen: "catalogue", portrait: false, gated: false, arrangement: "4:landscape" }, "follow"],
    [{ screen: "home", portrait: false, gated: false }, { screen: "home", portrait: false, gated: false }, "follow"]
  ] as const)("moves %j to %j by %s", (from, to, expected) => expect(turnStyle(from as ScreenLayout | undefined, to)).toBe(expected));
});

describe("catalogue's shared turn", () => {
  it("keeps HOME still while chips, list and all 26 MEAT cards glide", async () => {
    const app = openCatalogue();
    await app.user.click(screen.getByRole("button", { name: "ANCIENT REPTILES" }));
    await app.user.click(screen.getByRole("button", { name: "MEAT" }));
    expect(app.grid().querySelectorAll("[data-turn-part^='catalogue-card-']")).toHaveLength(26);
    const chips = document.querySelector<HTMLElement>(".food-chips");
    expect(chips?.dataset.arrangement).toBeUndefined();
    const meat = SHIPPED_CATALOGUE.filter(({ diet }) => diet === "meat").map(({ id }) => id);
    const before = new Map(meat.map((id) => [id, app.measure(card(id))]));
    const listBefore = app.measure(app.grid());
    const home = screen.getByRole("button", { name: TEXTS.en.home });
    const homeBefore = app.measure(home);
    app.resize([820, 1180, "tall"]);

    expect(document.documentElement.dataset.size).toBe("tall");
    // Each card starts from its landscape place in the list and its size,
    // and slides to its upright place there, the list gliding them all;
    // its frame's clip goes from the one width to the other.
    const listNow = app.measure(app.grid());
    const glides = meat.map((id) => {
      const { offset, end, widths } = glideOf(app.animations, `catalogue-card-${id}`);
      const was = before.get(id)!;
      const now = app.measure(card(id));
      const round = (value: number) => Math.round(value * 100) / 100;
      return {
        id,
        actual: { from: [offset.x, offset.y].map(round), to: end, widths: widths.map(round) },
        expected: {
          from: [was.left - listBefore.left - (now.left - listNow.left), was.top - listBefore.top - (now.top - listNow.top)].map(round),
          to: "0px 0px",
          widths: [was.width, now.width].map(round)
        }
      };
    });
    expect(glides.map(({ id, actual }) => ({ id, ...actual }))).toEqual(glides.map(({ id, expected }) => ({ id, ...expected })));
    // Only a card at the list's top left keeps its place in the list.
    const still = glides.filter(({ expected }) => expected.from.every((value) => value === 0)).map(({ id }) => id);
    expect(still.every((id) => app.measure(card(id)).left === 56 && app.measure(card(id)).top === listNow.top)).toBe(true);
    expect(still.length).toBeLessThanOrEqual(1);
    expect(chips?.dataset.arrangement).toBe("spaced");
    // HOME keeps the same box beside the filters in both layouts.
    expect(app.measure(home)).toEqual(homeBefore);
    expect([...new Set(app.animations.filter(own).map(({ name }) => name))]).toEqual([
      "catalogue-chips",
      "catalogue-chip-all",
      "catalogue-chip-meat",
      "catalogue-chip-plants",
      "catalogue-chip-both",
      "catalogue-list",
      ...SHIPPED_CATALOGUE.filter(({ diet }) => diet === "meat").map(({ id }) => `catalogue-card-${id}`)
    ]);
    expect(app.animations.filter(own).every(({ options }) => options.duration === GLIDE && options.easing === EASE_OUT)).toBe(true);
    expect(app.animations.filter(own).flatMap(({ keyframes }) => keyframes.flatMap((frame) => Object.keys(frame))).filter((property) => property !== "translate" && property !== "clipPath")).toEqual([]);
    expect(app.animations.filter(({ name }) => name.startsWith("frame of ")).length).toBeGreaterThan(0);
    expect(app.animations.filter(({ name }) => name.startsWith("catalogue-card-")).map(({ name }) => name)).toHaveLength(26);
    expect(within(app.grid()).getAllByRole("button")).toHaveLength(26);
    expect(screen.getByRole("button", { name: "MEAT" }).getAttribute("aria-pressed")).toBe("true");
    app.settle();
    expect(document.documentElement.hasAttribute("data-turning")).toBe(false);
  });

  it("opens the catalogue after a language switch with the new language's chips, rising in with no glide", async () => {
    // Home stands upright too, as in the app.
    const app = openCatalogue(1180, 820, { portraitLayouts: { home: ["tall"], catalogue: ["tall"] } });
    app.resize([768, 1024, "tall"]);
    app.settle();
    await app.user.click(screen.getByRole("button", { name: TEXTS.en.catalogueTile }));
    expect(document.querySelector<HTMLElement>(".food-chips")?.dataset.arrangement).toBe("spaced");
    await app.user.click(screen.getByRole("button", { name: TEXTS.en.home }));
    await chooseFrom(app.user, "Language", "Русский");
    app.animations.length = 0;

    await app.user.click(screen.getByRole("button", { name: TEXTS.ru.catalogueTile }));

    expect(document.querySelector<HTMLElement>(".food-chips")?.dataset.arrangement).toBe("closed");
    expect(app.animations.filter(own)).toEqual([]);
    expect(document.documentElement.hasAttribute("data-turning")).toBe(false);
    expect(screen.getByRole("group", { name: TEXTS.ru.catalogue }).dataset.rise).toBe("true");
  });

  it("takes a card's glide from where its entrance is drawn, without restarting the entrance", async () => {
    const entrance: Rising = { y: 0, opacity: 1, running: true };
    const app = openCatalogue(1180, 820, { rising: new Map([["catalogue-card-tyrannosaurus", entrance]]) });
    await app.user.click(screen.getByRole("button", { name: "ANCIENT REPTILES" }));
    const [list, tyrannosaurus] = [app.grid(), card("tyrannosaurus")];
    Object.assign(entrance, { y: 18, opacity: 0.4 });
    app.paint();
    app.animations.length = 0;

    app.resize([820, 1180, "tall"]);

    const glide = app.animations.find(({ name }) => name === "catalogue-card-tyrannosaurus");
    expect(glide?.keyframes[0]).toMatchObject({ translate: "0px 18px", opacity: 0.4 });
    expect(entrance).toEqual({ y: 0, opacity: 1, running: false });
    // The same list and card, the list still marked to rise in: nothing
    // remounts or restarts the entrance.
    expect([app.grid(), card("tyrannosaurus"), app.grid().dataset.rise]).toEqual([list, tyrannosaurus, "true"]);
    app.settle();
  });

  it("under reduced motion only fades the old list into the upright list for 160 ms", async () => {
    const app = openCatalogue(1180, 820, { reduced: true });
    await app.user.click(screen.getByRole("button", { name: "ANCIENT REPTILES" }));
    app.resize([820, 1180, "tall"]);
    expect([app.animations.filter(own), app.fades.length, document.documentElement.dataset.size]).toEqual([[], 1, "wide"]);
    expect(getComputedStyle(document.documentElement).getPropertyValue("--motion-small")).toBe("160ms");
    app.updateFade();
    expect(document.documentElement.dataset.size).toBe("tall");
    app.endFade();
    expect(document.documentElement.hasAttribute("data-turning")).toBe(false);
  });

  it.each([
    [[744, 1133, "tall"], [820, 1180, "tall"], { columns: "2", chips: "closed" }, { columns: "3", chips: "spaced" }],
    [[700, 1000, "tall"], [744, 1000, "tall"], { columns: "2", chips: "stacked" }, { columns: "2", chips: "closed" }]
  ] as const)("captures the old Russian arrangement from %j before fading to %j", async (from, to, before, after) => {
    const app = openCatalogue(from[0], from[1], { reduced: true, language: "ru" });
    await app.user.click(screen.getByRole("button", { name: TEXTS.ru.catalogueTile }));
    app.resize(from);
    app.updateFade();
    app.endFade();
    app.fades.length = 0;
    const arrangement = () => ({ columns: app.grid().style.getPropertyValue("--columns"), chips: document.querySelector<HTMLElement>(".food-chips")?.dataset.arrangement });
    expect(arrangement()).toEqual(before);

    app.resize(to);

    expect(app.fades).toHaveLength(1);
    expect(app.fades[0]?.captured).toEqual(before);
    expect(arrangement()).toEqual(before);
    expect(document.documentElement.dataset.size).toBe("tall");
    app.updateFade();
    expect(arrangement()).toEqual(after);
    expect(app.animations.filter(own)).toEqual([]);
    app.endFade();
    expect(document.documentElement.hasAttribute("data-turning")).toBe(false);
  });

  it.each([
    ["row of Gallimimus at its top", 3, 0, "gallimimus", "gallimimus"],
    ["60 pixels of Gallimimus hidden", 3, 60, "gallimimus", "gallimimus"],
    ["200 pixels of row before Gallimimus hidden", 2, 200, "gallimimus", "gallimimus"],
    ["row of Parasaurolophus at its top", 2, 0, "parasaurolophus", "spinosaurus"],
    ["end", 99999, 0, "ophthalmosaurus", "ophthalmosaurus"]
  ] as const)("keeps the %s row there and back", async (_, scroll, hidden, uprightId, backId) => {
    const app = openCatalogue();
    await app.user.click(screen.getByRole("button", { name: "ANCIENT REPTILES" }));
    const list = app.grid();
    listMetrics(list);
    const landscape = listGeometry(1180, 820, "wide");
    list.scrollTop = scroll === 99999 ? landscape.scrollHeight - landscape.listHeight : scroll * (landscape.row + 20) + hidden;
    fireEvent.scroll(list);
    app.resize([820, 1180, "tall"]);
    const upright = app.grid();
    expect(upright.scrollTop).toBeCloseTo(scroll === 99999 ? upright.scrollHeight - upright.clientHeight : rowScroll(uprightId, 820, 1180, "tall"));
    if (scroll === 99999) expectWholeInList(upright, uprightId);
    else expect(cardIn(upright, uprightId).getBoundingClientRect().top).toBeCloseTo(upright.getBoundingClientRect().top);
    app.settle();
    app.resize([1180, 820, "wide"]);
    const back = app.grid();
    expect(back.scrollTop).toBeCloseTo(scroll === 99999 ? back.scrollHeight - back.clientHeight : rowScroll(backId, 1180, 820, "wide"));
    if (scroll === 99999) expectWholeInList(back, backId);
    app.settle();
  });

  it.each([
    ["Gallimimus", "gallimimus"],
    ["Parasaurolophus", "parasaurolophus"]
  ] as const)("keeps the row of %s at its top turning an iPhone from landscape upright and back, one card to a row upright", async (_, id) => {
    const app = openCatalogue(852, 393, { portraitLayouts: { catalogue: ["tall", "tall-narrow"] } });
    app.resize([852, 393, "wide-short"]);
    app.settle();
    await app.user.click(screen.getByRole("button", { name: "ANCIENT REPTILES" }));
    const list = app.grid();
    listMetrics(list);
    list.scrollTop = rowScroll(id, 852, 393, "wide-short");
    fireEvent.scroll(list);

    // Upright, the first card of that row, three to a row on its side,
    // stands at the top.
    const { columns } = listGeometry(852, 393, "wide-short");
    const first = IDS[Math.floor(IDS.indexOf(id) / columns) * columns]!;
    app.resize([393, 852, "tall-narrow"]);
    const upright = app.grid();
    expect(upright.style.getPropertyValue("--columns")).toBe("1");
    expect(upright.scrollTop).toBeCloseTo(rowScroll(first, 393, 852, "tall-narrow"));
    expect(cardIn(upright, first).getBoundingClientRect().top).toBeCloseTo(upright.getBoundingClientRect().top);
    app.settle();

    app.resize([852, 393, "wide-short"]);
    const back = app.grid();
    expect(back.scrollTop).toBeCloseTo(rowScroll(id, 852, 393, "wide-short"));
    app.settle();
  });

  it("keeps Baryonyx whole when returning from its page, then turning", async () => {
    const app = openCatalogue();
    await app.user.click(screen.getByRole("button", { name: "ANCIENT REPTILES" }));
    await app.user.click(card("baryonyx"));
    expect([screen.getByRole("heading", { level: 1 }).textContent, screen.getByLabelText("NUMBER").textContent]).toEqual(["BARYONYX", "29 / 52"]);
    await app.user.click(screen.getByRole("button", { name: "ANCIENT REPTILES" }));
    const list = app.grid();
    listMetrics(list);
    app.settle();
    app.resize([820, 1180, "tall"]);
    expect(list.scrollTop).toBeCloseTo(rowScroll("baryonyx", 820, 1180, "tall"));
    expectWholeInList(list, "baryonyx");
    expect(app.animations.some(({ name }) => name === "catalogue-card-baryonyx")).toBe(true);
    app.settle();
  });

  it("keeps the row the child scrolled to after coming back from Baryonyx, not Baryonyx", async () => {
    const app = openCatalogue();
    await app.user.click(screen.getByRole("button", { name: "ANCIENT REPTILES" }));
    await app.user.click(card("baryonyx"));
    await app.user.click(screen.getByRole("button", { name: "ANCIENT REPTILES" }));
    const list = app.grid();
    listMetrics(list);
    app.settle();
    list.scrollTop = rowScroll("gallimimus", 1180, 820, "wide");
    fireEvent.scroll(list);
    app.resize([820, 1180, "tall"]);
    expect(list.scrollTop).toBeCloseTo(rowScroll("gallimimus", 820, 1180, "tall"));
    app.settle();
  });

  it.each([
    ["scrolled to its end", "end"],
    ["just back from Baryonyx", "baryonyx"]
  ] as const)("starts a food chosen in a list %s at its own top when the next turn begins", async (_, from) => {
    const app = openCatalogue();
    await app.user.click(screen.getByRole("button", { name: "ANCIENT REPTILES" }));
    if (from === "baryonyx") {
      await app.user.click(card("baryonyx"));
      await app.user.click(screen.getByRole("button", { name: "ANCIENT REPTILES" }));
      listMetrics(app.grid());
      app.settle();
    } else {
      const all = app.grid();
      listMetrics(all);
      all.scrollTop = all.scrollHeight - all.clientHeight;
      fireEvent.scroll(all);
    }

    await app.user.click(screen.getByRole("button", { name: "PLANTS" }));
    const plants = app.grid();
    listMetrics(plants, SHIPPED_CATALOGUE.filter(({ diet }) => diet === "plants").length);
    expect(plants.scrollTop).toBe(0);

    app.resize([820, 1180, "tall"]);
    expect(app.grid().scrollTop).toBe(0);
    app.settle();
  });

  it("pairs Baryonyx's card and page on open and Back, keeping the card whole when a turn starts during close", async () => {
    const app = openCatalogue();
    await app.user.click(screen.getByRole("button", { name: "ANCIENT REPTILES" }));
    const cataloguePictures = app.shared.pictures();
    const openingFrom = app.shared.picture("dinosaur-baryonyx");
    expect(openingFrom.element.closest(".catalogue-card")).toBe(card("baryonyx"));

    clearScreenTransitions();
    await app.user.click(card("baryonyx"));
    const openingTypes = screenTransitionTypes(OPEN_DINOSAUR);
    const pagePictures = app.shared.pictures();
    const page = app.shared.picture("dinosaur-baryonyx");
    expect(page.element.closest(".dinosaur-page")).toBeTruthy();
    expectSharedPair(cataloguePictures, pagePictures, openingTypes);

    clearScreenTransitions();
    await app.user.click(screen.getByRole("button", { name: "ANCIENT REPTILES" }));
    const closingTypes = screenTransitionTypes(CLOSE_DINOSAUR);
    expectSharedPair(pagePictures, app.shared.pictures(), closingTypes);
    const list = app.grid();
    listMetrics(list);

    clearScreenTransitions();
    app.resize([820, 1180, "tall"]);
    expect(app.fades).toHaveLength(0);
    expect(vi.mocked(addTransitionType).mock.calls).toEqual([]);
    expect(vi.mocked(startTransition).mock.calls).toEqual([]);
    expect(app.animations.filter(({ name }) => name === "catalogue-card-baryonyx")).toHaveLength(1);
    app.settle();

    const baryonyx = cardIn(list, "baryonyx");
    expect(app.shared.picture("dinosaur-baryonyx").element.closest(".catalogue-card")).toBe(baryonyx);
    expect(baryonyx.querySelector("img")).toBeTruthy();
    expect(baryonyx.getBoundingClientRect()).toEqual(new DOMRect(...Object.values(expectedCardBox("baryonyx", list, 820, 1180, "tall")) as [number, number, number, number]));
    expectWholeInList(list, "baryonyx");
  });

  it.each([
    ["previous", PREVIOUS_DINOSAUR],
    ["next", NEXT_DINOSAUR]
  ] as const)("does not share pictures when the %s dinosaur takes the page", async (step, type) => {
    const app = openCatalogue();
    await app.user.click(screen.getByRole("button", { name: "ANCIENT REPTILES" }));
    await app.user.click(card("baryonyx"));
    const before = app.shared.pictures();

    clearScreenTransitions();
    await app.user.click(screen.getByRole("button", { name: step === "previous" ? TEXTS.en.previousDinosaur : TEXTS.en.nextDinosaur }));
    const types = screenTransitionTypes(type);
    const after = app.shared.pictures();
    expect(before.map(({ props }) => props.name)).not.toEqual(after.map(({ props }) => props.name));
    expect(before).toHaveLength(1);
    expect(after).toHaveLength(1);
    for (const { props } of [...before, ...after]) {
      expect(props.default).toBe("none");
      expect(sharedClass(props, types)).toBe("none");
    }
  });

  it.each([
    [[744, 1133, "tall"], [820, 1180, "tall"], true],
    [[700, 1000, "tall"], [744, 1000, "tall"], true],
    [[820, 1180, "tall"], [834, 1194, "tall"], false]
  ] as const)("resizing Russian catalogue from %j to %j moves as specified", async (from, to, glides) => {
    const app = openCatalogue(from[0], from[1], { language: "ru" });
    await app.user.click(screen.getByRole("button", { name: TEXTS.ru.catalogueTile }));
    app.resize(from);
    app.settle();
    app.animations.length = 0;
    const list = app.grid();
    listMetrics(list);
    list.scrollTop = rowScroll("gallimimus", from[0], from[1], "tall");
    fireEvent.scroll(list);
    const beforeArrangement = document.querySelector<HTMLElement>(".food-chips")?.dataset.arrangement;
    const beforeTop = app.measure(list).top;
    app.resize(to);
    const expectedArrangement = to[0] === 744 ? "closed" : "spaced";
    expect(beforeArrangement).toBe(from[0] === 700 ? "stacked" : from[0] === 744 ? "closed" : "spaced");
    expect(document.querySelector<HTMLElement>(".food-chips")?.dataset.arrangement).toBe(expectedArrangement);
    const moving = new Set(app.animations.filter(({ cancelled }) => !cancelled).filter(own).map(({ name }) => name));
    expect(moving.size > 0).toBe(glides);
    if (glides) {
      // Fixed portrait symbols stay beside HOME as the card columns resize.
      expect(moving).toEqual(new Set(["catalogue-list", ...IDS.map((id) => `catalogue-card-${id}`)]));
    } else {
      expect(moving).toEqual(new Set());
    }
    expect(app.measure(list).top).toBe(beforeTop);
    if (glides) {
      const glide = app.animations.find(({ name, cancelled }) => name === "catalogue-list" && !cancelled)!;
      expect(glide.keyframes.map(({ translate }) => translate)).toEqual(["0px 0px", "0px 0px"]);
    }
    expect(app.fades).toHaveLength(0);
    expect(app.grid().scrollTop).toBeCloseTo(rowScroll("gallimimus", to[0], to[1], "tall"));
    expect(cardIn(app.grid(), "gallimimus").getBoundingClientRect().top).toBeCloseTo(app.grid().getBoundingClientRect().top);
    if (glides) app.settle();
  });

  it("continues a catalogue turn from its drawn parts through a second resize and keeps the list anchor", async () => {
    const app = openCatalogue(744, 1133, { language: "ru" });
    await app.user.click(screen.getByRole("button", { name: TEXTS.ru.catalogueTile }));
    app.resize([744, 1133, "tall"]);
    app.settle();
    app.animations.length = 0;
    const list = app.grid();
    listMetrics(list);
    list.scrollTop = rowScroll("gallimimus", 744, 1133, "tall");
    fireEvent.scroll(list);

    app.resize([820, 1180, "tall"]);
    const first = new Map(IDS.map((id) => [id, { box: app.measure(card(id)), ...glideOf(app.animations, `catalogue-card-${id}`) }]));
    app.progress(0.5);

    app.resize([834, 1194, "tall"]);
    // Halfway through the first glide, each card is drawn half its offset
    // off its place at 820 and half way between its widths; the second
    // glide goes on from there to its place at 834.
    const drawn = IDS.map((id) => {
      const { box, offset, widths } = first.get(id)!;
      const second = glideOf(app.animations, `catalogue-card-${id}`);
      const now = app.measure(card(id));
      return {
        id,
        from: [second.offset.x, second.offset.y, second.widths[0]].map((value) => Math.round(value * 100) / 100),
        to: [second.end, second.widths[1]],
        expected: {
          from: [box.left + offset.x / 2 - now.left, box.top + offset.y / 2 - now.top, (widths[0] + widths[1]) / 2].map((value) => Math.round(value * 100) / 100),
          to: ["0px 0px", now.width]
        }
      };
    });
    expect(drawn.map(({ id, from, to }) => ({ id, from, to }))).toEqual(drawn.map(({ id, expected }) => ({ id, ...expected })));
    expect(app.grid().scrollTop).toBeCloseTo(rowScroll("gallimimus", 834, 1194, "tall"));
    app.settle();
  });

  it("holds taps and keys during the turn, keeping Triceratops focused", async () => {
    const app = openCatalogue();
    await app.user.click(screen.getByRole("button", { name: "ANCIENT REPTILES" }));
    const triceratops = card("triceratops");
    act(() => triceratops.focus());
    app.resize([820, 1180, "tall"]);
    fireEvent.click(card("tyrannosaurus"));
    await app.user.keyboard("{Enter}");
    expect([document.documentElement.hasAttribute("data-turning"), screen.queryByRole("heading", { level: 1 }), document.activeElement]).toEqual([true, null, triceratops]);
    app.settle();
    expect(document.activeElement).toBe(triceratops);
  });
});
