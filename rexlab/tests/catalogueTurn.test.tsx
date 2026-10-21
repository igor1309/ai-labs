import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { App, type SizeClass } from "../src/App.tsx";
import { catalogueColumns } from "../src/catalogueColumns.ts";
import { TEXTS } from "../src/language/texts.ts";
import { localLanguage } from "../src/localLanguage.ts";
import { extendPart, pageAnimations, turnFrame } from "../src/root.ts";
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

type Recorded = TurnAnimation & { name: string; keyframes: Keyframe[]; options: KeyframeAnimationOptions; cancelled: boolean };

const nameOf = (element: Element) => element.getAttribute("data-turn-part") ?? "";
const recordedName = (element: Element) => {
  if (element.hasAttribute("data-turn-frame")) return `frame of ${nameOf(element.nextElementSibling!)}`;
  return nameOf(element);
};

function cardHeight(width: number) {
  return (width * 200) / 317 + 14 + 1.25 * Math.min(20, 0.07 * width) + 10 + 32 + 18;
}

function listGeometry(width: number, height: number, size: SizeClass, count = IDS.length) {
  const columns = catalogueColumns(width, size, { left: 0, right: 0 });
  const card = (width - 112 - (columns - 1) * 20) / columns;
  const row = cardHeight(card);
  const listHeight = height - 40 - (size === "tall" ? 56 + 24 + 56 : 56) - 28;
  return { columns, card, row, listHeight, scrollHeight: Math.ceil(count / columns) * row + (Math.ceil(count / columns) - 1) * 20 + 48 };
}

function boxFor(element: Element, width: number, height: number, size: SizeClass): Box {
  const name = nameOf(element);
  const list = listGeometry(width, height, size, document.querySelectorAll(".catalogue-card").length || IDS.length);
  if (name === "catalogue-home") return size === "tall" ? { left: 40, top: 40, width: 130, height: 56 } : { left: 56, top: 40, width: 130, height: 56 };
  if (name === "catalogue-chips") return size === "tall" ? { left: 56, top: 120, width: width - 112, height: 56 } : { left: 200, top: 40, width: width - 256, height: 56 };
  if (name === "catalogue-list") return { left: 0, top: size === "tall" ? 200 : 124, width, height: list.listHeight };
  if (name.startsWith("catalogue-card-")) {
    const index = IDS.indexOf(name.slice("catalogue-card-".length));
    const row = Math.floor(index / list.columns);
    const column = index % list.columns;
    return { left: 56 + column * (list.card + 20), top: (size === "tall" ? 200 : 124) + row * (list.row + 20) - ((element.closest(".catalogue-grid") as HTMLElement | null)?.scrollTop ?? 0), width: list.card, height: list.row };
  }
  return { left: 0, top: 0, width: 1, height: 1 };
}

function openCatalogue(width = 1180, height = 820, { reduced = false, language = "en", pictures = manualPictures(), initial = "landscape" as "landscape" | "portrait" }: { reduced?: boolean; language?: "en" | "ru"; pictures?: ManualPictures; initial?: "landscape" | "portrait" } = {}) {
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
  const measure = (element: Element) => boxFor(element, window.innerWidth, window.innerHeight, document.documentElement.dataset.size as SizeClass);
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
          const animation: Recorded = { name: recordedName(element), keyframes, options, cancelled: false, cancel: () => void (animation.cancelled = true), effect: { getComputedTiming: () => ({ progress: 0 }) } };
          animations.push(animation);
          return animation;
        },
        animations: (element) => "getAnimations" in element && typeof element.getAnimations === "function" ? pageAnimations(element as Element & { getAnimations: Element["getAnimations"] }) : [],
        opacity: drawnOpacity,
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
  const updateFade = () => act(() => fades.at(-1)?.update());
  const endFade = () => act(() => fades.at(-1)?.finished());
  const parts = () => [...document.querySelectorAll<HTMLElement>("[data-turn-part]")];
  return { user, pictures, animations, fades, paints, resize, settle, updateFade, endFade, parts, viewport, grid: () => screen.getByRole("group", { name: TEXTS[language].catalogue }) };
}

