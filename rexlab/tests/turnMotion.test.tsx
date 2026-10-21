import { describe, expect, it } from "vitest";
import { TURN_PART, turnMotion, type Box, type TurnAnimation } from "../src/turnMotion.ts";

const GLIDE = 240;
const FADE = 160;
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";

type Started = TurnAnimation & { element: Element; keyframes: Keyframe[]; options: KeyframeAnimationOptions; progress: number | null; cancelled: boolean };

// The engine over a page of marked parts whose boxes the test sets: a
// part's box is where it is drawn, as the browser measures it. The
// animations it starts, its view transitions and timers only record, and
// each step is logged in order.
function harness({ reduced = false } = {}) {
  const page = document.createElement("div");
  const boxes = new Map<Element, Box>();
  const log: string[] = [];
  const animations: Started[] = [];
  const transitions: Array<() => void> = [];
  const timers: Array<{ ms: number; fire: () => void; stopped: boolean }> = [];
  const settings = { reduced };
  const motion = turnMotion({
    parts: page,
    measure: (element) => {
      log.push(`measure ${element.getAttribute(TURN_PART)}`);
      const box = boxes.get(element);
      if (!box) throw new Error(`no box for ${element.getAttribute(TURN_PART)}`);
      return box;
    },
    animate: (element, keyframes, options) => {
      const started: Started = {
        element,
        keyframes,
        options,
        progress: 0,
        cancelled: false,
        cancel: () => {
          log.push(`cancel ${element.getAttribute(TURN_PART)}`);
          started.cancelled = true;
        },
        effect: { getComputedTiming: () => ({ progress: started.progress }) }
      };
      animations.push(started);
      return started;
    },
    reducedMotion: () => settings.reduced,
    startViewTransition: (update) => {
      log.push("view transition");
      transitions.push(update);
    },
    startTimer: (ms, fire) => {
      const timer = { ms, fire, stopped: false };
      timers.push(timer);
      return () => {
        timer.stopped = true;
      };
    },
    timing: { glide: GLIDE, easing: EASE_OUT, fade: FADE }
  });
  // A part named `name` in `outer`, drawn at `box`.
  const part = (name: string, box: Box, outer: Element = page) => {
    const element = document.createElement("div");
    element.setAttribute(TURN_PART, name);
    outer.append(element);
    boxes.set(element, box);
    return element;
  };
  // A change of layout that puts each part at its box in `laidOut`.
  const layout = (laidOut: Array<[Element, Box]>) => () => {
    log.push("change");
    laidOut.forEach(([element, box]) => boxes.set(element, box));
  };
  const animationOf = (element: Element) => animations.filter((started) => started.element === element).at(-1);
  return { page, boxes, log, animations, transitions, timers, settings, motion, part, layout, animationOf };
}

const box = (left: number, top: number, width: number, height: number): Box => ({ left, top, width, height });

// What every keyframe animates: translation, a clip and opacity, never a
// scale, a transform or a laid-out size.
const animated = (animations: Started[]) => [...new Set(animations.flatMap(({ keyframes }) => keyframes.flatMap((keyframe) => Object.keys(keyframe))))].sort();

