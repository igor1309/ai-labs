import records from "../src/data/dinosaurs.json";
import type { AppProps, Appearance } from "../src/App.tsx";
import { readCatalogue, readDinosaurs, readPals, readVisitors } from "../src/dinosaurs.ts";
import { localLanguage } from "../src/localLanguage.ts";
import { localCareProgress, localPairsProgress, localProgress, type KeyValueStorage } from "../src/localProgress.ts";
import { localTheme } from "../src/localTheme.ts";
import type { Orientation } from "../src/OrientationGate.tsx";
import type { Language } from "../src/language/language.ts";
import { presentQuestion } from "../src/presentation.ts";
import { choose, questionState, type Random } from "../src/quiz/index.ts";
import { startPlay } from "../src/quiz/play.ts";
import { ROUND_LENGTH, type Question } from "../src/quiz/round.ts";
import type { Theme } from "../src/theme.ts";

export const SHIPPED_DINOSAURS = readDinosaurs(records);
export const SHIPPED_CATALOGUE = readCatalogue(records);
export const SHIPPED_VISITORS = readVisitors(records);
export const SHIPPED_PALS = readPals(records);

// A body picture URL of the dinosaur's own, for tests that are not about
// the picture files.
export const fakeBodyPicture = (dinosaurId: string) => `/pictures/${dinosaurId}.webp`;

// A care picture URL of the item's own, for tests that are not about the
// picture files.
export const fakeItemPicture = (name: string) => `/care/${name}.webp`;

// Pictures for tests that are not about them: each is loaded the moment
// it is asked for, so nothing waits on the timer, which never fires.
export function loadedPictures(): Pick<AppProps, "loadPicture" | "startTimer"> {
  return { loadPicture: (_url, done) => done(), startTimer: () => () => {} };
}

export type ManualPictures = Pick<AppProps, "loadPicture" | "startTimer"> & {
  // The URL of every picture asked for and not yet finished, in order.
  loading(): string[];
  // Ends the loading of `url`: from then on it is loaded or has failed.
  finish(url: string): void;
  // The length of every timer started and not yet fired or stopped.
  timers(): number[];
  // Fires every running timer of `ms`.
  fire(ms: number): void;
};

// Pictures that load and a timer that fires only when the test says.
export function manualPictures(): ManualPictures {
  const loading: Array<{ url: string; done: () => void }> = [];
  const timers: Array<{ ms: number; fire: () => void }> = [];
  const drop = <T>(list: T[], item: T) => list.splice(list.indexOf(item), 1);
  return {
    loadPicture: (url, done) => {
      loading.push({ url, done });
    },
    startTimer: (ms, fire) => {
      const timer = { ms, fire };
      timers.push(timer);
      return () => {
        if (timers.includes(timer)) drop(timers, timer);
      };
    },
    loading: () => loading.map(({ url }) => url),
    finish: (url) => {
      for (const picture of loading.filter((picture) => picture.url === url)) {
        drop(loading, picture);
        picture.done();
      }
    },
    timers: () => timers.map(({ ms }) => ms),
    fire: (ms) => {
      for (const timer of timers.filter((timer) => timer.ms === ms)) {
        drop(timers, timer);
        timer.fire();
      }
    }
  };
}

// What the app takes from a browser to load pictures and keep time, as
// spies: the source of each image it decodes, the timers it started, by
// their id, and the ids of those it stopped. No image ever finishes
// decoding and no timer ever fires.
export function pictureBrowser() {
  const decoding: string[] = [];
  const timers: Array<{ ms: number; fire: () => void }> = [];
  const stopped: number[] = [];
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
    decoding,
    timers,
    stopped
  };
}

export type ManualTimers = Pick<AppProps, "loadPicture" | "startTimer"> & {
  // The length of every timer started and not yet fired or stopped.
  timers(): number[];
  // Fires every running timer of `ms`.
  fire(ms: number): void;
  // Fires the running timers, and those they start, until none is left.
  settle(): void;
};

// Pictures loaded the moment they are asked for, and timers that fire
// only when the test says.
export function manualTimers(): ManualTimers {
  const pictures = manualPictures();
  return {
    loadPicture: (_url, done) => done(),
    startTimer: pictures.startTimer,
    timers: pictures.timers,
    fire: pictures.fire,
    settle: () => {
      for (let ms = pictures.timers()[0]; ms !== undefined; ms = pictures.timers()[0]) pictures.fire(ms);
    }
  };
}

// A seeded random source (mulberry32): each seed is one repeatable run.
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

export type ManualOrientation = Orientation & { turn(to: "portrait" | "landscape"): void };

// The iPad's orientation, turned only when the test turns it.
export function manualOrientation(initial: "portrait" | "landscape"): ManualOrientation {
  let portrait = initial === "portrait";
  const listeners = new Set<() => void>();
  return {
    isPortrait: () => portrait,
    subscribe: (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    turn: (to) => {
      portrait = to === "portrait";
      listeners.forEach((onChange) => onChange());
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

// Find the pair for tests that are not about it: every shipped dinosaur
// may be dealt, no progress kept yet, and saving works.
export function emptyPairs(): Pick<AppProps, "pals" | "pairsProgress"> {
  const storage = memoryStorage();
  return { pals: SHIPPED_PALS, pairsProgress: localPairsProgress(() => storage) };
}

// The language for tests that are not about it: an English device, and no
// language chosen yet.
export function englishDevice() {
  const storage = memoryStorage();
  return { deviceLanguage: "en-GB", languageStore: localLanguage(() => storage) };
}

// The theme for tests that are not about it: a device in its light
// appearance, and no theme chosen yet.
export function lightDevice() {
  const storage = memoryStorage();
  return { appearance: manualAppearance("light"), themeStore: localTheme(() => storage) };
}

// What the question screen shows of `question`, asked first in a round of
// it alone, once `choice` is chosen when one is given: the quiz's state of
// the question, presented as the app presents it.
export function questionView(question: Question, language: Language, choice?: string) {
  const play = startPlay(Array.from({ length: ROUND_LENGTH }, () => question));
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
  return mediaQueries({ "(orientation: portrait)": false, "(prefers-color-scheme: dark)": false, "(prefers-reduced-motion: reduce)": false });
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
