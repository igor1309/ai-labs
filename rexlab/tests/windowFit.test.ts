import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type Declaration = { property: string; value: string };
// A rule's at-rules are those it sits in, outermost first.
type Rule = { selector: string; declarations: Declaration[]; atRules: string[] };

const read = (path: string) => readFileSync(join(import.meta.dirname, path), "utf8");

const squeeze = (text: string) => text.trim().replace(/\s+/g, " ");

// Every rule of the stylesheet that holds declarations, those inside an
// at-rule included, with its declarations in order.
const RULES: Rule[] = (() => {
  const rules: Rule[] = [];
  const open: string[] = [];
  for (const [, text, brace] of read("../src/app.css").replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]*)([{}])/g)) {
    if (brace === "{") {
      open.push(squeeze(text ?? ""));
      continue;
    }
    const selector = open.pop() ?? "";
    if (selector.startsWith("@")) continue;
    rules.push({
      selector,
      atRules: open.filter((prelude) => prelude.startsWith("@")),
      declarations: (text ?? "")
        .split(";")
        .filter((declaration) => declaration.includes(":"))
        .map((declaration) => {
          const colon = declaration.indexOf(":");
          return { property: declaration.slice(0, colon).trim(), value: squeeze(declaration.slice(colon + 1)) };
        })
    });
  }
  return rules;
})();

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

describe("a pointer that can hover is shown what it can press", () => {
  it("brightens nothing by :hover, which a finger leaves behind after it lifts", () => {
    expect(RULES.filter(({ selector }) => selector.includes(":hover")).map(({ selector }) => selector)).toEqual([]);
  });

  it("brightens what a hovering pointer rests on by the mark the pointer's own kind sets", () => {
    const hovered = RULES.filter(({ selector }) => selector.includes("[data-hovered]"));

    expect(hovered.map(({ selector, atRules, declarations }) => [selector, atRules, declarations])).toEqual([
      ["button[data-hovered]", [], [{ property: "filter", value: "brightness(1.12)" }]]
    ]);
  });

  it("shows the hand over what responds only to a pointer that can hover", () => {
    const hands = RULES.filter(({ declarations }) => declarations.some(({ property, value }) => property === "cursor" && value === "pointer"));

    expect(hands.map(({ selector, atRules }) => [selector, atRules])).toEqual([['button:enabled:not([aria-disabled="true"])', ["@media (hover: hover) and (pointer: fine)"]]]);
  });
});
