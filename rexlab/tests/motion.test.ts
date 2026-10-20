import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MENU_EXIT } from "../src/ParentMenu.tsx";

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
const MOVING = /\b(transform|translate|rotate|scale|height|width)\b/;

// A rule's declarations, by property.
const declared = (rules: Rule[], selector: string) =>
  Object.fromEntries(declarationsOf(rules.find(({ prelude }) => prelude === selector)?.body ?? "").map(({ property, value }) => [property, value]));

describe("the motion", () => {
  it("fades the portrait gate in and out with the screen token, including the short reduced-motion fade", () => {
    expect(declared(PLAIN, ".orientation-gate").transition).toBe("opacity var(--motion-screen) var(--ease-out), visibility var(--motion-screen) var(--ease-out)");
    expect(declared(PLAIN, ".orientation-gate[data-shown]").animation).toBe("fade-in var(--motion-screen) var(--ease-out) both");
    expect(tokensOf(PLAIN)["--motion-screen"]).toBe("320ms");
    expect(tokensOf(REDUCED)["--motion-screen"]).toBe("160ms");
  });

  it("is built from the shared tokens", () => {
    expect(tokensOf(PLAIN)).toEqual({
      "--ease-out": "cubic-bezier(0.22, 1, 0.36, 1)",
      "--ease-overshoot": "cubic-bezier(0.34, 1.56, 0.64, 1)",
      "--motion-small": "160ms",
      "--motion-standard": "240ms",
      "--motion-screen": "320ms",
      "--motion-count": "600ms",
      "--motion-stagger": "40ms",
      "--motion-picture": "200ms",
      "--motion-shimmer": "1500ms",
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

  it("has reduced motion win over the rules it overrides: none of them comes after it to undo it", () => {
    const reducedAt = RULES.findIndex(({ prelude }) => prelude === "@media (prefers-reduced-motion: reduce)");
    const overridden = new Set(REDUCED.map(({ prelude }) => prelude));
    const later = RULES.slice(reducedAt + 1)
      .filter(({ prelude }) => overridden.has(prelude))
      .map(({ prelude }) => prelude);

    expect(RULES.filter(({ prelude }) => prelude === "@media (prefers-reduced-motion: reduce)")).toHaveLength(1);
    expect(later).toEqual([]);
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

describe("the home page's motion", () => {
  it("fades and lifts the large card in as a screen comes in, and only fades it with reduced motion", () => {
    const card = PLAIN.filter(({ prelude }) => prelude === ".featured-card").flatMap(({ body }) => declarationsOf(body));
    expect(card.filter(({ property }) => property === "animation").map(({ value }) => value)).toEqual(["rise-in var(--motion-screen) var(--ease-out) both"]);
    // rise-in lifts by --motion-amount, which reduced motion sets to 0.
    expect(animationsOf(REDUCED).has(".featured-card")).toBe(false);
  });
});

// The quiz and the sorting game end on the same result.
describe("the result's motion", () => {
  const animations = animationsOf(PLAIN);
  const bodyOf = (selector: string) => PLAIN.find(({ prelude }) => prelude === selector)?.body ?? "";

  it("counts the score up, pops the celebration in, and pops the won stars in one after the other", () => {
    expect([".result-score-value", ".celebration", ".star-won"].map((selector) => animations.get(selector))).toEqual(["count-up", "pop-in", "pop-in"]);
    expect(declarationsOf(bodyOf(".star-won"))).toContainEqual({ property: "animation-delay", value: "calc(var(--star) * var(--motion-stagger) * 1.5)" });
  });
});

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

  it("moves the visitor's place, never its picture, so the picture's shimmer and fade play inside", () => {
    expect(RULES.filter(({ body, prelude }) => /(^|[^-])visitor-picture/.test(prelude + body)).map(({ prelude }) => prelude)).toEqual([".visitor-picture"]);
    expect(declarationsOf(PLAIN.find(({ prelude }) => prelude === ".visitor-picture")?.body ?? "").map(({ property }) => property)).toEqual(["display", "width", "height", "object-fit"]);
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

describe("find the pair's motion", () => {
  // Every animation of a rule's `animation` shorthand, by name, with the
  // rest of its value.
  const runs = (selector: string) =>
    new Map(
      declarationsOf(PLAIN.find(({ prelude }) => prelude === selector)?.body ?? "")
        .filter(({ property }) => property === "animation")
        .flatMap(({ value }) => value.split(/,\s*(?![^()]*\))/))
        .map((run) => run.trim().split(/\s+(.*)/s))
        .map(([name = "", rest = ""]) => [name, rest] as const)
    );

  it("rises the cards in one after the other, and flips each side in as it is turned to", () => {
    expect(runs(".pair-card")).toEqual(new Map([["rise-in", "var(--motion-standard) var(--ease-out) calc(var(--card) * var(--motion-stagger)) both"]]));
    expect(runs(".pair-card-back,\n.pair-card-face")).toEqual(new Map([["flip-in", "var(--motion-standard) var(--ease-out) both"]]));
  });

  it("bounces a found pair once it has flipped, without flipping it again", () => {
    expect(runs('.pair-card[data-state="found"] .pair-card-face')).toEqual(
      new Map([
        ["flip-in", "var(--motion-standard) var(--ease-out) both"],
        ["bounce", "var(--motion-screen) var(--ease-overshoot) var(--motion-standard)"]
      ])
    );
  });

  it("waves every card, one after the other, after the last flip, without rising them in again", () => {
    expect(runs(".pair-board[data-finished] .pair-card")).toEqual(
      new Map([
        ["rise-in", "var(--motion-standard) var(--ease-out) calc(var(--card) * var(--motion-stagger)) both"],
        ["wave", "var(--motion-screen) var(--ease-out) calc(var(--motion-standard) + var(--card) * var(--motion-stagger))"]
      ])
    );
  });

  it("slides the level switch's mark to the chosen level and fades its fill in, and only fades the fill with reduced motion", () => {
    expect(declared(PLAIN, ".level-switch-mark").transition).toBe("translate var(--motion-standard) var(--ease-out)");
    expect(declared(PLAIN, ".level-switch-level").transition).toBe("color var(--motion-standard) var(--ease-out),\n    background-color var(--motion-standard) var(--ease-out)");
    expect(declared(REDUCED, ".level-switch-mark")).toEqual({ visibility: "hidden", "transition-property": "none" });
  });

  it("folds the climb level in and out beside the stars, and only fades it with reduced motion", () => {
    expect(declared(PLAIN, ".pairs-climb").transition).toBe(
      "grid-template-columns var(--motion-standard) var(--ease-out),\n    margin-right var(--motion-standard) var(--ease-out),\n    opacity var(--motion-standard) var(--ease-out)"
    );
    expect(declared(PLAIN, ".pairs-climb[data-shown]")).toEqual({ "grid-template-columns": "1fr", "margin-right": "0", opacity: "1" });
    expect(declared(REDUCED, ".pairs-climb")).toEqual({ "transition-property": "opacity" });
  });

  it("bumps a new count of tries in, and pops the result's NEW badges and star", () => {
    const animations = animationsOf(PLAIN);
    expect([".pairs-tries", ".pairs-new-badge", ".pairs-result-star", ".pairs-level-up", ".pairs-found-card"].map((selector) => animations.get(selector))).toEqual([
      "bump-in",
      "pop-in",
      "pop-in",
      "pop-in",
      "rise-in"
    ]);
  });

  it("brightens and presses the SORT card in as every card does, with motion or without: none of its own rules moves it otherwise", () => {
    const rules = [...PLAIN, ...REDUCED].filter(({ prelude }) => prelude.includes("sort-tile"));
    const moving = rules.flatMap(({ prelude, body }) =>
      declarationsOf(body)
        .filter(({ property }) => /^(animation|transition)(-|$)|^(filter|transform|translate|scale)$/.test(property))
        .map(({ property }) => `${prelude} ${property}`)
    );

    expect(rules.length).toBeGreaterThan(0);
    expect(moving).toEqual([]);
  });
});

describe("the sorting board's motion", () => {
  const animations = animationsOf(PLAIN);
  const bodyOf = (selector: string, rules = PLAIN) => rules.find(({ prelude }) => prelude === selector)?.body ?? "";

  it("rises the cards in one after the other, then the baskets", () => {
    expect([".sort-card", ".basket"].map((selector) => animations.get(selector))).toEqual(["rise-in", "rise-in"]);
    expect(bodyOf(".sort-card")).toMatch(/rise-in var\(--motion-standard\) var\(--ease-out\) calc\(var\(--slot\) \* var\(--motion-stagger\)\)/);
    expect(bodyOf(".basket")).toMatch(/calc\(\(var\(--basket\) \+ 6\) \* var\(--motion-stagger\)\)/);
  });

  it("lifts a picked card by the motion amount, follows the finger at once while dragging, and slides a card let go back to its slot", () => {
    expect(declarationsOf(bodyOf(".sort-card[data-picked]"))).toEqual([
      { property: "translate", value: "0 calc(-12px * var(--motion-amount))" },
      { property: "rotate", value: "calc(3deg * var(--motion-amount))" }
    ]);
    expect(declarationsOf(bodyOf(".sort-card[data-dragging]"))).toContainEqual({ property: "transition", value: "none" });
    expect(animations.get(".sort-card[data-returning]")).toBe("slide-back");
    const back = KEYFRAMES.find(({ prelude }) => prelude === "@keyframes slide-back")?.body ?? "";
    expect(back).toMatch(/translate: calc\(var\(--from-x\) \* var\(--motion-amount\)\) calc\(var\(--from-y\) \* var\(--motion-amount\)\)/);
  });

  it("pops a sorted card into its basket and stamps its tick in after it", () => {
    expect([".sorted-card", ".sorted-check", ".sort-hint"].map((selector) => animations.get(selector))).toEqual(["pop-in", "stamp-in", "pop-in"]);
    expect(bodyOf(".sorted-check")).toMatch(/var\(--motion-stagger\) both/);
  });

  it("glows the right basket of a wrong drop for a moment, in and out again", () => {
    expect(animations.get(".basket-glow")).toBe("glow");
    expect(declarationsOf(bodyOf(".basket-glow"))).toContainEqual({ property: "opacity", value: "0" });
  });

  it("only fades and lights a card with reduced motion: it does not travel", () => {
    expect(declarationsOf(bodyOf(".sort-card", REDUCED))).toEqual([{ property: "transition-property", value: "filter, opacity, box-shadow, outline" }]);
  });
});

describe("the skeleton puzzle's motion", () => {
  const animations = animationsOf(PLAIN);

  it("lifts a piece in, floats one let go back to the tray and slides one that fits into its slot, each from where it was let go", () => {
    expect([".skeleton-lifted", ".skeleton-piece[data-returning]", ".skeleton-fitted[data-snapped]"].map((selector) => animations.get(selector))).toEqual([
      "grow-in",
      "settle-in",
      "settle-in"
    ]);
    const settle = KEYFRAMES.find(({ prelude }) => prelude === "@keyframes settle-in")?.body ?? "";
    expect(settle).toMatch(/translate: calc\(var\(--from-x\) \* var\(--motion-amount\)\) calc\(var\(--from-y\) \* var\(--motion-amount\)\)/);
    // With reduced motion the piece only fades in where it ends.
    expect(settle).toMatch(/opacity: calc\(1 - 0\.6 \* \(1 - var\(--motion-amount\)\)\)/);
  });

  it("fades help's glow in", () => {
    expect(animations.get(".skeleton-glow")).toBe("fade-in");
  });

  // skeleton-assembly-badges.feature: the reveal's earned badge rises in.
  it("rises the earned badge in on the reveal", () => {
    expect(animations.get(".skeleton-badge-earned")).toBe("rise-in");
  });

  // skeleton-assembly-turning.feature: a tapped piece turns in its spot,
  // and shows turned at once with reduced motion.
  it("turns a tapped piece a quarter, and only at once with reduced motion", () => {
    expect(declared(PLAIN, ".skeleton-tray[data-turning] .skeleton-piece").transition).toBe("rotate var(--motion-standard) var(--ease-out)");
    expect(declared(REDUCED, ".skeleton-tray[data-turning] .skeleton-piece")).toEqual({ "transition-property": "none" });
  });

  // skeleton-assembly-paleontologist.feature: the line saying whose
  // another dinosaur's bone is rises in, as a spot in the tray does.
  it("rises the line saying whose bone it is in", () => {
    expect([animations.get(".skeleton-told-line"), animations.get(".skeleton-tray-spot")]).toEqual(["rise-in", "rise-in"]);
  });

  // skeleton-assembly-help-ladder.feature: the ladder's region and ghost
  // fade in, and its last step moves the piece part of the way towards
  // its home and back once, or with reduced motion fades it out and back.
  it("fades the ladder's region and ghost in, and moves its piece towards its home and back, fading instead with reduced motion", () => {
    expect([".skeleton-region", ".skeleton-ghost", ".skeleton-piece[data-nudge]"].map((selector) => animations.get(selector))).toEqual(["fade-in", "fade-in", "nudge"]);
    expect(PLAIN.find(({ prelude }) => prelude === ".skeleton-piece[data-nudge]")?.body ?? "").toMatch(/nudge calc\(var\(--motion-screen\) \* 3\) var\(--ease-out\) both/);
    const nudge = rulesOf(KEYFRAMES.find(({ prelude }) => prelude === "@keyframes nudge")?.body ?? "").map(({ prelude, body: frame }) => [prelude, declarationsOf(frame)]);
    expect(nudge).toEqual([
      [
        "50%",
        [
          { property: "opacity", value: "calc(1 - 0.7 * (1 - var(--motion-amount)))" },
          { property: "translate", value: "calc(var(--nudge-x) * 0.6 * var(--motion-amount)) calc(var(--nudge-y) * 0.6 * var(--motion-amount))" }
        ]
      ]
    ]);
  });

  it("scatters a knocked-down skeleton's bones from their homes to the tray one after the other, each spinning on its way, its spots already there", () => {
    expect(animations.get(".skeleton-piece[data-scattering]")).toBe("scatter");
    const body = PLAIN.find(({ prelude }) => prelude === ".skeleton-piece[data-scattering]")?.body ?? "";
    expect(body).toMatch(/scatter var\(--motion-screen\) var\(--ease-overshoot\) calc\(var\(--motion-screen\) \+ var\(--piece\) \* var\(--motion-stagger\)\) both/);
    expect(animations.get(".skeleton-tray[data-scatter] .skeleton-tray-spot")).toBe("none");
    const scatter = rulesOf(KEYFRAMES.find(({ prelude }) => prelude === "@keyframes scatter")?.body ?? "").map(({ prelude, body: frame }) => [prelude, declarationsOf(frame)]);
    expect(scatter).toEqual([
      [
        "from",
        [
          { property: "opacity", value: "calc(1 - 0.6 * (1 - var(--motion-amount)))" },
          { property: "translate", value: "calc(var(--from-x) * var(--motion-amount)) calc(var(--from-y) * var(--motion-amount))" },
          { property: "scale", value: "calc(1 + (var(--from-scale) - 1) * var(--motion-amount))" }
        ]
      ],
      ["50%", [{ property: "rotate", value: "calc((var(--piece) - 1.5) * 16deg * var(--motion-amount))" }]]
    ]);
  });
});

describe("the skeleton museum's motion", () => {
  const animations = animationsOf(PLAIN);
  const bodyOf = (selector: string) => PLAIN.find(({ prelude }) => prelude === selector)?.body ?? "";

  it("rises the stands in one after the other, and pops each star in after its stand", () => {
    expect([".skeleton-stand", ".skeleton-stand-star"].map((selector) => animations.get(selector))).toEqual(["rise-in", "pop-in"]);
    expect(bodyOf(".skeleton-stand")).toMatch(/calc\(var\(--stand\) \* var\(--motion-stagger\)\) both/);
    expect(bodyOf(".skeleton-stand-star")).toMatch(/calc\(var\(--motion-stagger\) \* \(var\(--stand\) \+ 2\)\) both/);
  });
});

describe("the skeleton reveal's motion", () => {
  const animations = animationsOf(PLAIN);
  const bodyOf = (selector: string) => PLAIN.find(({ prelude }) => prelude === selector)?.body ?? "";

  it("holds the whole skeleton through the screen change, then fades the body in over it as the bones fade back", () => {
    expect([".skeleton-reveal-bones", ".picture.skeleton-reveal-body"].map((selector) => animations.get(selector))).toEqual(["fade-back", "fade-in"]);
    for (const selector of [".skeleton-reveal-bones", ".picture.skeleton-reveal-body"]) {
      expect(bodyOf(selector)).toMatch(/calc\(var\(--motion-screen\) \* 2\) var\(--ease-out\) var\(--motion-screen\) both/);
    }
    const back = KEYFRAMES.find(({ prelude }) => prelude === "@keyframes fade-back")?.body ?? "";
    expect(rulesOf(back).flatMap(({ body }) => declarationsOf(body))).toEqual([{ property: "opacity", value: "1" }]);
    expect(declarationsOf(bodyOf(".skeleton-reveal-bones"))).toContainEqual({ property: "opacity", value: "0.25" });
  });

  it("keeps a skeleton whose body cannot be shown whole and still", () => {
    expect(declarationsOf(bodyOf(".skeleton-reveal-bones[data-alone]"))).toEqual([
      { property: "opacity", value: "1" },
      { property: "animation", value: "none" }
    ]);
  });

  it("rises the reward in, pops a new star in once the body has faded in, and pops a built dinosaur's star onto its card", () => {
    expect([".skeleton-reward", ".skeleton-star[data-new]", ".skeleton-choice-star"].map((selector) => animations.get(selector))).toEqual([
      "rise-in",
      "pop-in",
      "pop-in"
    ]);
    expect(bodyOf(".skeleton-star[data-new]")).toMatch(/calc\(var\(--motion-screen\) \* 2\) both/);
  });
});

// The language, theme and age level menus share one look and motion.
describe("the parents' menus' motion", () => {
  const animationOf = (rules: Rule[], selector: string) =>
    declarationsOf(rules.find(({ prelude }) => prelude === selector)?.body ?? "").find(({ property }) => property === "animation")?.value;

  it("grows a menu in and shrinks it out, however it closes, and grows the button's new face in, all at the small motion", () => {
    expect([".parent-menu-list", ".parent-menu-list[data-leaving]", ".parent-menu-face[data-changed]"].map((selector) => animationOf(PLAIN, selector))).toEqual([
      "grow-in var(--motion-small) var(--ease-out) both",
      "shrink-out var(--motion-small) var(--ease-out) both",
      "grow-in var(--motion-small) var(--ease-out) both"
    ]);
    // A leaving menu stays until its animation ends, as long as the small
    // motion lasts with or without reduced motion; it fades alone there.
    expect(`${MENU_EXIT}ms`).toBe(tokensOf(PLAIN)["--motion-small"]);
    expect(tokensOf(REDUCED)["--motion-small"]).toBeUndefined();
    const shrink = rulesOf(KEYFRAMES.find(({ prelude }) => prelude === "@keyframes shrink-out")?.body ?? "");
    expect(shrink.map(({ prelude, body }) => [prelude, declarationsOf(body)])).toEqual([
      [
        "to",
        [
          { property: "opacity", value: "0" },
          { property: "scale", value: "calc(1 - 0.08 * var(--motion-amount))" }
        ]
      ]
    ]);
    expect([...animationsOf(REDUCED).keys()].filter((selector) => selector.startsWith(".parent-menu"))).toEqual([]);
  });
});

// pictures.feature: a loading picture's place pulses in the theme's
// colours, and its picture fades in as it arrives.
describe("a picture's place", () => {
  const bodyOf = (selector: string) => declarationsOf(PLAIN.find(({ prelude }) => prelude === selector)?.body ?? "");
  const shimmer = rulesOf(KEYFRAMES.find(({ prelude }) => prelude === "@keyframes picture-shimmer")?.body ?? "");

  it("pulses to the lighter colour and back every 1.5 seconds, standing on the first where there is no motion", () => {
    expect(tokensOf(PLAIN)["--motion-shimmer"]).toBe("1500ms");
    expect(bodyOf('.picture[data-picture="loading"]')).toEqual([
      { property: "--shimmer-from", value: "#e6e2d9" },
      { property: "--shimmer-to", value: "#fffdf8" },
      { property: "background-color", value: "var(--shimmer-from)" },
      { property: "animation", value: "picture-shimmer var(--motion-shimmer) var(--ease-out) infinite" }
    ]);
    expect(shimmer.map(({ prelude, body }) => [prelude, declarationsOf(body)])).toEqual([
      ["50%", [{ property: "background-color", value: "color-mix(in srgb, var(--shimmer-to) calc(var(--motion-amount) * 100%), var(--shimmer-from))" }]]
    ]);
  });

  it("pulses in the dark theme's colours", () => {
    expect(bodyOf('[data-theme="dark"] .picture[data-picture="loading"]')).toEqual([
      { property: "--shimmer-from", value: "#222a3d" },
      { property: "--shimmer-to", value: "#181e2e" }
    ]);
  });

  it("fades its picture in over 200 ms, with reduced motion too", () => {
    expect(tokensOf(PLAIN)["--motion-picture"]).toBe("200ms");
    expect(tokensOf(REDUCED)["--motion-picture"]).toBeUndefined();
    expect(bodyOf('.picture[data-picture="appearing"]')).toEqual([{ property: "animation", value: "fade-in var(--motion-picture) var(--ease-out) both" }]);
    expect(REDUCED.filter(({ prelude }) => prelude.includes(".picture"))).toEqual([]);
    const fade = rulesOf(KEYFRAMES.find(({ prelude }) => prelude === "@keyframes fade-in")?.body ?? "");
    expect(fade.map(({ prelude, body }) => [prelude, declarationsOf(body)])).toEqual([["from", [{ property: "opacity", value: "0" }]]]);
  });

  it("is silhouetted on MORE COMING only once its picture shows, its shimmer and failure look keeping their colours", () => {
    const silhouettes = PLAIN.filter(({ prelude, body }) => prelude.includes("more-coming-picture") && declarationsOf(body).some(({ property }) => property === "filter"));
    expect(silhouettes.map(({ prelude }) => prelude.split(",\n"))).toEqual([
      ['.more-coming-picture[data-picture="appearing"]', '.more-coming-picture[data-picture="shown"]'],
      ['[data-theme="dark"] .more-coming-picture[data-picture="appearing"]', '[data-theme="dark"] .more-coming-picture[data-picture="shown"]']
    ]);
  });

  it("fades a pair card's name out over the picture's fade-in", () => {
    expect(bodyOf(".pair-card-name[data-fading]")).toEqual([{ property: "animation", value: "fade-out var(--motion-picture) var(--ease-out) forwards" }]);
  });

  it("is silhouetted on a pair's card only once its picture shows, its shimmer and failure look keeping their colours", () => {
    const silhouettes = PLAIN.filter(({ prelude, body }) => prelude.includes("pair-silhouette") && declarationsOf(body).some(({ property }) => property === "filter"));
    expect(silhouettes.map(({ prelude }) => prelude.split(",\n"))).toEqual([
      ['.pair-silhouette[data-picture="appearing"]', '.pair-silhouette[data-picture="shown"]'],
      ['[data-theme="dark"] .pair-silhouette[data-picture="appearing"]', '[data-theme="dark"] .pair-silhouette[data-picture="shown"]']
    ]);
  });

  it("draws footprints on what holds it once failed, in each theme's soft ink, and never its name", () => {
    const failed = bodyOf('.picture[data-picture="failed"]').map(({ value }) => value).join("");
    const dark = bodyOf('[data-theme="dark"] .picture[data-picture="failed"]').map(({ value }) => value).join("");
    expect([failed, dark]).toEqual([expect.stringMatching(/^url\("data:image\/svg\+xml,.*stroke='%235c647a'.*"\) center \/ clamp\(32px, 30%, 96px\) no-repeat$/), expect.stringMatching(/^url\(.*stroke='%239ca3b6'.*\)$/)]);
    expect(failed.replace("%235c647a", "")).toBe(dark.replace("%239ca3b6", "") + " center / clamp(32px, 30%, 96px) no-repeat");
    expect(bodyOf('.picture[data-picture="loading"],\n.picture[data-picture="failed"]')).toEqual([{ property: "color", value: "transparent" }]);
  });
});


describe("the level offer's motion", () => {
  const animation = (rules: Rule[], selector: string) => rules
    .filter(({ prelude }) => prelude.split(",").map((part) => part.trim()).includes(selector))
    .flatMap(({ body }) => declarationsOf(body))
    .find(({ property }) => property === "animation")?.value;

  it("rises over a fading scrim and fades away with the shared tokens", () => {
    expect(animation(PLAIN, ".pairs-offer")).toBe("rise-in var(--motion-screen) var(--ease-out) both");
    expect(animation(PLAIN, ".pairs-offer-scrim")).toBe("fade-in var(--motion-screen) var(--ease-out) both");
    expect(animation(PLAIN, ".pairs-offer-scrim[data-leaving]")).toBe("fade-out var(--motion-small) var(--ease-out) both");
  });

  it("uses only short fades on arrival and dismissal under reduced motion", () => {
    for (const selector of [".pairs-offer", ".pairs-offer-scrim"]) {
      expect(animation(REDUCED, selector)).toBe("fade-in var(--motion-small) var(--ease-out) both");
    }
    expect(animation(REDUCED, ".pairs-offer-scrim[data-leaving]")).toBe("fade-out var(--motion-small) var(--ease-out) both");
  });
});
