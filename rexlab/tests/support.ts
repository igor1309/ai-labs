import records from "../src/data/dinosaurs.json";
import { readDinosaurs } from "../src/dinosaurs.ts";
import { localLanguage } from "../src/localLanguage.ts";
import { localProgress, type KeyValueStorage } from "../src/localProgress.ts";
import type { Orientation } from "../src/OrientationGate.tsx";
import type { Random } from "../src/quiz/round.ts";

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
