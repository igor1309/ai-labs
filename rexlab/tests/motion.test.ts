import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type Rule = { prelude: string; body: string };

// The rules of a stylesheet, each with what comes before its braces and
// what is inside them, at-rules as rules of their own.
function rulesOf(css: string): Rule[] {
  const rules: Rule[] = [];
  let start = 0;
  let depth = 0;
  let open = 0;
  for (let at = 0; at < css.length; at++) {
    if (css[at] === "{") {
      if (depth === 0) open = at;
      depth++;
    } else if (css[at] === "}") {
      depth--;
      if (depth === 0) {
        rules.push({ prelude: css.slice(start, open).trim(), body: css.slice(open + 1, at) });
        start = at + 1;
      }
    }
  }
  return rules;
}

// The declarations of a rule's body, by property, in order.
const declarationsOf = (body: string) =>
  body
    .split(";")
    .map((declaration) => declaration.trim())
    .filter((declaration) => declaration.includes(":") && !declaration.includes("{"))
    .map((declaration) => {
      const colon = declaration.indexOf(":");
      return { property: declaration.slice(0, colon).trim(), value: declaration.slice(colon + 1).trim() };
    });

const CSS = readFileSync(join(import.meta.dirname, "../src/app.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const RULES = rulesOf(CSS);
const REDUCED = RULES.filter(({ prelude }) => prelude === "@media (prefers-reduced-motion: reduce)").flatMap(({ body }) => rulesOf(body));
const PLAIN = RULES.filter(({ prelude }) => !prelude.startsWith("@"));
const KEYFRAMES = RULES.filter(({ prelude }) => prelude.startsWith("@keyframes"));

const tokensOf = (rules: Rule[]) =>
  Object.fromEntries(
    rules
      .filter(({ prelude }) => prelude === ":root")
      .flatMap(({ body }) => declarationsOf(body))
      .filter(({ property }) => /^--(motion|ease)-/.test(property))
      .map(({ property, value }) => [property, value])
  );

const TIMING = /^(animation|transition)(-duration|-delay|-timing-function)?$/;
const MOVING = /\b(transform|translate|scale|height|width)\b/;

describe("the motion", () => {
  it("is built from the shared tokens", () => {
    expect(tokensOf(PLAIN)).toEqual({
      "--ease-out": "cubic-bezier(0.22, 1, 0.36, 1)",
      "--ease-overshoot": "cubic-bezier(0.34, 1.56, 0.64, 1)",
      "--motion-small": "160ms",
      "--motion-standard": "240ms",
      "--motion-screen": "320ms",
      "--motion-count": "600ms",
      "--motion-stagger": "40ms",
      "--motion-amount": "1"
    });
  });

  it("times and eases every animation and transition by the tokens alone", () => {
    const timings = [...PLAIN, ...REDUCED].flatMap(({ prelude, body }) =>
      declarationsOf(body)
        .filter(({ property }) => TIMING.test(property))
        .map(({ property, value }) => ({ rule: `${prelude} ${property}`, value: value.replace(/var\(--[\w-]+\)/g, "") }))
    );

    expect(timings.length).toBeGreaterThan(0);
    expect(timings.filter(({ value }) => /\d(ms|s)\b|cubic-bezier|steps\(|\b(ease|ease-in|ease-out|ease-in-out|linear)\b/.test(value))).toEqual([]);
  });

  it("is only short fades with reduced motion", () => {
    expect(tokensOf(REDUCED)).toEqual({
      "--motion-standard": "160ms",
      "--motion-screen": "160ms",
      "--motion-count": "0ms",
      "--motion-stagger": "0ms",
      "--motion-amount": "0"
    });
    // Every keyframe moves by --motion-amount, so it only fades where that
    // is 0; the count-up takes no time there.
    const moves = KEYFRAMES.flatMap(({ prelude, body }) =>
      rulesOf(body).flatMap(({ prelude: offset, body: frame }) =>
        declarationsOf(frame)
          .filter(({ property, value }) => property !== "opacity" && property !== "--count" && !value.includes("var(--motion-amount)"))
          .map(({ property }) => `${prelude} ${offset} ${property}`)
      )
    );
    expect(KEYFRAMES.length).toBeGreaterThan(0);
    expect(moves).toEqual([]);
    // A transition of size or place stops moving there.
    const reducedTransitions = new Map(
      REDUCED.flatMap(({ prelude, body }) =>
        declarationsOf(body)
          .filter(({ property }) => property === "transition-property")
          .map(({ value }) => [prelude, value] as const)
      )
    );
    const moving = PLAIN.flatMap(({ prelude, body }) =>
      declarationsOf(body).some(({ property, value }) => property === "transition" && MOVING.test(value)) ? [prelude] : []
    );
    expect(moving.length).toBeGreaterThan(0);
    expect(moving.filter((selector) => MOVING.test(reducedTransitions.get(selector) ?? "transform"))).toEqual([]);
  });
});
