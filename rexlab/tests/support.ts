import type { AgeLevel } from "../src/ageLevel.ts";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { existsSync } from "node:fs";
import { join } from "node:path";
import records from "../src/data/dinosaurs.json";
import digFile from "../src/data/dig.json";
import skeletonPlaces from "../src/data/skeletons.json";
import type { AppProps, Appearance, PageVisibility, SizeClass, Viewport, ViewportInsets } from "../src/App.tsx";
import { calendarDay, type FeaturedHistory, type FeaturedStore } from "../src/featured.ts";
import type { HomeGame } from "../src/HomePage.tsx";
import { readDig, type DigFile } from "../src/dig/index.ts";
import { readCatalogue, readDinosaurs, readPals, readSkeletons, readSortables, readVisitors } from "../src/dinosaurs.ts";
import { localAgeLevel } from "../src/localAgeLevel.ts";
import { localLanguage } from "../src/localLanguage.ts";
import { localCareProgress, localDigProgress, localPairsProgress, localProgress, localSkeletonProgress, localSortingProgress, type KeyValueStorage } from "../src/localProgress.ts";
import { localTheme } from "../src/localTheme.ts";
import { SIDE_INSETS } from "../src/mediaViewport.ts";
import type { StartTimer } from "../src/ownedTimers.ts";
import { pictureStore, type LoadPicture, type PictureStore } from "../src/Picture.tsx";
import type { Language } from "../src/language/language.ts";
import { PROMPTS, presentQuestion } from "../src/presentation.ts";
import { choose, questionState, type Random } from "../src/quiz/index.ts";
import { startPlay } from "../src/quiz/play.ts";
import { attributeOf, correctOf, QUESTION_KINDS, ROUND_LENGTH, type Question } from "../src/quiz/round.ts";
import { TEXTS } from "../src/language/texts.ts";
import { boardState, startBoard, type Dinosaur as Sortable, type Property, type Sorting } from "../src/sorting/index.ts";
import type { Theme } from "../src/theme.ts";
import type { LayoutKeeping } from "../src/useKeptRow.ts";
import { styleAt } from "./windowSizes.ts";

export const SHIPPED_DINOSAURS = readDinosaurs(records);
export const SHIPPED_CATALOGUE = readCatalogue(records);
export const SHIPPED_VISITORS = readVisitors(records);
export const SHIPPED_SORTABLES = readSortables(records);
// The dinosaurs with a whole skeleton drawn, as the app finds them.
export const SHIPPED_WHOLE_SKELETONS: ReadonlySet<string> = new Set(
  records.map(({ id }) => id).filter((id) => existsSync(join(import.meta.dirname, "../src/assets/skeletons", id, "skeleton.webp")))
);
export const SHIPPED_PALS = readPals(records, SHIPPED_WHOLE_SKELETONS);
export const SHIPPED_SKELETONS = readSkeletons(records, skeletonPlaces);
export const SHIPPED_DIG = readDig(
  SHIPPED_DINOSAURS.map(({ id }) => id),
  digFile as DigFile
);

// A body picture URL of the dinosaur's own, for tests that are not about
// the picture files.
export const fakeBodyPicture = (dinosaurId: string) => `/pictures/${dinosaurId}.webp`;
export const fakeTreasurePicture = (kind: string) => `/treasures/${kind}.webp`;

// A care picture URL of the item's own, for tests that are not about the
// picture files.
export const fakeItemPicture = (name: string) => `/care/${name}.webp`;

// A skeleton picture URL of the part's own, for tests that are not about
// the picture files.
export const fakeSkeletonPicture = (dinosaurId: string, part: string) => `/skeletons/${dinosaurId}/${part}.webp`;

// How a test gives the app its pictures and its timers: the loader, the
// store that alone calls it, as App takes it, and the timers.
export type PictureClock = { loadPicture: LoadPicture; pictures: PictureStore; startTimer: StartTimer };

// The clock of `loadPicture`, its store calling it.
export const pictureClock = (loadPicture: LoadPicture, startTimer: StartTimer): PictureClock => ({ loadPicture, pictures: pictureStore(loadPicture), startTimer });

