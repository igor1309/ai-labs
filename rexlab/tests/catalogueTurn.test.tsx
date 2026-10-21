import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { App, type SizeClass } from "../src/App.tsx";
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

const GLIDE = 240;
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
const IDS = SHIPPED_CATALOGUE.map(({ id }) => id);

type Recorded = TurnAnimation & { name: string; keyframes: Keyframe[]; options: KeyframeAnimationOptions; cancelled: boolean; progress: number };

const nameOf = (element: Element) => element.getAttribute("data-turn-part") ?? "";
const recordedName = (element: Element) => {
  if (element.hasAttribute("data-turn-frame")) return `frame of ${nameOf(element.nextElementSibling!)}`;
  return nameOf(element);
};

function cardHeight(width: number) {
  return (width * 200) / 317 + 14 + 1.25 * Math.min(20, 0.07 * width) + 10 + 32 + 18;
}

function listGeometry(width: number, height: number, size: SizeClass, count = IDS.length) {
  const columns = catalogueColumns(width, size, 0, 0);
  const card = (width - 112 - (columns - 1) * 20) / columns;
  const row = cardHeight(card);
  const listHeight = height - 40 - (size === "tall" ? 56 + 24 + 56 : 56) - 28;
  return { columns, card, row, listHeight, scrollHeight: Math.ceil(count / columns) * row + (Math.ceil(count / columns) - 1) * 20 + 48 };
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
    left: 56 + column * (layout.card + 20),
    top: (size === "tall" ? 200 : 124) + row * (layout.row + 20) - list.scrollTop,
    width: layout.card,
    height: layout.row
  };
}

