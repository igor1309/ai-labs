import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, onTestFinished } from "vitest";
import { App, type SizeClass } from "../src/App.tsx";
import { dinosaurPageGeometry, keptLines } from "../src/dinosaurPageLayout.ts";
import type { Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { drawnOpacity, extendPart, turnFrame } from "../src/root.ts";
import type { Box, TurnAnimation } from "../src/turnMotion.ts";
import { emChipWidths } from "./chipWidths.ts";
import {
  SHIPPED_CATALOGUE, SHIPPED_DINOSAURS, emptyCare, emptyDig, emptyPairs,
  emptyProgress, emptySkeletons, emptySorting, fakeBodyPicture, featuring,
  lightDevice, manualPictures, manualViewport, seededRandom, unreadVersion,
  unsetAgeLevel
} from "./support.ts";
import { openWindow } from "./windowSizes.ts";

const GLIDE = 240;
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
const SHARE = 320;
// At Bezier parameter 0.5 of the ease out, the time gone is 0.3425 of the
// whole and the progress 0.875.
const SHARE_FRACTION = 0.3425;
const SHARE_PROGRESS = 0.875;

type Window = readonly [width: number, height: number, size: SizeClass];
type Recorded = TurnAnimation & { name: string; keyframes: Keyframe[]; options: KeyframeAnimationOptions; cancelled: boolean; progress: number };

const nameOf = (element: Element) => element.getAttribute("data-turn-part") ?? "";
const recordedName = (element: Element) => {
  if (element.hasAttribute("data-fitted-picture")) return "fitted-picture";
  if (element.hasAttribute("data-closing-picture")) return "closing-picture";
  if (element.hasAttribute("data-turn-frame")) return `frame of ${nameOf(element.nextElementSibling!)}`;
  return nameOf(element);
};
const own = ({ name, cancelled }: Recorded) => !cancelled && !name.startsWith("frame of ");
const px = (value: unknown) => Number.parseFloat(String(value));
const part = (name: string) => {
  const found = document.querySelector<HTMLElement>(`[data-turn-part="${name}"]`);
  if (!found) throw new Error(`No part ${name}`);
  return found;
};
const outerOf = (element: Element) => element.parentElement?.closest<HTMLElement>("[data-turn-part]") ?? undefined;
const pageLines = () => {
  const page = document.querySelector<HTMLElement>(".dinosaur-page")!;
  return [page.dataset.descriptionLines, page.dataset.noteLines, document.querySelector<HTMLElement>(".dinosaur-description")!.dataset.lines, part("dinosaur-note").dataset.lines];
};

// Every part of the page, from the bar to the note.
const PAGE_PARTS = [
  "dinosaur-bar", "dinosaur-catalogue", "dinosaur-position", "dinosaur-stage", "dinosaur-glow", "dinosaur-picture",
  "dinosaur-previous", "dinosaur-next", "dinosaur-words", "dinosaur-about", "dinosaur-size", "dinosaur-mass", "dinosaur-note"
];

// The page's parts as a browser would lay them out, landscape or
// upright, from the window, the scrollbar's room and the root's scroll.
// Landscape, the words stand centred beside the stage, so where the about
// stands follows its description's lines; upright, every page's words take
// the same room.
function pageBox(element: Element, scrollbar: number): Box {
  const [width, height] = [window.innerWidth, window.innerHeight];
  const name = element.matches(".dinosaur-stage-picture") ? "dinosaur-picture" : nameOf(element);
  if (document.documentElement.dataset.size === "tall") {
    const geometry = dinosaurPageGeometry(width, height, 0, 0, scrollbar);
    const words = geometry.wordsWidth;
    const top = -document.documentElement.scrollTop;
    const stage = { left: 56, top: top + 124, width: words, height: geometry.stageHeight };
    const note = keptLines(words).note * 16.5;
    const wordsTop = stage.top + stage.height + 32;
    const aboutHeight = geometry.wordsHeight - 24 - note;
    const factTop = wordsTop + aboutHeight - 120;
    const boxes: Record<string, Box> = {
      "dinosaur-bar": { left: 56, top: top + 40, width: words, height: 56 },
      "dinosaur-catalogue": { left: 56, top: top + 40, width: 150, height: 56 },
      "dinosaur-position": { left: 56 + words - 80, top: top + 56, width: 80, height: 25 },
      "dinosaur-stage": stage,
      "dinosaur-glow": { left: 56 + 0.17 * words, top: stage.top + 0.06 * stage.height, width: 0.66 * words, height: 0.66 * words },
      "dinosaur-picture": { left: 172 + (words - 232 - geometry.picture.width) / 2, top: stage.top + (stage.height - geometry.picture.height) / 2, ...geometry.picture },
      "dinosaur-previous": { left: 84, top: stage.top + (stage.height - 72) / 2, width: 72, height: 72 },
      "dinosaur-next": { left: 56 + words - 100, top: stage.top + (stage.height - 72) / 2, width: 72, height: 72 },
      "dinosaur-words": { left: 56, top: wordsTop, width: words, height: geometry.wordsHeight },
      "dinosaur-about": { left: 56, top: wordsTop, width: words, height: aboutHeight },
      "dinosaur-size": { left: 56, top: factTop, width: (words - 16) / 2, height: 120 },
      "dinosaur-mass": { left: 56 + (words + 16) / 2, top: factTop, width: (words - 16) / 2, height: 120 },
      "dinosaur-note": { left: 56, top: wordsTop + geometry.wordsHeight - note, width: words, height: note }
    };
    return boxes[name]!;
  }
  const inner = width - 112;
  const bodyHeight = height - 172;
  const stageWidth = ((inner - 40) * 760) / 1288;
  const wordsWidth = ((inner - 40) * 528) / 1288;
  const wordsLeft = 56 + stageWidth + 40;
  const description = element.closest(".dinosaur-page")?.querySelector(".dinosaur-description")?.textContent ?? "";
  const aboutHeight = 57.5 + 24 + 56 + 24 + Math.ceil((description.length * 15) / wordsWidth) * 41 + 24 + 120;
  const aboutTop = 124 + (bodyHeight - aboutHeight - 24 - 33) / 2;
  const factTop = aboutTop + aboutHeight - 120;
  const boxes: Record<string, Box> = {
    "dinosaur-bar": { left: 56, top: 40, width: inner, height: 56 },
    "dinosaur-catalogue": { left: 56, top: 40, width: 150, height: 56 },
    "dinosaur-position": { left: 56 + inner - 80, top: 56, width: 80, height: 25 },
    "dinosaur-stage": { left: 56, top: 124, width: stageWidth, height: bodyHeight },
    "dinosaur-glow": { left: 56 + 0.17 * stageWidth, top: 124 + 0.06 * bodyHeight, width: 0.66 * stageWidth, height: 0.66 * stageWidth },
    "dinosaur-picture": { left: 84, top: 152, width: stageWidth - 56, height: bodyHeight - 128 },
    "dinosaur-previous": { left: 84, top: 124 + bodyHeight - 100, width: 72, height: 72 },
    "dinosaur-next": { left: 56 + stageWidth - 100, top: 124 + bodyHeight - 100, width: 72, height: 72 },
    "dinosaur-words": { left: wordsLeft, top: 124, width: wordsWidth, height: bodyHeight },
    "dinosaur-about": { left: wordsLeft, top: aboutTop, width: wordsWidth, height: aboutHeight },
    "dinosaur-size": { left: wordsLeft, top: factTop, width: (wordsWidth - 16) / 2, height: 120 },
    "dinosaur-mass": { left: wordsLeft + (wordsWidth + 16) / 2, top: factTop, width: (wordsWidth - 16) / 2, height: 120 },
    "dinosaur-note": { left: wordsLeft, top: aboutTop + aboutHeight + 24, width: wordsWidth, height: 33 }
  };
  return boxes[name]!;
}

// A card's picture in the landscape list of four columns.
function cardPictureBox(id: string): Box {
  const index = SHIPPED_CATALOGUE.findIndex((entry) => entry.id === id);
  return { left: 72 + (index % 4) * 272, top: 140 + Math.floor(index / 4) * 300, width: 220, height: 139 };
}

function measureFor(scrollbar: () => number) {
  return (element: Element): Box => {
    const card = element.closest<HTMLElement>(".catalogue-card");
    if (element.matches(".catalogue-picture") && card) return cardPictureBox(card.dataset.id!);
    if (element.closest(".dinosaur-page")) return pageBox(element, scrollbar());
    return { left: 0, top: 0, width: 1, height: 1 };
  };
}

async function openPage(from: Window, { id = "baryonyx", language = "en", reduced = false, scrollbar = 0, list = false }: { id?: string; language?: Language; reduced?: boolean; scrollbar?: number; list?: boolean } = {}) {
  openWindow(from[0], from[1]);
  const viewport = { ...manualViewport(from[2] === "tall" ? "portrait" : "landscape"), scrollbarWidth: () => scrollbar };
  const pictures = manualPictures();
  const animations: Recorded[] = [];
  const captured = () => ({ size: document.documentElement.dataset.size, lines: pageLines(), scroll: document.documentElement.scrollTop });
  const fades: Array<{ update: () => void; finished: () => void; captured: ReturnType<typeof captured> }> = [];
  const measure = measureFor(() => scrollbar);
  let clock = 0;
  onTestFinished(() => void (document.documentElement.scrollTop = 0));
  render(
    <App
      {...featuring()}
      dinosaurs={SHIPPED_DINOSAURS}
      catalogue={SHIPPED_CATALOGUE}
      bodyPicture={fakeBodyPicture}
      random={seededRandom(11)}
      portraitLayouts={{ home: ["tall"], catalogue: ["tall"], dinosaur: ["tall"] }}
      viewport={viewport}
      progress={emptyProgress()}
      deviceLanguage={language === "ru" ? "ru-RU" : "en-GB"}
      languageStore={{ load: () => undefined, save: () => {} }}
      nameVersion={unreadVersion}
      {...lightDevice()} {...unsetAgeLevel()}
      {...emptyCare()} {...emptySorting()} {...emptyPairs()} {...emptySkeletons()} {...emptyDig()}
      chipWidths={emChipWidths()}
      reducedMotion={() => reduced}
      pictureMotion={{ now: () => clock, duration: SHARE, easing: EASE_OUT, slide: { duration: GLIDE, delay: 40, distance: 96 } }}
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
        animations: () => [],
        opacity: drawnOpacity,
        nextFrame: () => () => {},
        startViewTransition: (update, finished) => void fades.push({ update, finished, captured: captured() }),
        timing: { glide: GLIDE, easing: EASE_OUT }
      }}
      {...pictures}
    />
  );
  act(() => pictures.finishAll());
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: TEXTS[language].catalogueTile }));
  act(() => pictures.finishAll());
  const card = document.querySelector<HTMLElement>(`.catalogue-card[data-id="${id}"]`)!;
  if (!list) {
    await user.click(card);
    clock += SHARE;
  }
  const resize = (to: Window, room = scrollbar) => {
    scrollbar = room;
    openWindow(to[0], to[1]);
    act(() => viewport.resize(to[2], to[2] === "tall"));
  };
  // Every part's box as the page now lays it out.
  const boxes = () => new Map([...document.querySelectorAll("[data-turn-part]")].filter((element) => element.closest(".dinosaur-page")).map((element) => [nameOf(element), measure(element)]));
  return {
    user, card, animations, fades, measure, boxes, resize,
    advance: (ms: number) => void (clock += ms),
    settle: () => act(() => pictures.fire(GLIDE)),
    updateFade: () => act(() => fades.at(-1)?.update()),
    endFade: () => act(() => fades.at(-1)?.finished()),
    turning: () => document.documentElement.hasAttribute("data-turning")
  };
}