// Pictures for tests that are not about them: each is loaded the moment
// it is asked for, and any layout motion settles at the next microtask.
export function loadedPictures(): PictureClock {
  return pictureClock(
    (_url, done) => done("loaded"),
    (_ms, fire) => {
      queueMicrotask(fire);
      return () => {};
    }
  );
}

export type ManualPictures = PictureClock & {
  // The URL of every picture asked for and not yet finished, in order.
  loading(): string[];
  // Ends the loading of `url`: from then on it is loaded.
  finish(url: string): void;
  // Ends the loading of `url` as failed.
  fail(url: string): void;
  // Ends the loading of every picture asked for so far: from then on
  // they are loaded.
  finishAll(): void;
  // The length of every timer started and not yet fired or stopped.
  timers(): number[];
  // Fires every running timer of `ms`.
  fire(ms: number): void;
  // Fires every timer of `ms` stopped before it fired, as one whose stop
  // came too late.
  deliverStopped(ms: number): void;
};

// Pictures that load and a timer that fires only when the test says.
export function manualPictures(): ManualPictures {
  const loading: Array<{ url: string; done: (outcome: "loaded" | "failed") => void }> = [];
  const timers: Array<{ ms: number; fire: () => void }> = [];
  const stopped: Array<{ ms: number; fire: () => void }> = [];
  const drop = <T>(list: T[], item: T) => list.splice(list.indexOf(item), 1);
  const end = (url: string, outcome: "loaded" | "failed") => {
    for (const picture of loading.filter((picture) => picture.url === url)) {
      drop(loading, picture);
      picture.done(outcome);
    }
  };
  return {
    ...pictureClock(
      (url, done) => {
        loading.push({ url, done });
      },
      (ms, fire) => {
        const timer = { ms, fire };
        timers.push(timer);
        return () => {
          if (!timers.includes(timer)) return;
          drop(timers, timer);
          stopped.push(timer);
        };
      }
    ),
    loading: () => loading.map(({ url }) => url),
    finish: (url) => end(url, "loaded"),
    fail: (url) => end(url, "failed"),
    finishAll: () => {
      for (const url of new Set(loading.map(({ url }) => url))) end(url, "loaded");
    },
    timers: () => timers.map(({ ms }) => ms),
    fire: (ms) => {
      for (const timer of timers.filter((timer) => timer.ms === ms)) {
        drop(timers, timer);
        timer.fire();
      }
    },
    deliverStopped: (ms) => {
      for (const timer of stopped.filter((timer) => timer.ms === ms)) {
        drop(stopped, timer);
        timer.fire();
      }
    }
  };
}

// What the app takes from a browser to load pictures and keep time, as
// spies: the source of each image it decodes, the timers it started, by
// their id, the ids of those it stopped, and the frames it asked for and
// the ids of those it called off. No image ever finishes decoding, no
// timer or frame ever fires and the clock stands at `now`.
export function pictureBrowser(now = new Date(2026, 9, 18, 9, 30)) {
  const decoding: string[] = [];
  const timers: Array<{ ms: number; fire: () => void }> = [];
  const stopped: number[] = [];
  const frames: Array<() => void> = [];
  const calledOff: number[] = [];
  class Image {
    src = "";
    decode() {
      decoding.push(this.src);
      return new Promise<void>(() => {});
    }
  }
  return {
    Image,
    setTimeout: (fire: () => void, ms: number) => timers.push({ ms, fire }) - 1,
    clearTimeout: (id: number) => {
      stopped.push(id);
    },
    requestAnimationFrame: (fire: () => void) => frames.push(fire) - 1,
    cancelAnimationFrame: (id: number) => {
      calledOff.push(id);
    },
    Date: { now: () => now.getTime() },
    performance: { now: () => 0 },
    decoding,
    timers,
    stopped,
    frames,
    calledOff
  };
}

export type ManualTimers = PictureClock & {
  // The length of every timer started and not yet fired or stopped.
  timers(): number[];
  // Fires every running timer of `ms`.
  fire(ms: number): void;
  // Fires every timer of `ms` stopped before it fired, as one whose stop
  // came too late.
  deliverStopped(ms: number): void;
  // Fires the running timers, and those they start, until none is left.
  settle(): void;
};

