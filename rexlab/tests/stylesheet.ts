import { readFileSync } from "node:fs";
import { join } from "node:path";

export type SafeArea = { top: number; right: number; bottom: number; left: number };

export const NO_SAFE_AREA: SafeArea = { top: 0, right: 0, bottom: 0, left: 0 };

const CSS = readFileSync(join(import.meta.dirname, "../src/app.css"), "utf8");

// The app's stylesheet as a window with the given safe-area insets reads
// it. jsdom knows no env(), so each inset is written in as the browser
// would resolve it; an environment variable with no value here fails.
// Nor does jsdom put a custom property into another property's value, so
// each custom property that reads an inset is written in where it is
// read. jsdom knows no dvh either: the test's window has no toolbars that
// come and go, so its visible height is its height, and each dvh is read
// as the vh jsdom resolves against that window.
export function appStylesheet(insets: SafeArea): string {
  const inset = (text: string) => text.replace(/env\(safe-area-inset-(top|right|bottom|left)\)/g, (_, side: keyof SafeArea) => `${insets[side]}px`).replace(/\b([\d.]+)dvh\b/g, "$1vh");
  const css = inset(CSS);
  const unknown = /env\([^)]*\)/.exec(css);
  if (unknown) throw new Error(`app.css reads ${unknown[0]}, which the tests give no value`);
  const insetting = new Map([...CSS.matchAll(/(--[\w-]+)\s*:\s*([^;{}]*env\(safe-area-inset-[^;{}]*);/g)].map(([, name, value]) => [name, inset(value ?? "")]));
  return css.replace(/var\((--[\w-]+)\)/g, (read, name: string) => insetting.get(name) ?? read);
}