// Each part glides from where it stood, `before`, to where it now stands,
// relative to the part around it, which carries it; a part that changes
// size has its frame sized from its old box to its new one.
function expectGlides(app: Awaited<ReturnType<typeof openPage>>, before: Map<string, Box>) {
  const after = app.boxes();
  const relative = (boxes: Map<string, Box>, name: string) => {
    const outer = outerOf(part(name));
    const box = boxes.get(name)!;
    const around = outer ? boxes.get(nameOf(outer))! : { left: 0, top: 0 };
    return { x: box.left - around.left, y: box.top - around.top };
  };
  const round = (value: number) => Math.round(value * 100) / 100;
  const glides = app.animations.filter(own).filter(({ name }) => name !== "closing-picture" && name !== "fitted-picture");
  const actual = glides.map(({ name, keyframes, options }) => {
    const frame = app.animations.find((animation) => animation.name === `frame of ${name}` && !animation.cancelled);
    const [x = 0, y = 0] = String(keyframes[0]?.translate).split(" ").map(px);
    return { name, from: [round(x), round(y)], to: keyframes[1]?.translate, frame: frame ? [px(frame.keyframes[0]?.width), px(frame.keyframes[1]?.width)].map(round) : undefined, options };
  });
  const expected = glides.map(({ name }) => {
    const [was, now] = [relative(before, name), relative(after, name)];
    const frame = app.animations.some((animation) => animation.name === `frame of ${name}` && !animation.cancelled);
    return { name, from: [round(was.x - now.x), round(was.y - now.y)], to: "0px 0px", frame: frame ? [before.get(name)!.width, after.get(name)!.width].map(round) : undefined, options: { duration: GLIDE, easing: EASE_OUT } };
  });
  expect(actual).toEqual(expected);
  // Translation and clip only: nothing is scaled, squashed or faded.
  expect(glides.flatMap(({ keyframes }) => keyframes.flatMap(Object.keys)).filter((property) => property !== "translate" && property !== "clipPath")).toEqual([]);
  expect(app.animations.filter(({ name, cancelled }) => name.startsWith("frame of ") && !cancelled).flatMap(({ keyframes }) => keyframes.flatMap(Object.keys)).filter((property) => !["translate", "width", "height"].includes(property))).toEqual([]);
  const names = new Set(glides.map(({ name }) => name));
  if (app.animations.some(({ name, cancelled }) => name === "fitted-picture" && !cancelled)) names.add("dinosaur-picture");
  return names;
}