// Pictures loaded the moment they are asked for, and timers that fire
// only when the test says.
export function manualTimers(): ManualTimers {
  const pictures = manualPictures();
  return {
    ...pictureClock((_url, done) => done("loaded"), pictures.startTimer),
    timers: pictures.timers,
    fire: pictures.fire,
    deliverStopped: pictures.deliverStopped,
    settle: () => {
      for (let ms = pictures.timers()[0]; ms !== undefined; ms = pictures.timers()[0]) pictures.fire(ms);
    }
  };
}

// The pictures on screen loaded, when the test loads pictures by hand,
// so it sees only those asked for from then on.
export function loadShownPictures(given: PictureClock) {
  if ("finishAll" in given) act(() => (given as ManualPictures).finishAll());
}

// A seeded random source (mulberry32): each seed is one repeatable run.
// The question on screen, read back by its prompt in `language` and the
// shipped dinosaurs named on its two cards.
export function shownQuestion(language: Language = "en"): Question {
  const heading = screen.getByRole("heading").textContent ?? "";
  const kind = QUESTION_KINDS.find((each) => heading.includes(TEXTS[language].prompts[PROMPTS[each]]));
  if (!kind) throw new Error(`No question asks "${heading}"`);
  const [left, right] = within(screen.getByRole("group", { name: TEXTS[language].creatures }))
    .getAllByRole("button")
    .map((card) => SHIPPED_DINOSAURS.find((dinosaur) => dinosaur.name[language] === card.getAttribute("aria-label")));
  if (!left || !right) throw new Error("Expected two shipped dinosaurs on the cards");
  return { kind, attribute: attributeOf(kind), left, right };
}

export const wrongOf = (question: Question) => (correctOf(question) === question.left ? question.right : question.left);

export function seededRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A best-score rule that answers `beaten` whatever it is asked, and keeps
// what it was asked, so a game's scoring is proved apart from the rule.
export function scoringSpy<Beaten>(beaten: Beaten) {
  const asked: Array<[previous: number | null, score: number]> = [];
  return {
    beatBest: (previous: number | null, score: number) => {
      asked.push([previous, score]);
      return beaten;
    },
    asked
  };
}

// A new board sorting by `property`. A board sorts by any property, so
// boards are started until one does.
export function sortingBy(property: Property, dinosaurs: readonly Sortable[] = SHIPPED_SORTABLES, seed = 1, level: AgeLevel = "hatchling"): Sorting {
  const random = seededRandom(seed);
  for (let tries = 0; tries < 100; tries++) {
    const sorting = startBoard(dinosaurs, level, random);
    if (boardState(sorting).property === property) return sorting;
  }
  throw new Error(`No board sorted by ${property}`);
}

export type ManualViewport = Viewport & {
  turn(to: "portrait" | "landscape"): void;
  resize(size: SizeClass, upright: boolean): void;
};

export const PORTRAIT_LAYOUTS: AppProps["portraitLayouts"] = {
  home: ["tall"], catalogue: ["tall"], dinosaur: ["tall"], sandWriting: ["tall", "tall-narrow"]
};

