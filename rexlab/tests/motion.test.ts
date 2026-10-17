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

// The animation each selector of a rule runs, from its `animation`
// shorthand, by the selector.
const animationsOf = (rules: Rule[]) =>
  new Map(
    rules.flatMap(({ prelude, body }) =>
      declarationsOf(body)
        .filter(({ property }) => property === "animation")
        .flatMap(({ value }) => prelude.split(",").map((selector) => [selector.trim(), value.split(" ")[0]] as const))
    )
  );

describe("the catalogue's motion", () => {
  const animations = animationsOf(PLAIN);

  it("grows a card's picture into its page and back, while the rest of the screen fades", () => {
    expect(animations.get("::view-transition-old(.screen-fade)")).toBe("fade-out");
    expect(animations.get("::view-transition-new(.screen-fade)")).toBe("fade-in");
    const group = PLAIN.find(({ prelude }) => prelude === "::view-transition-group(.dinosaur-share)");
    expect(declarationsOf(group?.body ?? "")).toEqual([
      { property: "animation-duration", value: "var(--motion-screen)" },
      { property: "animation-timing-function", value: "var(--ease-out)" }
    ]);
  });

  it("slides the next dinosaur in from the right and the previous one from the left, its words after its picture", () => {
    expect(
      ["dinosaur-out", "dinosaur-in", "dinosaur-out-back", "dinosaur-in-back"].flatMap((name) =>
        [name, `${name}-late`].map((part) => animations.get(`::view-transition-${name.includes("-in") ? "new" : "old"}(.${part})`))
      )
    ).toEqual(["slide-out", "slide-out", "slide-in", "slide-in", "slide-out-back", "slide-out-back", "slide-in-back", "slide-in-back"]);
    const shift = (name: string) => {
      const frames = KEYFRAMES.find(({ prelude }) => prelude === `@keyframes ${name}`)?.body ?? "";
      return /translate: calc\((-?\d+)px/.exec(frames)?.[1];
    };
    expect(["slide-in", "slide-out", "slide-in-back", "slide-out-back"].map(shift)).toEqual(["96", "-96", "-96", "96"]);
    const late = PLAIN.find(({ prelude }) => prelude.includes("(.dinosaur-in-late)") && prelude.includes("(.dinosaur-in-back-late)") && !prelude.includes("(.dinosaur-in)"));
    expect(declarationsOf(late?.body ?? "")).toEqual([{ property: "animation-delay", value: "var(--motion-stagger)" }]);
  });

  it("fades and rises the cards in one after the other on opening the list, the first row only", () => {
    expect(animations.get(".catalogue-grid[data-rise] .catalogue-card")).toBe("rise-in");
    const rise = PLAIN.find(({ prelude }) => prelude === ".catalogue-grid[data-rise] .catalogue-card");
    expect(declarationsOf(rise?.body ?? "")).toContainEqual({ property: "animation-delay", value: "calc(var(--card) * var(--motion-stagger) * 0.75)" });
  });

  it("only cross-fades a dinosaur's picture in place with reduced motion", () => {
    expect(animationsOf(REDUCED).get("::view-transition-group(.dinosaur-share)")).toBe("none");
  });
});

describe("care's motion", () => {
  const animations = animationsOf(PLAIN);
  const delayOf = (selector: string) => declarationsOf(PLAIN.find(({ prelude }) => prelude === selector)?.body ?? "").find(({ property }) => property === "animation-delay")?.value;

  it("walks the visitor in, hops it when happy, turns it away from what it does not need, and dances it off", () => {
    expect(
      [".visitor", '.stage[data-reaction="happy"] .visitor', '.stage[data-reaction="refusal"] .visitor', ".stage[data-leaving] .visitor"].map((selector) =>
        animations.get(selector)
      )
    ).toEqual(["walk-in", "hop", "turn-away", "dance"]);
    const leaving = PLAIN.find(({ prelude }) => prelude === ".stage[data-leaving] .visitor")?.body ?? "";
    expect(leaving).toMatch(/walk-off var\(--motion-screen\)/);
  });

  it("flies the item given to the visitor, and its hearts from there to the counter", () => {
    expect([".given", ".hearts-pop", ".need-bubble", ".knock-bubble"].map((selector) => animations.get(selector))).toEqual(["fly-in", "pop-in", "pop-in", "pop-in"]);
    const hearts = PLAIN.find(({ prelude }) => prelude === ".hearts-pop")?.body ?? "";
    expect(hearts).toMatch(/fly-to-counter/);
    expect(animations.get(".hearts-count")).toBe("bump-in");
  });

  it("rings what to try in amber by fading the ring in", () => {
    expect(animations.get(".tray-item[data-suggested]::after")).toBe("fade-in");
  });

  it("fills the hearts won, and rises friends in, one after the other", () => {
    expect([".result-heart-won", ".friend-card", ".friend-face"].map((selector) => animations.get(selector))).toEqual(["pop-in", "rise-in", "rise-in"]);
    expect(delayOf(".result-heart-won")).toBe("calc(var(--heart) * var(--motion-stagger) * 1.5)");
    expect(delayOf(".friend-card")).toBe("calc(var(--card) * var(--motion-stagger) * 0.75)");
  });

  it("only fades the need asked now in with reduced motion", () => {
    const need = REDUCED.find(({ prelude }) => prelude === ".need");
    expect(declarationsOf(need?.body ?? "")).toEqual([{ property: "transition-property", value: "background-color" }]);
  });
});