const mixBox = (from: Box, to: Box, progress: number): Box => ({
  left: from.left + (to.left - from.left) * progress,
  top: from.top + (to.top - from.top) * progress,
  width: from.width + (to.width - from.width) * progress,
  height: from.height + (to.height - from.height) * progress
});

function expectBox(actual: Box, expected: Box) {
  for (const key of ["left", "top", "width", "height"] as const) expect(actual[key], key).toBeCloseTo(expected[key], 6);
}

const keyframeBox = (frame: Keyframe | undefined): Box => ({ left: px(frame?.left), top: px(frame?.top), width: px(frame?.width), height: px(frame?.height) });
const heading = () => screen.getByRole("heading", { level: 1 }).textContent;

const LANDSCAPE: Window = [1180, 820, "wide"];
const UPRIGHT: Window = [820, 1180, "tall"];

describe("a dinosaur's page turning", () => {
  it("glides the bar, the stage with its picture and buttons, and the words to the upright page of Baryonyx and back", async () => {
    const app = await openPage(LANDSCAPE);
    const [next, about] = [screen.getByRole("button", { name: TEXTS.en.nextDinosaur }), part("dinosaur-about")];
    for (const to of [UPRIGHT, LANDSCAPE]) {
      const before = app.boxes();
      app.animations.length = 0;
      app.resize(to);
      expect(document.documentElement.dataset.size).toBe(to[2]);
      // HOME stays where it stood in the bar; every other part moves or
      // changes size.
      expect(expectGlides(app, before)).toEqual(new Set(PAGE_PARTS.filter((name) => name !== "dinosaur-catalogue")));
      expect(app.animations.filter(({ name }) => name.startsWith("frame of ")).map(({ name }) => name)).toEqual(["frame of dinosaur-stage", "frame of dinosaur-glow", "frame of dinosaur-size", "frame of dinosaur-mass"]);
      expect([app.turning(), app.fades]).toEqual([true, []]);
      // The same page of the same creature, nothing mounted again.
      expect([heading(), screen.getByRole("button", { name: TEXTS.en.nextDinosaur }), part("dinosaur-about")]).toEqual(["BARYONYX", next, about]);
      app.settle();
      expect(app.turning()).toBe(false);
      expect(document.querySelectorAll("[data-turn-frame]")).toHaveLength(0);
    }
  });

  it("fits the settled picture from its previous bounds through intermediate turn sizes", async () => {
    const app = await openPage(LANDSCAPE);
    const before = app.boxes().get("dinosaur-picture")!;
    app.resize(UPRIGHT);
    const glide = app.animations.find(({ name }) => name === "fitted-picture")!;
    const after = app.boxes().get("dinosaur-picture")!;
    expectBox(keyframeBox(glide.keyframes[0]), before);
    expectBox(keyframeBox(glide.keyframes[1]), after);
    const copy = document.querySelector<HTMLElement>("[data-fitted-picture]")!;
    expect([copy.style.objectFit, copy.style.position, copy.getAttribute("src"), document.querySelector<HTMLElement>(".dinosaur-stage-picture")!.style.visibility]).toEqual(["contain", "fixed", "/pictures/baryonyx.webp", "hidden"]);
    glide.progress = 0.5;
    const midway = mixBox(before, after, 0.5);
    app.resize([834, 1194, "tall"]);
    const continuation = app.animations.filter(({ name, cancelled }) => name === "fitted-picture" && !cancelled)[0]!;
    expectBox(keyframeBox(continuation.keyframes[0]), midway);
    expectBox(keyframeBox(continuation.keyframes[1]), app.boxes().get("dinosaur-picture")!);
    app.settle();
    expect([document.querySelector("[data-fitted-picture]"), document.querySelector<HTMLElement>(".dinosaur-stage-picture")!.style.visibility]).toEqual([null, ""]);
  });

  it("only fades the landscape page into the upright one under reduced motion, nothing moving", async () => {
    const app = await openPage(LANDSCAPE, { reduced: true });
    app.resize(UPRIGHT);
    expect([app.animations, app.fades.length, app.fades[0]?.captured.size, app.turning()]).toEqual([[], 1, "wide", true]);
    expect(getComputedStyle(document.documentElement).getPropertyValue("--motion-small")).toBe("160ms");
    app.updateFade();
    expect([document.documentElement.dataset.size, app.animations]).toEqual(["tall", []]);
    app.endFade();
    expect(app.turning()).toBe(false);
  });

  it("holds the → button's tap and Enter until the motion ends, still on Baryonyx with the → button focused", async () => {
    const app = await openPage(LANDSCAPE);
    const next = screen.getByRole("button", { name: TEXTS.en.nextDinosaur });
    act(() => next.focus());
    app.resize(UPRIGHT);
    fireEvent.click(next);
    await app.user.keyboard("{Enter}");
    expect([app.turning(), heading(), document.activeElement]).toEqual([true, "BARYONYX", next]);
    app.settle();
    expect([app.turning(), heading(), document.activeElement]).toEqual([false, "BARYONYX", next]);
  });
});