function boxFor(element: Element, width: number, height: number, size: SizeClass): Box {
  const name = nameOf(element);
  const list = listGeometry(width, height, size, document.querySelectorAll(".catalogue-card").length || IDS.length);
  if (name === "catalogue-home") return size === "tall" ? { left: 40, top: 40, width: 130, height: 56 } : { left: 56, top: 40, width: 130, height: 56 };
  if (name === "catalogue-chips") {
    if (size !== "tall") return { left: 200, top: 40, width: width - 256, height: 56 };
    const arrangement = (element as HTMLElement).dataset.arrangement;
    return { left: 56, top: 120, width: width - 112, height: arrangement === "stacked" ? 124 : 56 };
  }
  if (name.startsWith("catalogue-chip-")) {
    const chip = element as HTMLElement;
    const food = chip.dataset.food;
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
  if (name === "catalogue-list") return { left: 0, top: size === "tall" ? 200 : 124, width, height: list.listHeight };
  if (name.startsWith("catalogue-card-")) {
    const index = IDS.indexOf(name.slice("catalogue-card-".length));
    const row = Math.floor(index / list.columns);
    const column = index % list.columns;
    return { left: 56 + column * (list.card + 20), top: (size === "tall" ? 200 : 124) + row * (list.row + 20) - ((element.closest(".catalogue-grid") as HTMLElement | null)?.scrollTop ?? 0), width: list.card, height: list.row };
  }
  return { left: 0, top: 0, width: 1, height: 1 };
}

type Rising = { y: number; opacity: number; running: boolean };

function openCatalogue(width = 1180, height = 820, { reduced = false, language = "en", pictures = manualPictures(), initial = "landscape" as "landscape" | "portrait", rising = new Map<string, Rising>() }: { reduced?: boolean; language?: "en" | "ru"; pictures?: ManualPictures; initial?: "landscape" | "portrait"; rising?: Map<string, Rising> } = {}) {
  openWindow(width, height);
  const viewport = manualViewport(initial);
  const animations: Recorded[] = [];
  const fades: Array<{ update: () => void; finished: () => void }> = [];
  const paints: Array<{ fire: () => void; stopped: boolean }> = [];
  const spy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const name = this.getAttribute("data-turn-part");
    if (name) return new DOMRect(...Object.values(boxFor(this, window.innerWidth, window.innerHeight, document.documentElement.dataset.size as SizeClass)) as [number, number, number, number]);
    return new DOMRect();
  });
  onTestFinished(() => spy.mockRestore());
  const measure = (element: Element) => {
    const box = boxFor(element, window.innerWidth, window.innerHeight, document.documentElement.dataset.size as SizeClass);
    const drawing = rising.get(nameOf(element));
    return drawing ? { ...box, top: box.top + drawing.y } : box;
  };
  render(
    <App
      {...featuring()}
      dinosaurs={SHIPPED_DINOSAURS}
      catalogue={SHIPPED_CATALOGUE}
      bodyPicture={fakeBodyPicture}
      random={seededRandom(11)}
      portraitLayouts={{ catalogue: ["tall"] }}
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
        startViewTransition: (update, finished) => void fades.push({ update, finished }),
        timing: { glide: GLIDE, easing: EASE_OUT }
      }}
      {...pictures}
    />
  );
  act(() => pictures.finishAll());
  const user = userEvent.setup();
  const resize = (to: readonly [number, number, SizeClass]) => {
    openWindow(to[0], to[1]);
    act(() => viewport.resize(to[2], to[2] === "tall" || to[2] === "tall-narrow"));
  };
  const settle = () => act(() => pictures.fire(GLIDE));
  const paint = () => act(() => paints.filter(({ stopped }) => !stopped).forEach((frame) => { frame.stopped = true; frame.fire(); }));
  const progress = (at: number) => animations.filter(({ cancelled }) => !cancelled).forEach((animation) => (animation.progress = at));
  const updateFade = () => act(() => fades.at(-1)?.update());
  const endFade = () => act(() => fades.at(-1)?.finished());
  const parts = () => [...document.querySelectorAll<HTMLElement>("[data-turn-part]")];
  return { user, pictures, animations, fades, paints, resize, settle, updateFade, endFade, parts, paint, progress, rising, measure, grid: () => screen.getByRole("group", { name: TEXTS[language].catalogue }) };
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
  it("glides HOME, chips, list and all cards together, with MEAT still chosen and 26 cards", async () => {
    const app = openCatalogue();
    await app.user.click(screen.getByRole("button", { name: "ANCIENT REPTILES" }));
    await app.user.click(screen.getByRole("button", { name: "MEAT" }));
    expect(app.grid().querySelectorAll("[data-turn-part^='catalogue-card-']")).toHaveLength(26);
    const chips = document.querySelector<HTMLElement>(".food-chips");
    expect(chips?.dataset.arrangement).toBeUndefined();
    const meat = SHIPPED_CATALOGUE.filter(({ diet }) => diet === "meat").map(({ id }) => id);
    const before = new Map(meat.map((id) => [id, app.measure(card(id))]));
    const listBefore = app.measure(app.grid());
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
    expect([...new Set(app.animations.filter(own).map(({ name }) => name))]).toEqual([
      "catalogue-home",
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

  it("lands the shared picture in Baryonyx's upright card when the turn starts during its shrink", async () => {
    const app = openCatalogue();
    await app.user.click(screen.getByRole("button", { name: "ANCIENT REPTILES" }));
    await app.user.click(card("baryonyx"));
    await app.user.click(screen.getByRole("button", { name: "ANCIENT REPTILES" }));
    const list = app.grid();
    listMetrics(list);
    app.resize([820, 1180, "tall"]);
    // The browser shrinks the picture by a view transition whose group
    // follows the card's live box every frame, so it lands where the card
    // now stands, as long as the turn starts no view transition of its own,
    // which would skip the shrink.
    expect(app.fades).toHaveLength(0);
    const baryonyx = cardIn(list, "baryonyx");
    expect(baryonyx.querySelector("img")).toBeTruthy();
    expect(baryonyx.getBoundingClientRect()).toEqual(new DOMRect(...Object.values(expectedCardBox("baryonyx", list, 820, 1180, "tall")) as [number, number, number, number]));
    expectWholeInList(list, "baryonyx");
    expect(app.animations.filter(({ name }) => name === "catalogue-card-baryonyx")).toHaveLength(1);
    app.settle();
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
    app.resize(to);
    const expectedArrangement = to[0] === 744 ? "closed" : "spaced";
    expect(beforeArrangement).toBe(from[0] === 700 ? "stacked" : from[0] === 744 ? "closed" : "spaced");
    expect(document.querySelector<HTMLElement>(".food-chips")?.dataset.arrangement).toBe(expectedArrangement);
    const moving = new Set(app.animations.filter(({ cancelled }) => !cancelled).filter(own).map(({ name }) => name));
    expect(moving.size > 0).toBe(glides);
    if (glides) {
      expect(moving).toEqual(new Set(["catalogue-chips", "catalogue-chip-meat", "catalogue-chip-plants", "catalogue-chip-both", "catalogue-list", ...IDS.map((id) => `catalogue-card-${id}`)]));
    } else {
      expect(moving).toEqual(new Set());
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