const own = ({ name }: Recorded) => !name.startsWith("frame of ");
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
    app.resize([820, 1180, "tall"]);

    expect(document.documentElement.dataset.size).toBe("tall");
    expect([...new Set(app.animations.filter(own).map(({ name }) => name))]).toEqual([
      "catalogue-home",
      "catalogue-chips",
      "catalogue-list",
      ...SHIPPED_CATALOGUE.filter(({ diet }) => diet === "meat").map(({ id }) => `catalogue-card-${id}`)
    ]);
    expect(app.animations.filter(own).every(({ options }) => options.duration === GLIDE && options.easing === EASE_OUT)).toBe(true);
    expect(app.animations.filter(own).flatMap(({ keyframes }) => keyframes.flatMap((frame) => Object.keys(frame))).filter((property) => property !== "translate" && property !== "clipPath")).toEqual([]);
    expect(app.animations.filter(({ name }) => name.startsWith("frame of ")).length).toBeGreaterThan(0);
    expect(within(app.grid()).getAllByRole("button")).toHaveLength(26);
    expect(screen.getByRole("button", { name: "MEAT" }).getAttribute("aria-pressed")).toBe("true");
    app.settle();
    expect(document.documentElement.hasAttribute("data-turning")).toBe(false);
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
    ["row of Gallimimus at its top", 3, 0, "gallimimus", 0, "gallimimus", 0],
    ["60 pixels of Gallimimus hidden", 3, 60, "gallimimus", 0, "gallimimus", 0],
    ["200 pixels of row before Gallimimus hidden", 2, 200, "gallimimus", 0, "gallimimus", 0],
    ["row of Parasaurolophus at its top", 2, 0, "parasaurolophus", 2, "spinosaurus", 2],
    ["end", 99999, 0, "ophthalmosaurus", 0, "ophthalmosaurus", 3]
  ] as const)("keeps the %s row there and back", async (_, scroll, hidden, uprightId, uprightPlace, backId, backPlace) => {
    const app = openCatalogue();
    await app.user.click(screen.getByRole("button", { name: "ANCIENT REPTILES" }));
    const list = app.grid();
    Object.defineProperties(list, {
      clientHeight: { configurable: true, get: () => listGeometry(window.innerWidth, window.innerHeight, document.documentElement.dataset.size as SizeClass).listHeight },
      scrollHeight: { configurable: true, get: () => listGeometry(window.innerWidth, window.innerHeight, document.documentElement.dataset.size as SizeClass).scrollHeight }
    });
    const landscape = listGeometry(1180, 820, "wide");
    list.scrollTop = scroll === 99999 ? landscape.scrollHeight - landscape.listHeight : scroll * (landscape.row + 20) + hidden;
    fireEvent.scroll(list);
    const oldScroll = list.scrollTop;
    app.resize([820, 1180, "tall"]);
    const upright = app.grid();
    expect(upright.scrollTop).not.toBe(oldScroll);
    if (scroll === 99999) expect(upright.scrollTop).toBeGreaterThan(oldScroll);
    const uprightCards = [...upright.querySelectorAll<HTMLElement>(".catalogue-card:not([data-turn-frame])")];
    const position = uprightCards.findIndex((each) => each.dataset.id === uprightId);
    expect(position % 3).toBe(uprightPlace);
    app.settle();
    app.resize([1180, 820, "wide"]);
    const back = app.grid();
    const backCards = [...back.querySelectorAll<HTMLElement>(".catalogue-card:not([data-turn-frame])")];
    expect(backCards.findIndex((each) => each.dataset.id === backId) % 4).toBe(backPlace);
    app.settle();
  });

  it("keeps Baryonyx whole when returning from its page, then turning", async () => {
    const app = openCatalogue();
    await app.user.click(screen.getByRole("button", { name: "ANCIENT REPTILES" }));
    await app.user.click(card("baryonyx"));
    expect([screen.getByRole("heading", { level: 1 }).textContent, screen.getByLabelText("NUMBER").textContent]).toEqual(["BARYONYX", "29 / 52"]);
    await app.user.click(screen.getByRole("button", { name: "ANCIENT REPTILES" }));
    expect(screen.getByRole("button", { name: "Baryonyx" })).toBeDefined();
    app.resize([820, 1180, "tall"]);
    expect(screen.getByRole("button", { name: "Baryonyx" }).getAttribute("data-turn-part")).toBe("catalogue-card-baryonyx");
    app.settle();
  });

  it("lands the shared picture in Baryonyx's upright card when the turn starts during its shrink", async () => {
    const app = openCatalogue();
    await app.user.click(screen.getByRole("button", { name: "ANCIENT REPTILES" }));
    await app.user.click(card("baryonyx"));
    await app.user.click(screen.getByRole("button", { name: "ANCIENT REPTILES" }));
    app.resize([820, 1180, "tall"]);
    expect(screen.getByRole("button", { name: "Baryonyx" }).querySelector("img")).toBeTruthy();
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
    const list = app.grid();
    Object.defineProperties(list, { clientHeight: { configurable: true, value: 500 }, scrollHeight: { configurable: true, value: 4000 } });
    list.scrollTop = 3 * (listGeometry(from[0], from[1], "tall").row + 20);
    fireEvent.scroll(list);
    app.resize(to);
    expect(app.animations.filter(({ cancelled }) => !cancelled).filter(own).length > 0).toBe(glides);
    expect(app.fades).toHaveLength(0);
    expect(within(app.grid()).getAllByRole("button").find((each) => each.getAttribute("aria-label") === "Галлимим")).toBeDefined();
    if (glides) app.settle();
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