describe("the lines kept as a dinosaur's page turns", () => {
  it.each([
    [[744, 1133, "tall"], [820, 1180, "tall"], ["4", "3", "4", "3"], ["3", "3", "3", "3"]],
    [[600, 800, "tall"], [744, 1133, "tall"], ["5", "4", "5", "4"], ["4", "3", "4", "3"]]
  ] as const)("captures the Russian page from %j with its old lines, and fades to the new lines at %j", async (from, to, old, now) => {
    const app = await openPage(from, { language: "ru", reduced: true });
    expect(pageLines()).toEqual(old);
    app.resize(to);
    expect(app.fades.map(({ captured }) => captured.lines)).toEqual([old]);
    expect(pageLines()).toEqual(old);
    app.updateFade();
    expect([pageLines(), app.animations]).toEqual([now, []]);
    app.endFade();
  });

  it.each([
    [[744, 1133, "tall"], [820, 1180, "tall"], ["4", "3"], ["3", "3"], true],
    [[820, 1180, "tall"], [834, 1194, "tall"], ["3", "3"], ["3", "3"], false]
  ] as const)("resizes the Russian page of Baryonyx from %j to %j, gliding only where the kept lines change", async (from, to, old, now, glides) => {
    const app = await openPage(from, { language: "ru" });
    expect(pageLines().slice(0, 2)).toEqual(old);
    const before = app.boxes();
    app.resize(to);
    expect(pageLines().slice(0, 2)).toEqual(now);
    const moving = expectGlides(app, before);
    expect(app.fades).toEqual([]);
    if (glides) {
      expect([...moving].filter((name) => name === "dinosaur-stage" || name === "dinosaur-words")).toEqual(["dinosaur-stage", "dinosaur-words"]);
      expect(app.turning()).toBe(true);
      app.settle();
    } else {
      expect([moving, app.animations, app.turning()]).toEqual([new Set(), [], false]);
    }
  });
});

