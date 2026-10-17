import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const require = createRequire(import.meta.url);

const STYLESHEET = read("../src/app.css");
const MAIN = read("../src/main.tsx");
const INDEX_HTML = read("../index.html");

// The fallbacks every device has, which need no font file.
const SYSTEM_FAMILIES = new Set(["system-ui", "sans-serif"]);

const families = (css: string, declaration: RegExp) =>
  [...css.matchAll(declaration)].flatMap((match) => (match[1] ?? "").split(",").map((family) => family.trim().replace(/^["']|["']$/g, "")));

// The font families declared by each font package main.tsx imports.
function bundledFamilies(): Set<string> {
  const packages = [...MAIN.matchAll(/^import\s+["'](@fontsource[^"']*)["'];/gm)].map((match) => match[1] ?? "");
  return new Set(packages.flatMap((name) => families(readFileSync(require.resolve(name), "utf8"), /font-family:\s*([^;]+);/g)));
}

describe("the fonts", () => {
  it("are Lexend alone, bundled with the app", () => {
    expect(bundledFamilies()).toEqual(new Set(["Lexend Variable"]));
  });

  it("named in the stylesheet are each bundled, or a fallback every device has", () => {
    const named = families(STYLESHEET, /font-family:\s*([^;]+);/g);
    const bundled = bundledFamilies();

    expect(named).toContain("Lexend Variable");
    expect(named.filter((family) => !bundled.has(family) && !SYSTEM_FAMILIES.has(family))).toEqual([]);
  });

  it("are not fetched from elsewhere when the page loads", () => {
    expect(INDEX_HTML).not.toMatch(/https?:\/\//);
  });
});