describe("the turn motion", () => {
  it("glides each shared part from where it stood to its new place, together, over 240 ms easing out, until it settles", () => {
    const motion = harness();
    const wordmark = motion.part("wordmark", box(56, 40, 120, 32));
    const greeting = motion.part("greeting", box(56, 116, 600, 48));
    const changes: boolean[] = [];
    motion.motion.subscribe(() => changes.push(motion.motion.isRunning()));

    motion.motion.apply(motion.layout([[wordmark, box(56, 40, 120, 32)], [greeting, box(40, 300, 600, 48)]]), "glide");

    expect(motion.animations.map(({ element, keyframes, options }) => [element, keyframes, options])).toEqual([
      [greeting, [{ translate: "16px -184px" }, { translate: "0px 0px" }], { duration: GLIDE, easing: EASE_OUT }]
    ]);
    expect([motion.motion.isRunning(), motion.timers.map(({ ms }) => ms)]).toEqual([true, [GLIDE]]);

    motion.timers[0]?.fire();

    expect([motion.motion.isRunning(), changes]).toEqual([false, [true, false]]);
  });

  it("shows a part's change of size as its clip moving from the old box past the new one, never scaling it", () => {
    const motion = harness();
    const card = motion.part("card", box(56, 116, 400, 500));

    motion.motion.apply(motion.layout([[card, box(56, 200, 700, 300)]]), "glide");

    expect(motion.animationOf(card)?.keyframes).toEqual([
      { translate: "0px -84px", clipPath: "inset(-64px 300px -64px -64px)" },
      { translate: "0px 0px", clipPath: "inset(-64px -64px -64px -64px)" }
    ]);
    expect(animated(motion.animations)).toEqual(["clipPath", "translate"]);
  });

  it("moves a part inside another with it, gliding only by its own move within it", () => {
    const motion = harness();
    const row = motion.part("row", box(600, 116, 500, 600));
    const tile = motion.part("tile", box(934, 116, 310, 280), row);

    motion.motion.apply(motion.layout([[row, box(56, 700, 764, 360)], [tile, box(56, 700, 310, 160)]]), "glide");

    expect(motion.animationOf(row)?.keyframes[0]).toEqual({ translate: "544px -584px", clipPath: "inset(-64px 264px -64px -64px)" });
    expect(motion.animationOf(tile)?.keyframes[0]).toEqual({ translate: "334px 0px" });
  });

  it("fades in a part only the new layout has, and leaves alone a part that stays where it was", () => {
    const motion = harness();
    const corner = motion.part("corner", box(900, 40, 200, 48));
    const footer = document.createElement("div");
    footer.setAttribute(TURN_PART, "footer");

    motion.motion.apply(() => {
      motion.page.append(footer);
      motion.boxes.set(footer, box(56, 1100, 200, 20));
    }, "glide");

    expect(motion.animations.map(({ element, keyframes, options }) => [element, keyframes, options])).toEqual([
      [footer, [{ opacity: 0 }, { opacity: 1 }], { duration: GLIDE, easing: EASE_OUT }]
    ]);
    expect(motion.animationOf(corner)).toBeUndefined();
  });

  it("lets each screen keep what it keeps: kept before the change, restored after it, before the new places are measured", () => {
    const motion = harness();
    const row = motion.part("row", box(600, 116, 500, 600));
    const stop = motion.motion.keep(() => {
      motion.log.push("keep");
      return () => motion.log.push("restore");
    });

    motion.motion.apply(motion.layout([[row, box(56, 700, 764, 360)]]), "glide");
    stop();
    motion.motion.apply(motion.layout([[row, box(600, 116, 500, 600)]]), "still");

    expect(motion.log).toEqual(["measure row", "keep", "change", "restore", "measure row", "cancel row", "change"]);
  });

  it("only fades under reduced motion: the root view transition makes the change, nothing translates or clips", () => {
    const motion = harness({ reduced: true });
    const card = motion.part("card", box(56, 116, 400, 500));
    motion.motion.keep(() => {
      motion.log.push("keep");
      return () => motion.log.push("restore");
    });

    motion.motion.apply(motion.layout([[card, box(56, 200, 700, 300)]]), "glide");

    expect([motion.log, motion.motion.isRunning()]).toEqual([["view transition"], true]);

    motion.transitions[0]?.();

    expect([motion.log, motion.animations, motion.timers.map(({ ms }) => ms)]).toEqual([["view transition", "keep", "change", "restore"], [], [FADE]]);
  });

  it("starts a further change mid-motion from where each part is drawn, measured before its animation is cancelled, and holds until the fresh motion settles", () => {
    const motion = harness();
    const card = motion.part("card", box(56, 116, 400, 500));
    const greeting = motion.part("greeting", box(56, 40, 600, 48));
    motion.motion.apply(motion.layout([[card, box(56, 200, 700, 300)]]), "glide");
    const first = motion.animationOf(card);
    if (!first) throw new Error("the card did not glide");
    // Half-way, the card is drawn 42 pixels above its place, its clip's
    // right inset at 300 + (-64 - 300) / 2 = 118 pixels.
    first.progress = 0.5;
    motion.boxes.set(card, box(56, 158, 700, 300));
    motion.log.length = 0;

    motion.motion.apply(motion.layout([[card, box(40, 100, 500, 400)], [greeting, box(40, 40, 600, 48)]]), "glide");

    expect(motion.log).toEqual(["measure card", "measure greeting", "cancel card", "change", "measure card", "measure greeting"]);
    expect(motion.animationOf(card)?.keyframes).toEqual([
      { translate: "16px 58px", clipPath: "inset(-64px -64px 100px -64px)" },
      { translate: "0px 0px", clipPath: "inset(-64px -64px -64px -64px)" }
    ]);
    expect(motion.animationOf(greeting)?.keyframes).toEqual([{ translate: "16px 0px" }, { translate: "0px 0px" }]);

    motion.timers[0]?.fire();

    expect([motion.timers.map(({ ms, stopped }) => [ms, stopped]), motion.motion.isRunning()]).toEqual([[[GLIDE, true], [GLIDE, false]], true]);

    motion.timers[1]?.fire();

    expect(motion.motion.isRunning()).toBe(false);
  });

  it("carries a part fading in on from the opacity it is drawn at when a further change cuts the fade short", () => {
    const motion = harness();
    const footer = document.createElement("div");
    footer.setAttribute(TURN_PART, "footer");
    motion.motion.apply(() => {
      motion.page.append(footer);
      motion.boxes.set(footer, box(56, 1100, 200, 20));
    }, "glide");
    const fading = motion.animationOf(footer);
    if (fading) fading.progress = 0.25;

    motion.motion.apply(motion.layout([[footer, box(56, 780, 200, 20)]]), "glide");

    expect(motion.animationOf(footer)?.keyframes).toEqual([
      { translate: "0px 320px", opacity: 0.25 },
      { translate: "0px 0px", opacity: 1 }
    ]);
  });

  it("follows a resize that keeps the layout at once, gliding only where a motion still runs", () => {
    const motion = harness();
    const row = motion.part("row", box(56, 700, 764, 360));

    motion.motion.apply(motion.layout([[row, box(56, 700, 656, 360)]]), "follow");

    expect([motion.log, motion.animations, motion.timers, motion.motion.isRunning()]).toEqual([["change"], [], [], false]);

    motion.motion.apply(motion.layout([[row, box(600, 116, 500, 600)]]), "glide");
    // As it starts, the row is drawn where it stood, its clip's bottom
    // inset 240 pixels.
    motion.boxes.set(row, box(56, 700, 500, 600));
    motion.motion.apply(motion.layout([[row, box(560, 116, 540, 560)]]), "follow");

    expect(motion.animations.map(({ keyframes, cancelled }) => [keyframes[0], cancelled])).toEqual([
      [{ translate: "-544px 584px", clipPath: "inset(-64px -64px 240px -64px)" }, true],
      [{ translate: "-504px 584px", clipPath: "inset(-64px 40px 200px -64px)" }, false]
    ]);
    expect(motion.timers.map(({ ms, stopped }) => [ms, stopped])).toEqual([[GLIDE, true], [GLIDE, false]]);
  });

  it("stops a running motion with every part at rest where nothing is to glide", () => {
    const motion = harness();
    const card = motion.part("card", box(56, 116, 400, 500));
    const changes: boolean[] = [];
    motion.motion.subscribe(() => changes.push(motion.motion.isRunning()));
    motion.motion.apply(motion.layout([[card, box(56, 200, 700, 300)]]), "glide");

    motion.motion.apply(motion.layout([[card, box(0, 0, 393, 852)]]), "still");

    expect([motion.animations.map(({ cancelled }) => cancelled), motion.timers.map(({ stopped }) => stopped), changes]).toEqual([[true], [true], [true, false]]);
  });

  it("fades again under reduced motion when the window changes during the fade, and holds until the last fade settles", () => {
    const motion = harness({ reduced: true });
    motion.part("card", box(56, 116, 400, 500));
    motion.motion.apply(() => {}, "glide");

    motion.motion.apply(() => {}, "glide");
    motion.motion.apply(() => motion.log.push("resize"), "follow");

    expect([motion.log, motion.timers.map(({ ms, stopped }) => [ms, stopped])]).toEqual([["view transition", "view transition", "resize"], [[FADE, true], [FADE, false]]]);

    motion.timers[1]?.fire();

    expect(motion.motion.isRunning()).toBe(false);
  });

  it("fades a glide still running when reduced motion comes on, cutting it short only as the view transition updates", () => {
    const motion = harness();
    const card = motion.part("card", box(56, 116, 400, 500));
    motion.motion.apply(motion.layout([[card, box(56, 200, 700, 300)]]), "glide");
    motion.settings.reduced = true;
    motion.log.length = 0;

    motion.motion.apply(motion.layout([[card, box(56, 116, 400, 500)]]), "glide");

    expect(motion.log).toEqual(["view transition"]);

    motion.transitions[0]?.();

    expect([motion.log, motion.animations.length]).toEqual([["view transition", "cancel card", "change"], 1]);
  });

  it("moves parts by translation, a clip and opacity alone, never scaling a word or a picture", () => {
    const motion = harness();
    const row = motion.part("row", box(600, 116, 500, 600));
    const tile = motion.part("tile", box(934, 116, 310, 280), row);
    const card = motion.part("card", box(56, 116, 520, 600));

    motion.motion.apply(motion.layout([[row, box(56, 700, 764, 360)], [tile, box(56, 700, 290, 160)], [card, box(56, 200, 708, 476)]]), "glide");
    motion.animations.forEach((started) => {
      started.progress = 0.5;
    });
    motion.motion.apply(motion.layout([[row, box(600, 116, 500, 600)], [tile, box(934, 116, 310, 280)], [card, box(56, 116, 520, 600)]]), "glide");

    expect(motion.animations.map(({ element }) => element)).toEqual([row, tile, card, row, tile, card]);
    expect(animated(motion.animations)).toEqual(["clipPath", "translate"]);
    expect(motion.animations.flatMap(({ keyframes }) => keyframes).filter((keyframe) => "scale" in keyframe || "transform" in keyframe)).toEqual([]);
  });
});