describe("independent upright line-band changes", () => {
  it.each([631, 711, 767].flatMap((width) => [false, true].flatMap((reduced) => [false, true].map((back) => ({
    from: back ? width + 1 : width, to: back ? width : width + 1, reduced
  })))))("turns from $from to $to with reduced motion $reduced", async ({ from, to, reduced }) => {
    const app = await openPage([from, 1366, "tall"], { language: "ru", reduced });
    const old = keptLines(from - 112);
    const next = keptLines(to - 112);
    expect(Number(old.description !== next.description) + Number(old.note !== next.note)).toBe(1);
    app.resize([to, 1366, "tall"]);
    expect(app.turning()).toBe(true);
    if (reduced) {
      expect(pageLines().slice(0, 2)).toEqual([String(old.description), String(old.note)]);
      expect(app.animations).toEqual([]);
      expect(app.fades).toHaveLength(1);
      app.updateFade();
    } else {
      expect(app.fades).toEqual([]);
      expect(app.animations.some(({ name }) => name === "dinosaur-stage")).toBe(true);
    }
    const page = document.querySelector<HTMLElement>(".dinosaur-page")!;
    expect([page.style.getPropertyValue("--description-lines"), page.style.getPropertyValue("--note-lines")]).toEqual([String(next.description), String(next.note)]);
    expect(pageLines().slice(0, 2)).toEqual([String(next.description), String(next.note)]);
    if (reduced) app.endFade(); else app.settle();
    expect(app.turning()).toBe(false);
  });
});