// Window and screen changes are independent and only happen on request.
// The window's sides have the safe-area insets `sideInsets`, none unless
// given.
export function manualViewport(initial: "portrait" | "landscape", sideInsets: ViewportInsets = { left: 0, right: 0 }): ManualViewport {
  let size: SizeClass = initial === "portrait" ? "tall" : "wide";
  let upright = initial === "portrait";
  const listeners = new Set<() => void>();
  const resize = (next: SizeClass, screenUpright: boolean) => {
    size = next;
    upright = screenUpright;
    listeners.forEach((onChange) => onChange());
  };
  return {
    sizeClass: () => size,
    isScreenUpright: () => upright,
    // The test's window, which openWindow sizes for the stylesheet too.
    width: () => window.innerWidth,
    sideInsets: () => sideInsets,
    subscribe: (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    turn: (to) => resize(to === "portrait" ? "tall" : "wide", to === "portrait"),
    resize
  };
}

// A browser window `width` wide, resized only when the test resizes it.
// Spread into a browser, its resize sizes the browser it was spread into.
export function manualWindow(width: number) {
  const listeners = new Set<() => void>();
  return {
    innerWidth: width,
    addEventListener: (_: "resize", listener: () => void) => void listeners.add(listener),
    removeEventListener: (_: "resize", listener: () => void) => void listeners.delete(listener),
    resize(this: { innerWidth: number }, to: number) {
      this.innerWidth = to;
      listeners.forEach((onResize) => onResize());
    }
  };
}

// A browser's computed style of `root`, its root, where app.css sets the
// window's side safe-area insets, `insets`; any other element has no
// style here.
export function rootInsets(root: Element, insets: ViewportInsets = { left: 0, right: 0 }) {
  const values: Record<string, string> = { [SIDE_INSETS.left]: `${insets.left}px`, [SIDE_INSETS.right]: `${insets.right}px` };
  return {
    getComputedStyle: (element: Element) => {
      if (element !== root) throw new Error("Only the root's style is read");
      return { getPropertyValue: (property: string) => values[property] ?? "" };
    }
  };
}

// The device screen, changed independently of the window's media queries.
export function manualScreenOrientation(initial: OrientationType) {
  const orientation = Object.assign(new EventTarget(), { type: initial });
  return {
    orientation,
    turn: (type: OrientationType) => {
      orientation.type = type;
      orientation.dispatchEvent(new Event("change"));
    }
  };
}

export type ManualVisibility = PageVisibility & { switchTo(to: "hidden" | "visible"): void };

// The app's visibility, switched only when the test switches it.
export function manualVisibility(initial: "hidden" | "visible"): ManualVisibility {
  let hidden = initial === "hidden";
  const listeners = new Set<() => void>();
  return {
    isHidden: () => hidden,
    subscribe: (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    switchTo: (to) => {
      hidden = to === "hidden";
      listeners.forEach((onChange) => onChange());
    }
  };
}

// A browser's document, whose visibility the test sets and which reports
// each change as a browser does, and its version footer, whose attributes
// the test reads, unless the page has none.
export function browserDocument(initial: DocumentVisibilityState = "visible", { versionFooter = true } = {}) {
  const target = new EventTarget();
  const attributes: Record<string, string> = {};
  const footer = { setAttribute: (name: string, value: string) => void (attributes[name] = value) };
  const document = Object.assign(target, {
    visibilityState: initial,
    getElementById: (id: string) => (versionFooter && id === "version" ? footer : null),
    // The root, whose computed style the browser reads, as wide as the
    // window: no scrollbar takes room.
    documentElement: { clientWidth: 1024 } as HTMLElement,
    // No part of the page is marked to move as the window turns.
    querySelectorAll: (() => []) as unknown as ParentNode["querySelectorAll"]
  });
  return {
    document,
    footer: attributes,
    switchTo: (to: DocumentVisibilityState) => {
      document.visibilityState = to;
      target.dispatchEvent(new Event("visibilitychange"));
    }
  };
}

export type ManualAppearance = Appearance & { switchTo(to: Theme): void };

// The device appearance, switched only when the test switches it.
export function manualAppearance(initial: Theme): ManualAppearance {
  let dark = initial === "dark";
  const listeners = new Set<() => void>();
  return {
    isDark: () => dark,
    subscribe: (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    switchTo: (to) => {
      dark = to === "dark";
      listeners.forEach((onChange) => onChange());
    }
  };
}

export type MemoryStorage = KeyValueStorage & { items: Map<string, string> };

// Browser storage held in a map the test reads. `read: false` throws on
// every read, as a browser that blocks storage does; `save: false` throws
// on every write, as a full or read-only storage does.
export function memoryStorage(
  items: Record<string, string> = {},
  { read = true, save = true }: { read?: boolean; save?: boolean } = {}
): MemoryStorage {
  const map = new Map(Object.entries(items));
  return {
    items: map,
    getItem: (key) => {
      if (!read) throw new DOMException("The storage cannot be read", "SecurityError");
      return map.get(key) ?? null;
    },
    setItem: (key, value) => {
      if (!save) throw new DOMException("The storage is full", "QuotaExceededError");
      map.set(key, value);
    }
  };
}

// The quiz's progress as the app keeps it, with `bestScore` its Hatchling
// best, as a best saved before the quiz had levels reads, and no other.
export function quizSaved(bestScore: number | null, roundsPlayed: number) {
  return { progress: { best: { hatchling: bestScore, explorer: null, paleontologist: null }, roundsPlayed }, levelChoice: undefined };
}

// Progress for tests that are not about it: none kept yet, and saving works.
export function emptyProgress() {
  const storage = memoryStorage();
  return localProgress(() => storage);
}

// Care for tests that are not about it: every shipped dinosaur may
// visit, no care progress kept yet, saving works, and the device asks for
// full motion.
export function emptyCare(): Pick<AppProps, "visitors" | "careProgress" | "itemPicture" | "reducedMotion"> {
  const storage = memoryStorage();
  return { visitors: SHIPPED_VISITORS, careProgress: localCareProgress(() => storage), itemPicture: fakeItemPicture, reducedMotion: () => false };
}

// The sorting game for tests that are not about it: every shipped
// dinosaur may be sorted, no sorting progress kept yet, and saving works.
export function emptySorting(): Pick<AppProps, "sortables" | "sortingProgress"> {
  const storage = memoryStorage();
  return { sortables: SHIPPED_SORTABLES, sortingProgress: localSortingProgress(() => storage) };
}

// Find the pair for tests that are not about it: every shipped dinosaur
// may be dealt, no progress kept yet, and saving works.
export function emptyPairs(): Pick<AppProps, "pals" | "pairsProgress"> {
  const storage = memoryStorage();
  return { pals: SHIPPED_PALS, pairsProgress: localPairsProgress(() => storage) };
}

// The skeleton game for tests that are not about it: every shipped
// skeleton may be built, no skeleton progress kept yet, saving works, and
// the app is never hidden.
export function emptySkeletons(): Pick<AppProps, "skeletons" | "skeletonPicture" | "skeletonProgress" | "pageVisibility"> {
  const storage = memoryStorage();
  return {
    skeletons: SHIPPED_SKELETONS,
    skeletonPicture: fakeSkeletonPicture,
    skeletonProgress: localSkeletonProgress(() => storage),
    pageVisibility: manualVisibility("visible")
  };
}

// The dig game for tests that are not about it: every shipped dinosaur
// may be dug up, none dug up yet, saving works, and the sand is never
// drawn, jsdom having no canvas.
export function emptyDig(): Pick<AppProps, "digDinosaurs" | "digProgress" | "sandContext"> {
  const storage = memoryStorage();
  return { digDinosaurs: SHIPPED_DIG, digProgress: localDigProgress(() => storage), sandContext: () => null };
}

// The page's motion between layouts and its chips' widths for tests that
// are not about them: every part is measured where it stands in any
// layout, so nothing glides, and a fade changes the layout and ends at
// once; every chip's parts take no width, so the chips stand on one row.
export function pageAtRest(): Pick<AppProps, "layoutMotion" | "chipWidths" | "pictureMotion"> {
  return {
    pictureMotion: { now: () => 0, duration: 320, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    chipWidths: { width: () => 0, subscribe: () => () => {} },
    layoutMotion: {
      parts: document,
      measure: () => ({ left: 0, top: 0, width: 0, height: 0 }),
      frame: () => undefined,
      extend: () => () => {},
      animate: () => ({ cancel: () => {}, effect: null }),
      animations: () => [],
      opacity: () => 1,
      nextFrame: () => () => {},
      startViewTransition: (update, finished) => {
        update();
        finished();
      },
      timing: { glide: 240, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
    }
  };
}

// A page that keeps nothing through a change of layout, for a screen
// rendered alone.
export const keptNothing: LayoutKeeping = { keep: () => () => {}, isRunning: () => false };

// The language for tests that are not about it: an English device, no
// language chosen yet, and a version footer nobody reads.
export function englishDevice() {
  const storage = memoryStorage();
  return { deviceLanguage: "en-GB", languageStore: localLanguage(() => storage), nameVersion: unreadVersion };
}

// A featured history the test reads, starting from `initial`: the game
// featured replaces the last one.
export function featuredSpy(initial: FeaturedHistory): FeaturedStore {
  let history = initial;
  return {
    history: () => history,
    feature: (featuring) => {
      history = { ...history, lastFeatured: featuring };
    }
  };
}

// Each game whose start the app counted, in order.
export function countedStarts() {
  const counted: HomeGame[] = [];
  return { counted, startCounter: { countStart: (game: HomeGame) => void counted.push(game) } };
}

// The featured game for tests that are not about its choice: `game`,
// already chosen for the clock's day, so the choice draws nothing from
// the random source, and starts counted where no test reads them.
export function featuring(game: HomeGame = "compare"): Pick<AppProps, "now" | "pictureMotion" | "featuredStore" | "startCounter"> {
  const now = new Date(2026, 9, 18, 9, 30);
  return { pictureMotion: { now: () => 0, duration: 320, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }, now: () => now, featuredStore: featuredSpy({ timesStarted: new Map(), lastFeatured: { game, on: calendarDay(now) } }), startCounter: countedStarts().startCounter };
}

// The version footer for tests that are not about it: its name is dropped.
export const unreadVersion = () => {};

// The theme for tests that are not about it: a device in its light
// appearance, and no theme chosen yet.
export function lightDevice() {
  const storage = memoryStorage();
  return { appearance: manualAppearance("light"), themeStore: localTheme(() => storage) };
}

// The age level for tests that are not about it: none picked yet, and
// saving works.
export function unsetAgeLevel(): Pick<AppProps, "ageLevelStore"> {
  const storage = memoryStorage();
  return { ageLevelStore: localAgeLevel(() => storage) };
}

// What the question screen shows of `question`, asked first in a round of
// it alone, once `choice` is chosen when one is given: the quiz's state of
// the question, presented as the app presents it.
export function questionView(question: Question, language: Language, choice?: string) {
  const play = startPlay(Array.from({ length: ROUND_LENGTH }, () => question), "hatchling");
  return presentQuestion(questionState(choice === undefined ? play : choose(play, choice)), language, fakeBodyPicture);
}

// Media query lists, one for each query given, whose matches the test
// sets. A query not given has no list, so the test fails on it.
export function mediaQueries(initial: Record<string, boolean>) {
  const queries: string[] = [];
  const lists = new Map(
    Object.entries(initial).map(([query, matches]) => {
      const target = new EventTarget();
      return [query, { target, list: Object.assign(target, { matches, media: query }) as unknown as MediaQueryList }];
    })
  );
  const of = (query: string) => {
    const found = lists.get(query);
    if (!found) throw new Error(`No media query list for ${query}`);
    return found;
  };
  return {
    queries,
    matchMedia: (query: string) => {
      queries.push(query);
      return of(query).list;
    },
    change: (query: string, to: boolean) => {
      const { target, list } = of(query);
      (list as { matches: boolean }).matches = to;
      target.dispatchEvent(new Event("change"));
    }
  };
}

// The media query lists the app asks a browser for, none of them
// matching: an iPad in landscape, in its light appearance, asking for full
// motion.
export function browserQueries() {
  return mediaQueries({ "(orientation: portrait)": false, "(max-width: 599.98px)": false, "(max-height: 599.98px)": false, "(prefers-color-scheme: dark)": false, "(prefers-reduced-motion: reduce)": false });
}

export type WebpImage = { width: number; height: number; alpha: boolean };

const fourCC = (bytes: Uint8Array, at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
const uint24 = (bytes: Uint8Array, at: number) => (bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8) | ((bytes[at + 2] ?? 0) << 16);

// The canvas size of a WebP file and whether it has alpha, from the header
// of its first chunk: extended (VP8X), lossless (VP8L) or lossy (VP8).
export function readWebp(bytes: Uint8Array): WebpImage {
  if (fourCC(bytes, 0) !== "RIFF" || fourCC(bytes, 8) !== "WEBP") throw new Error("Not a WebP file");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  switch (fourCC(bytes, 12)) {
    case "VP8X":
      return { width: uint24(bytes, 24) + 1, height: uint24(bytes, 27) + 1, alpha: ((bytes[20] ?? 0) & 0x10) !== 0 };
    case "VP8L": {
      const bits = view.getUint32(21, true);
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1, alpha: ((bits >>> 28) & 1) === 1 };
    }
    case "VP8 ":
      return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff, alpha: false };
    default:
      throw new Error(`Unknown WebP chunk ${fourCC(bytes, 12)}`);
  }
}

// A colour's red, green and blue channels, from 0 to 255, and its alpha,
// from 0 to 1, from a hex or rgb() form.
function rgba(color: string): [number, number, number, number] {
  const hex = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})([\da-f]{2})?$/i.exec(color);
  const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(color);
  const parts = hex
    ? [...hex.slice(1, 4).map((part) => parseInt(part, 16)), hex[4] === undefined ? 1 : parseInt(hex[4], 16) / 255]
    : rgb && [...rgb.slice(1, 4).map(Number), rgb[4] === undefined ? 1 : Number(rgb[4])];
  const [r, g, b, a] = parts ?? [];
  if (r === undefined || g === undefined || b === undefined || a === undefined) throw new Error(`Cannot read the colour ${color}`);
  return [r, g, b, a];
}

const format = ([r, g, b]: number[]) => `rgb(${(r ?? 0).toFixed(0)}, ${(g ?? 0).toFixed(0)}, ${(b ?? 0).toFixed(0)})`;

// Whether two colours are the same, to the two decimals of alpha a
// computed style keeps.
export function sameColour(a: string, b: string): boolean {
  const [x, y] = [rgba(a), rgba(b)];
  return x.every((channel, at) => Math.abs(channel - (y[at] ?? NaN)) <= (at === 3 ? 0.01 : 0));
}

// What `color` looks like laid over the opaque colour `under`.
export function seenOn(color: string, under: string): string {
  const [top, bottom] = [rgba(color), rgba(under)];
  const alpha = top[3];
  return format([0, 1, 2].map((at) => (top[at] ?? 0) * alpha + (bottom[at] ?? 0) * (1 - alpha)));
}

const hasBackground = (element: Element) => rgba(getComputedStyle(element).backgroundColor)[3] > 0;

// The elements with a background of their own, translucent or not.
export function surfacesIn(root: Element): Element[] {
  return [root, ...root.querySelectorAll("*")].filter(hasBackground);
}

// The colour an element is seen on: its own background, or the nearest
// one behind it, with each translucent layer laid over what is behind it.
export function surfaceOf(element: Element): string {
  const layers: string[] = [];
  for (let at: Element | null = element; at; at = at.parentElement) {
    const background = getComputedStyle(at).backgroundColor;
    if (!hasBackground(at)) continue;
    if (rgba(background)[3] < 1) {
      layers.push(background);
      continue;
    }
    return layers.reduceRight((under, layer) => seenOn(layer, under), format(rgba(background)));
  }
  throw new Error("The page has no background");
}

// The WCAG 2 relative luminance of an opaque colour, from 0 for black to
// 1 for white.
export function luminance(color: string): number {
  const [r, g, b] = rgba(color)
    .slice(0, 3)
    .map((channel) => {
      const c = channel / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

// The WCAG 2 contrast ratio of two opaque colours.
export function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

// The design's colours, its fm-* variables in each theme, as
// design/rexlab.pen gives them.
export const PALETTE: Record<Theme, Record<string, string>> = {
  light: {
    bg: "#F2EFE8",
    surface: "#FFFDF8",
    "surface-2": "#E6E2D9",
    ink: "#1D2742",
    "ink-soft": "#5C647A",
    line: "#1D27421F",
    base: "#1F2B4D",
    "on-base": "#F6F2E9",
    amber: "#E39B2D",
    terra: "#C9583D",
    sky: "#A9BCD6",
    "strata-1": "#E7E1D5",
    "strata-2": "#DCD3C4",
    "strata-3": "#D0C5B2",
    good: "#2E7D4F",
    bad: "#B83B2B",
    shadow: "#1D274224"
  },
  dark: {
    bg: "#0F1320",
    surface: "#181E2E",
    "surface-2": "#222A3D",
    ink: "#ECE8DE",
    "ink-soft": "#9CA3B6",
    line: "#ECE8DE1F",
    base: "#2C3B66",
    "on-base": "#F6F2E9",
    amber: "#F2B24B",
    terra: "#E57A5D",
    sky: "#34466E",
    "strata-1": "#141A29",
    "strata-2": "#192033",
    "strata-3": "#1F273C",
    good: "#63C98C",
    bad: "#F08A78",
    shadow: "#00000066"
  }
};

// The translucent layers the design lays over the navy, the terracotta
// and the amber in both themes.
export const OVERLAYS = ["#00000026", "#00000033", "#FFFFFF1A", "#FFFFFF1F", "#FFFFFF33", "#FFFFFF59"];

// The name of the first symbol an element shows, such as "sun" or "globe".
export function symbolOf(element: Element): string | undefined {
  const classes = element.querySelector("svg.lucide")?.classList ?? [];
  return [...classes].find((name) => name.startsWith("lucide-"))?.slice("lucide-".length);
}

// What an element reads in words, without its symbols and pictures.
export function words(element: HTMLElement): string {
  const copy = element.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('[aria-hidden="true"], [role="img"]').forEach((part) => part.remove());
  return copy.textContent?.trim() ?? "";
}

// The element `selector` finds, for a helper that only locates a part
// the screen is known to show. A role query weighs every element's style
// against the whole stylesheet, so a helper called at each step of play
// finds its part this way, and a test of the screen's own holds the part
// to its role and name.
export function part<T extends Element = HTMLElement>(selector: string, within: ParentNode = document): T {
  const found = within.querySelector<T>(selector);
  if (!found) throw new Error(`No ${selector} on the screen`);
  return found;
}

// The home page's row of tiles.
export function tilesRow(): HTMLElement {
  const row = document.querySelector<HTMLElement>(".games-tiles");
  if (!row) throw new Error("No tiles on the page");
  return row;
}

// The home page's row of tiles laid out as a browser would, which jsdom
// does not: upright it runs from the page's 56-pixel padding to the
// window's right edge, and in landscape it takes four sevenths of what
// the page's 56-pixel sides and the large card's 28-pixel gap leave. Its
// columns, of two each, are as wide and as far apart as the stylesheet
// sets them in the test's window. A tile's frame, drawn under it as it
// glides, takes no place in them.
export function layOutTilesRow(): HTMLElement {
  const row = tilesRow();
  const style = () => styleAt(row, [window.innerWidth, window.innerHeight]);
  const width = () => (document.documentElement.dataset.size === "tall" ? window.innerWidth - 56 : Math.round(((window.innerWidth - 112 - 28) * 4) / 7));
  const scrollWidth = () => {
    const columns = Math.ceil([...row.children].filter((child) => !child.hasAttribute("data-turn-frame")).length / 2);
    return columns * style().px("grid-auto-columns") + (columns - 1) * style().columnGap();
  };
  Object.defineProperties(row, { clientWidth: { get: width }, scrollWidth: { get: scrollWidth } });
  return row;
}

// The child swipes the row of tiles to `scroll`, as the browser reports
// it in a scroll event.
export function swipeTiles(row: HTMLElement, scroll: number) {
  row.scrollLeft = scroll;
  fireEvent.scroll(row);
}

// A game's own tile on the home page, apart from the large card. The
// large card's game has no tile.
export const homeTile = (name: string) => within(tilesRow()).getByRole("button", { name });

// The way into a game from the home page: its tile, or the large card
// when it features the game.
export const gameDoor = (name: string) => within(document.body).getByRole("button", { name });

// The home page's large card, featuring today's game, not the frame drawn
// under it as it glides.
export function featuredCard(): HTMLElement {
  const card = document.querySelector<HTMLElement>(".featured-card:not([data-turn-frame])");
  if (!card) throw new Error("No featured card on the page");
  return card;
}
