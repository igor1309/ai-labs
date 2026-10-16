import records from "../src/data/dinosaurs.json";
import { readDinosaurs } from "../src/dinosaurs.ts";
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