describe("a scrolled dinosaur's page turning", () => {
  // 600 by 800 and 648 by 800, each with a 16-pixel scrollbar, keep 472 and
  // 520 pixels for the words: both scroll, and the second keeps four lines
  // for the description, not five.
  const SCROLLED: Window = [600, 800, "tall"];
  const WIDER: Window = [648, 800, "tall"];

  const scrollTo = (top: number) => {
    document.documentElement.scrollTop = top;
    fireEvent.scroll(document);
  };

  it("glides from where the page was scrolled to the turned page at its top", async () => {
    const app = await openPage(SCROLLED, { scrollbar: 16 });
    expect([dinosaurPageGeometry(600, 800, 0, 0, 16).scrolls, dinosaurPageGeometry(648, 800, 0, 0, 16).scrolls]).toEqual([true, true]);
    scrollTo(300);
    const before = app.boxes();
    app.resize(WIDER);
    expect([document.documentElement.scrollTop, pageLines().slice(0, 2)]).toEqual([0, ["4", "4"]]);
    expectGlides(app, before);
    expect(app.animations.find(({ name }) => name === "dinosaur-bar")?.keyframes[0]?.translate).toBe("0px -300px");
    app.settle();
    expect(document.documentElement.scrollTop).toBe(0);
  });

  it("captures the scrolled page under reduced motion, and shows the turned one from its top", async () => {
    const app = await openPage(SCROLLED, { scrollbar: 16, reduced: true });
    scrollTo(300);
    app.resize(WIDER);
    expect(app.fades.map(({ captured }) => captured.scroll)).toEqual([300]);
    expect(document.documentElement.scrollTop).toBe(300);
    app.updateFade();
    expect(document.documentElement.scrollTop).toBe(0);
    app.endFade();
  });

  it("keeps where the page was scrolled through a resize it only follows", async () => {
    const app = await openPage(SCROLLED, { scrollbar: 16 });
    scrollTo(300);
    app.resize([600, 820, "tall"]);
    expect([app.animations, app.fades, document.documentElement.scrollTop]).toEqual([[], [], 300]);
  });
});

