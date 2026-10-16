import records from "../src/data/dinosaurs.json";
import type { Appearance } from "../src/App.tsx";
import { readDinosaurs } from "../src/dinosaurs.ts";
import { localLanguage } from "../src/localLanguage.ts";
import { localProgress, type KeyValueStorage } from "../src/localProgress.ts";
import { localTheme } from "../src/localTheme.ts";
import type { Orientation } from "../src/OrientationGate.tsx";
import type { Language } from "../src/language/language.ts";
import { presentQuestion } from "../src/presentation.ts";
import { choose, questionState, type Random } from "../src/quiz/index.ts";
import { startPlay } from "../src/quiz/play.ts";
import { ROUND_LENGTH, type Question } from "../src/quiz/round.ts";
import type { Theme } from "../src/theme.ts";

export const SHIPPED_DINOSAURS = readDinosaurs(records);

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
  return presentQuestion(questionState(choice === undefined ? play : choose(play, choice)), language);
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

function srgb(color: string): [number, number, number] {
  const hex = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(color);
  const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color);
  const parts = hex ? hex.slice(1).map((part) => parseInt(part, 16)) : rgb?.slice(1).map(Number);
  const [r, g, b] = parts ?? [];
  if (r === undefined || g === undefined || b === undefined) throw new Error(`Cannot read the colour ${color}`);
  return [r, g, b];
}

// The WCAG 2 relative luminance of a colour, from 0 for black to 1 for
// white.
export function luminance(color: string): number {
  const [r, g, b] = srgb(color).map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

// The WCAG 2 contrast ratio of two colours.
export function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}
