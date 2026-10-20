import { readFileSync } from "node:fs";
import { join } from "node:path";

export type SafeArea = { top: number; right: number; bottom: number; left: number };

export const NO_SAFE_AREA: SafeArea = { top: 0, right: 0, bottom: 0, left: 0 };

const CSS = readFileSync(join(import.meta.dirname, "../src/app.css"), "utf8");

// The app's stylesheet as a window with the given safe-area insets reads
// it. jsdom knows no env(), so each inset is written in as the browser
// would resolve it; an environment variable with no value here fails.
export function appStylesheet(insets: SafeArea): string {
  const css = CSS.replace(/env\(safe-area-inset-(top|right|bottom|left)\)/g, (_, side: keyof SafeArea) => `${insets[side]}px`);
  const unknown = /env\([^)]*\)/.exec(css);
  if (unknown) throw new Error(`app.css reads ${unknown[0]}, which the tests give no value`);
  return css;
}