describe("a dinosaur's page turning while its picture grows from its card", () => {
  it("lands the picture from where it is drawn in the upright stage, 476 by 357", async () => {
    const app = await openPage(LANDSCAPE, { id: "triceratops", list: true });
    const card = cardPictureBox("triceratops");
    await app.user.click(app.card);
    const stage = document.querySelector<HTMLElement>(".dinosaur-stage-picture")!;
    const landscape = app.measure(stage);
    app.advance(SHARE * SHARE_FRACTION);
    app.resize(UPRIGHT);

    const glide = app.animations.filter(({ name }) => name === "closing-picture");
    expect(glide.map(({ options }) => options)).toEqual([{ duration: GLIDE, easing: EASE_OUT }]);
    expectBox(keyframeBox(glide[0]!.keyframes[0]), mixBox(card, landscape, SHARE_PROGRESS));
    const upright = keyframeBox(glide[0]!.keyframes[1]);
    expectBox(upright, app.measure(stage));
    expect([upright.width, upright.height]).toEqual([476, 357]);
    const copy = document.querySelector<HTMLElement>("[data-closing-picture]")!;
    expect([copy.parentElement, copy.style.position, copy.style.objectFit, copy.getAttribute("src"), stage.style.visibility]).toEqual([document.body, "fixed", "contain", "/pictures/triceratops.webp", "hidden"]);
    expect(app.animations.filter(own).some(({ name }) => name === "dinosaur-stage")).toBe(true);
    app.settle();
    expect([document.querySelector("[data-closing-picture]"), stage.style.visibility, heading()]).toEqual([null, "", "TRICERATOPS"]);
  });

  it.each([SHARE, 500])("leaves the picture in its stage once it has grown, at %i ms", async (elapsed) => {
    const app = await openPage(LANDSCAPE, { id: "triceratops", list: true });
    await app.user.click(app.card);
    app.advance(elapsed);
    app.resize(UPRIGHT);
    expect([app.animations.some(({ name }) => name === "closing-picture"), document.querySelector("[data-closing-picture]")]).toEqual([false, null]);
    app.settle();
  });

  it("adds no picture glide under reduced motion", async () => {
    const app = await openPage(LANDSCAPE, { id: "triceratops", list: true, reduced: true });
    await app.user.click(app.card);
    app.advance(SHARE * SHARE_FRACTION);
    app.resize(UPRIGHT);
    app.updateFade();
    expect([app.animations, document.querySelector("[data-closing-picture]")]).toEqual([[], null]);
    app.endFade();
  });
});

