import { THEMES } from "../src/theme.ts";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { afterEach, expect, test } from "vitest";

const design = JSON.parse(readFileSync(join(import.meta.dirname, "../design/dig-site.pen"), "utf8"));

afterEach(() => {
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.size;
});

function token(name: string) { return getComputedStyle(document.documentElement).getPropertyValue(`--ds-${name}`).trim(); }

// The design and the app draw the same themes: a theme added to either
// fails here until the other has it, and every check below runs it.
test("the design's themes are the app's themes", () => {
  const modes = new Set<string>();
  for (const { value } of Object.values(design.variables) as { value: unknown }[]) {
    if (Array.isArray(value)) for (const { theme } of value as { theme: { mode?: string } }[]) if (theme.mode) modes.add(theme.mode);
  }
  expect([...modes].sort()).toEqual([...THEMES].sort());
});

for (const theme of THEMES) for (const size of ["wide", "tall", "tall-narrow", "wide-short"]) {
  test(`dig-site tokens match every design variable in ${theme}, ${size}`, () => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.size = size;
    const device = size === "tall-narrow" || size === "wide-short" ? "phone" : "ipad";
    for (const [name, entry] of Object.entries(design.variables) as [string, { type: string; value: string | number | { value: string | number; theme: { mode?: string; device?: string } }[] }][]) {
      const value = Array.isArray(entry.value) ? entry.value.find(({ theme: axis }) => axis.mode === theme || axis.device === device)!.value : entry.value;
      expect(token(name.slice(3)), name).toBe(name === "ds-font" ? '"Lexend Variable",system-ui,sans-serif' : `${value}${entry.type === "number" ? "px" : ""}`);
    }
  });
}
