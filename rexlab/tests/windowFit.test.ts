import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type Declaration = { property: string; value: string };
type Rule = { selector: string; declarations: Declaration[] };

const read = (path: string) => readFileSync(join(import.meta.dirname, path), "utf8");

// Every rule of the stylesheet that holds declarations, those inside an
// at-rule included, with its declarations in order.
const RULES: Rule[] = [...read("../src/app.css").replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
  selector: (selector ?? "").trim().replace(/\s+/g, " "),
  declarations: (body ?? "")
    .split(";")
    .filter((declaration) => declaration.includes(":"))
    .map((declaration) => {
      const colon = declaration.indexOf(":");
      return { property: declaration.slice(0, colon).trim(), value: declaration.slice(colon + 1).trim().replace(/\s+/g, " ") };
    })
}));

const BARE_VH = /\b[\d.]+vh\b/;

describe("heights follow the visible window", () => {
  it("follows every vh with a dvh declaration of the same meaning, the vh kept as the fallback", () => {
    const heights = RULES.flatMap(({ selector, declarations }) =>
      declarations.flatMap((declaration, at) => (BARE_VH.test(declaration.value) ? [{ selector, declaration, next: declarations[at + 1] }] : []))
    );
    const untwinned = heights
      .filter(({ declaration: { property, value }, next }) => next?.property !== property || next.value !== value.replace(/\b([\d.]+)vh\b/g, "$1dvh"))
      .map(({ selector, declaration: { property, value } }) => `${selector} { ${property}: ${value} }`);

    expect(heights.length).toBeGreaterThan(0);
    expect(untwinned).toEqual([]);
  });
});

describe("the page does not pull or bounce", () => {
  const overscrollOf = ({ declarations }: Rule) =>
    declarations.filter(({ property }) => property.startsWith("overscroll-behavior")).map(({ property, value }) => `${property}: ${value}`);

  it("keeps the page from pulling to refresh or bouncing", () => {
    expect(RULES.filter(({ selector }) => selector === "html, body").map(overscrollOf)).toEqual([["overscroll-behavior: none"]]);
  });

  it("keeps every scrolling part from bouncing or passing its scroll on", () => {
    const scrolling = RULES.filter(({ declarations }) => declarations.some(({ property, value }) => /^overflow(-[xy])?$/.test(property) && /\b(auto|scroll)\b/.test(value)));

    expect(scrolling.map(({ selector }) => selector)).toEqual(expect.arrayContaining([".games-tiles", ".catalogue-grid", ".friends-grid"]));
    expect(scrolling.map((rule) => [rule.selector, overscrollOf(rule)])).toEqual(scrolling.map(({ selector }) => [selector, ["overscroll-behavior: none"]]));
  });
});

describe("safe areas stay clear", () => {
  it("lets the page reach under rounded corners, a home indicator and a notch", () => {
    const viewport = /<meta name="viewport" content="([^"]*)"/.exec(read("../index.html"))?.[1];

    expect(viewport?.split(",").map((part) => part.trim())).toEqual(["width=device-width", "initial-scale=1.0", "viewport-fit=cover"]);
  });
});