describe("a dinosaur's page turning while the next creature slides in", () => {
  it.each([
    ["next", "APATOSAURUS", GLIDE * 0.06418, 0, 0.271],
    ["previous", "KENTROSAURUS", GLIDE * 0.06418, 0, 0.271],
    ["next", "APATOSAURUS", 40 + GLIDE * SHARE_FRACTION, SHARE_PROGRESS, 0.9641388448548567],
    ["previous", "KENTROSAURUS", 40 + GLIDE * SHARE_FRACTION, SHARE_PROGRESS, 0.9641388448548567]
  ] as const)("continues %s at %s after %i ms, including the words' delayed entrance", async (way, name, elapsed, wordsProgress, pictureProgress) => {
    const app = await openPage(LANDSCAPE);
    await app.user.click(screen.getByRole("button", { name: way === "next" ? TEXTS.en.nextDinosaur : TEXTS.en.previousDinosaur }));
    const before = app.boxes();
    const about = part("dinosaur-about");
    app.advance(elapsed);
    app.resize(UPRIGHT);
    const direction = way === "next" ? 1 : -1;
    const words = app.animations.find(({ name }) => name === "dinosaur-about")!;
    const outer = before.get("dinosaur-words")!;
    const old = before.get("dinosaur-about")!;
    const after = app.boxes();
    const now = after.get("dinosaur-about")!;
    const newOuter = after.get("dinosaur-words")!;
    const [x, y] = String(words.keyframes[0]!.translate).split(" ").map(px);
    expect(x).toBeCloseTo(old.left + direction * 96 * (1 - wordsProgress) - outer.left - (now.left - newOuter.left), 6);
    expect(y).toBeCloseTo(old.top - outer.top - (now.top - newOuter.top), 6);
    expect([words.keyframes[0]!.opacity, words.keyframes[1]!.opacity]).toEqual([expect.closeTo(wordsProgress, 6), 1]);
    // The facts share the about's slide and fade, without repeating it.
    for (const fact of ["dinosaur-size", "dinosaur-mass"]) {
      const animation = app.animations.find(({ name }) => name === fact)!;
      const [dx] = String(animation.keyframes[0]!.translate).split(" ").map(px);
      expect(dx).toBeCloseTo(before.get(fact)!.left - old.left - (after.get(fact)!.left - now.left), 6);
      expect(animation.keyframes[0]!.opacity).toBeUndefined();
    }
    const picture = app.animations.find(({ name }) => name === "fitted-picture")!;
    const from = keyframeBox(picture.keyframes[0]);
    const opacity = Number(picture.keyframes[0]!.opacity);
    expect(opacity).toBeCloseTo(pictureProgress, 6);
    expect(from.left).toBeCloseTo(before.get("dinosaur-picture")!.left + direction * 96 * (1 - opacity), 6);
    expectBox({ ...from, left: before.get("dinosaur-picture")!.left }, before.get("dinosaur-picture")!);
    expectBox(keyframeBox(picture.keyframes[1]), after.get("dinosaur-picture")!);
    expect([heading(), part("dinosaur-about"), app.turning()]).toEqual([name, about, true]);
    app.settle();
    expect([heading(), app.turning(), document.querySelector("[data-fitted-picture]")]).toEqual([name, false, null]);
  });
});

describe("the group's line of a dinosaur's page", () => {
  it.each([
    ["baryonyx", LANDSCAPE, "none"],
    ["baryonyx", UPRIGHT, "block"],
    ["quetzalcoatlus", LANDSCAPE, "block"]
  ] as const)("on the page of %s at %j displays %s", async (id, window, display) => {
    await openPage(window, { id });
    const group = document.querySelector<HTMLElement>(".dinosaur-group")!;
    expect(getComputedStyle(group).display).toBe(display);
  });

  it("starts a dinosaur's landscape words at its name, as when it had no group's line", async () => {
    await openPage(LANDSCAPE);
    const about = part("dinosaur-about");
    const shown = [...about.children].filter((child) => getComputedStyle(child).display !== "none");
    expect(shown[0]).toBe(document.querySelector(".dinosaur-page-name"));
  });
});
