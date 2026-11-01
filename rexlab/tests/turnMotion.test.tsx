import { describe, expect, it } from "vitest";
import { TURN_FADE, TURN_PART, turnMotion, type Box, type PartShift, type TurnAnimation } from "../src/turnMotion.ts";

const GLIDE = 240;
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";

type Started = TurnAnimation & { element: Element; keyframes: Keyframe[]; options: KeyframeAnimationOptions; progress: number | null; cancelled: boolean };

// The engine over a page of marked parts whose boxes the test sets: a
// part's box is where the page lays it out now, and draws it, its own
// animations included. A part `framed` paints a frame, drawn as a box of
// its own. The page's own animations run on an element until finished,
// each part drawn at the opacity the test sets. The animations it starts,
// its frames, view transitions, timers and frames asked for only record,
// and each step is logged in order. A screen transition draws the parts
// `shifts` holds off their places until the engine takes them; a part
// `refitted` is drawn as a copy, a box of its own, as its size changes.
function harness({ reduced = false } = {}) {
  const page = document.createElement("div");
  const boxes = new Map<Element, Box>();
  const framed = new Set<Element>();
  const log: string[] = [];
  const animations: Started[] = [];
  // Each frame drawn, with how many animations had started by then.
  const frames: Array<{ part: Element; element: Element; box: Box; removed: boolean; started: number }> = [];
  const extended = new Map<Element, { right: number; bottom: number }>();
  const transitions: Array<{ update: () => void; finished: () => void }> = [];
  const timers: Array<{ ms: number; fire: () => void; stopped: boolean }> = [];
  const playing = new Map<Element, { finished: boolean }>();
  const opacities = new Map<Element, number>();
  const paints: Array<{ fire: () => void; stopped: boolean }> = [];
  const shifts: PartShift[] = [];
  const refitted = new Set<Element>();
  const copies: Array<{ part: Element; element: Element; box: Box; removed: boolean }> = [];
  const settings = { reduced };
  const nameOf = (element: Element) => {
    if (element === page) return "page";
    const copy = copies.find((copy) => copy.element === element);
    if (copy) return `copy of ${copy.part.getAttribute(TURN_PART)}`;
    return element.getAttribute(TURN_PART) ?? (element.hasAttribute(TURN_FADE) ? "fade" : `frame of ${frames.find((frame) => frame.element === element)?.part.getAttribute(TURN_PART)}`);
  };
  const motion = turnMotion({
    parts: page,
    measure: (element) => {
      log.push(`measure ${nameOf(element)}`);
      const box = boxes.get(element);
      if (!box) throw new Error(`no box for ${nameOf(element)}`);
      return box;
    },
    frame: (element, box) => {
      if (!framed.has(element)) return undefined;
      log.push(`frame ${nameOf(element)}`);
      const frame = { part: element, element: document.createElement("div"), box, removed: false, started: animations.length };
      frames.push(frame);
      return {
        element: frame.element,
        remove: () => {
          log.push(`unframe ${nameOf(element)}`);
          frame.removed = true;
        }
      };
    },
    extend: (element, right, bottom) => {
      log.push(`extend ${nameOf(element)}`);
      extended.set(element, { right, bottom });
      return () => {
        log.push(`unextend ${nameOf(element)}`);
        extended.delete(element);
      };
    },
    animate: (element, keyframes, options) => {
      const started: Started = {
        element,
        keyframes,
        options,
        progress: 0,
        cancelled: false,
        cancel: () => {
          log.push(`cancel ${nameOf(element)}`);
          started.cancelled = true;
        },
        effect: { getComputedTiming: () => ({ progress: started.progress }) }
      };
      animations.push(started);
      return started;
    },
    animations: (element) => {
      const own = playing.get(element);
      if (!own || own.finished) return [];
      return [
        {
          finish: () => {
            log.push(`finish ${nameOf(element)}`);
            own.finished = true;
          }
        }
      ];
    },
    opacity: (element) => opacities.get(element) ?? 1,
    nextFrame: (fire) => {
      const paint = { fire, stopped: false };
      paints.push(paint);
      return () => {
        paint.stopped = true;
      };
    },
    reducedMotion: () => settings.reduced,
    startViewTransition: (update, finished) => {
      log.push("view transition");
      transitions.push({ update, finished });
    },
    startTimer: (ms, fire) => {
      const timer = { ms, fire, stopped: false };
      timers.push(timer);
      return () => {
        timer.stopped = true;
      };
    },
    timing: { glide: GLIDE, easing: EASE_OUT },
    shifted: () => shifts.splice(0),
    refit: (element, box) => {
      if (!refitted.has(element)) return undefined;
      log.push(`refit ${nameOf(element)}`);
      const copy = { part: element, element: document.createElement("img"), box, removed: false };
      copies.push(copy);
      return {
        element: copy.element,
        remove: () => {
          log.push(`unrefit ${nameOf(element)}`);
          copy.removed = true;
        }
      };
    }
  });
  // A part named `name` in `outer`, laid out at `box`.
  const part = (name: string, box: Box, { outer = page as Element, frame = false } = {}) => {
    const element = document.createElement("div");
    element.setAttribute(TURN_PART, name);
    outer.append(element);
    boxes.set(element, box);
    if (frame) framed.add(element);
    return element;
  };
  // An element the page marks to fade in where each layout puts it.
  const fading = () => {
    const element = document.createElement("div");
    element.setAttribute(TURN_FADE, "");
    page.append(element);
    return element;
  };
  // The page as first drawn, its parts measured where they stand.
  const drawn = () => {
    motion.redrawn();
    log.length = 0;
  };
  // A change of layout that puts each part at its box in `laidOut`.
  const layout = (laidOut: Array<[Element, Box]>) => () => {
    log.push("change");
    laidOut.forEach(([element, box]) => boxes.set(element, box));
  };
  // An animation of the page's own starts on `element`, which draws it at
  // `opacity`.
  const play = (element: Element, opacity = 1) => {
    const own = { finished: false };
    playing.set(element, own);
    opacities.set(element, opacity);
    return own;
  };
  // The frames asked for and not called off nor drawn yet.
  const waiting = () => paints.filter(({ stopped }) => !stopped);
  // The browser draws a frame, calling first what waits for it.
  const paint = () =>
    waiting().forEach((frame) => {
      frame.stopped = true;
      frame.fire();
    });
  const animationOf = (element: Element) => animations.filter((started) => started.element === element).at(-1);
  const running = (element: Element) => animations.filter((started) => started.element === element && !started.cancelled).at(-1);
  const frameOf = (element: Element) => frames.filter((frame) => frame.part === element && !frame.removed).at(-1);
  // A keeper that logs each step.
  const keeper = () => ({
    hold: () => {
      log.push("hold");
      return () => log.push("restore");
    },
    rest: () => log.push("rest")
  });
  // What the page shows of `element`, `progress` of the way through its
  // glide: its box, as far as its clip lets it show, or its frame, which
  // it is drawn over.
  const visible = (element: Element, progress: number): Box => {
    const at = (from: number, to: number) => from + (to - from) * progress;
    const offset = (keyframe: Keyframe | undefined) => String(keyframe?.translate ?? "0px 0px").split(" ").map(Number.parseFloat);
    const insets = (keyframe: Keyframe | undefined) => (/inset\((.*)\)/.exec(String(keyframe?.clipPath ?? "")) ?? ["", "0px 0px 0px 0px"])[1]!.split(" ").map(Number.parseFloat);
    const box = boxes.get(element)!;
    const animation = running(element);
    const [start, end] = animation?.keyframes ?? [];
    const [x0 = 0, y0 = 0] = offset(start);
    const left = box.left + at(x0, 0);
    const top = box.top + at(y0, 0);
    const { right = 0, bottom = 0 } = extended.get(element) ?? {};
    const [, right0 = 0, bottom0 = 0] = insets(start);
    const [, right1 = 0, bottom1 = 0] = insets(end);
    const shown = { left, top, width: box.width + right - at(right0, right1), height: box.height + bottom - at(bottom0, bottom1) };
    const frame = frameOf(element);
    const frameAnimation = frame && animations.find((started) => started.element === frame.element);
    if (!frame || !frameAnimation) return shown;
    const [from, to] = frameAnimation.keyframes;
    const width = at(Number.parseFloat(String(from?.width)), Number.parseFloat(String(to?.width)));
    const height = at(Number.parseFloat(String(from?.height)), Number.parseFloat(String(to?.height)));
    return { left, top, width: Math.max(shown.width, width), height: Math.max(shown.height, height) };
  };
  // What the page shows of `element` now: as `visible` has it, as far
  // as its own glide has gone, moved too by the glide of each part
  // around it, as far as that has gone.
  const drawnAt = (element: Element): Box => {
    const shown = visible(element, running(element)?.progress ?? 1);
    for (let outer = element.parentElement?.closest(`[${TURN_PART}]`); outer; outer = outer.parentElement?.closest(`[${TURN_PART}]`)) {
      const animation = running(outer);
      const [x = 0, y = 0] = String(animation?.keyframes[0]?.translate ?? "0px 0px").split(" ").map(Number.parseFloat);
      const left = 1 - (animation?.progress ?? 1);
      shown.left += x * left;
      shown.top += y * left;
    }
    return shown;
  };
  return { page, boxes, log, animations, frames, extended, transitions, timers, opacities, shifts, refitted, copies, settings, motion, part, fading, drawn, layout, play, waiting, paint, animationOf, frameOf, keeper, visible, drawnAt };
}

const box = (left: number, top: number, width: number, height: number): Box => ({ left, top, width, height });

const between = (from: Box, to: Box, progress: number): Box => ({
  left: from.left + (to.left - from.left) * progress,
  top: from.top + (to.top - from.top) * progress,
  width: from.width + (to.width - from.width) * progress,
  height: from.height + (to.height - from.height) * progress
});

// What the keyframes of `animations` animate.
const animated = (animations: Started[]) => [...new Set(animations.flatMap(({ keyframes }) => keyframes.flatMap((keyframe) => Object.keys(keyframe))))].sort();

describe("the turn motion", () => {
  it("glides each shared part from where it stood to its new place, together, over 240 ms easing out, until it settles", () => {
    const motion = harness();
    const wordmark = motion.part("wordmark", box(56, 40, 120, 32));
    const greeting = motion.part("greeting", box(56, 116, 600, 48));
    motion.drawn();
    const changes: boolean[] = [];
    motion.motion.subscribe(() => changes.push(motion.motion.isRunning()));

    motion.motion.apply(motion.layout([[wordmark, box(56, 40, 120, 32)], [greeting, box(40, 300, 600, 48)]]), "glide");

    expect(motion.animations.map(({ element, keyframes, options }) => [element, keyframes, options])).toEqual([
      [greeting, [{ translate: "16px -184px" }, { translate: "0px 0px" }], { duration: GLIDE, easing: EASE_OUT }]
    ]);
    expect([motion.motion.isRunning(), motion.timers.map(({ ms }) => ms)]).toEqual([true, [GLIDE]]);

    motion.timers[0]?.fire();

    expect([motion.motion.isRunning(), changes, motion.animations[0]?.cancelled]).toEqual([false, [true, false], true]);
  });

  it("starts each part from where it was last drawn, though the page has been laid out for the new window before the change is told", () => {
    const motion = harness();
    const corner = motion.part("corner", box(900, 40, 200, 48));
    motion.drawn();
    // The window has changed: the page is laid out for it, its layout
    // not yet changed.
    motion.boxes.set(corner, box(540, 40, 200, 48));

    motion.motion.apply(motion.layout([[corner, box(560, 40, 200, 48)]]), "glide");

    expect([motion.log, motion.animationOf(corner)?.keyframes[0]]).toEqual([["change", "measure corner"], { translate: "340px 0px" }]);
  });

  it("measures the page again when it is drawn otherwise at rest, as by a scroll, and not while a motion runs", () => {
    const motion = harness();
    const tile = motion.part("tile", box(934, 116, 310, 280));
    motion.drawn();
    motion.boxes.set(tile, box(600, 116, 310, 280));
    motion.motion.redrawn();

    motion.motion.apply(motion.layout([[tile, box(56, 700, 310, 280)]]), "glide");
    motion.motion.redrawn();

    expect([motion.animationOf(tile)?.keyframes[0], motion.log]).toEqual([{ translate: "544px -584px" }, ["measure tile", "change", "measure tile"]]);
  });

  it.each([
    ["grows", box(56, 200, 700, 600)],
    ["shrinks", box(56, 200, 300, 300)],
    ["grows wider and shrinks shorter", box(56, 200, 700, 300)],
    ["shrinks narrower and grows taller", box(56, 200, 300, 700)]
  ])("shows a framed part that %s as a box going from its old size to its new one, its frame drawn under it, never scaled", (_, to) => {
    const motion = harness();
    const from = box(56, 116, 400, 500);
    const card = motion.part("card", from, { frame: true });
    motion.drawn();

    motion.motion.apply(motion.layout([[card, to]]), "glide");

    expect([0, 0.5, 1].map((progress) => motion.visible(card, progress))).toEqual([from, between(from, to, 0.5), to]);
    expect([motion.frameOf(card)?.box, animated(motion.animations.filter(({ element }) => element === card)).filter((property) => property !== "clipPath")]).toEqual([to, ["translate"]]);
  });

  it.each([
    ["grows", box(56, 700, 764, 600)],
    ["shrinks", box(56, 700, 300, 360)],
    ["grows wider and shrinks shorter", box(56, 700, 764, 360)],
    ["shrinks narrower and grows taller", box(56, 700, 300, 700)]
  ])("shows a part holding others that %s as a window going from its old box to its new one, past it while it shrinks", (_, to) => {
    const motion = harness();
    const from = box(600, 116, 500, 600);
    const row = motion.part("row", from);
    const tile = motion.part("tile", box(600, 116, 310, 280), { outer: row });
    motion.drawn();

    motion.motion.apply(motion.layout([[row, to], [tile, box(to.left, to.top, 310, 280)]]), "glide");

    expect([0, 0.5, 1].map((progress) => motion.visible(row, progress))).toEqual([from, between(from, to, 0.5), to]);
    expect(motion.extended.get(row)).toEqual(to.width < from.width || to.height < from.height ? { right: Math.max(0, from.width - to.width), bottom: Math.max(0, from.height - to.height) } : undefined);

    motion.timers[0]?.fire();

    expect([motion.extended.size, motion.log.slice(-2)]).toEqual([0, ["measure row", "measure tile"]]);
  });

  it("leaves uncut what a part shows past its box where it paints no frame and holds no part, as an open menu hanging from it: it only moves", () => {
    const motion = harness();
    const corner = motion.part("corner", box(900, 40, 200, 48));
    motion.drawn();

    motion.motion.apply(motion.layout([[corner, box(560, 40, 260, 56)]]), "glide");

    expect([motion.animationOf(corner)?.keyframes, motion.frames, motion.extended.size]).toEqual([[{ translate: "340px 0px" }, { translate: "0px 0px" }], [], 0]);
  });

  it("moves a part inside another with it, gliding only by its own move within it", () => {
    const motion = harness();
    const row = motion.part("row", box(600, 116, 500, 600));
    const tile = motion.part("tile", box(934, 116, 310, 280), { outer: row });
    motion.drawn();

    motion.motion.apply(motion.layout([[row, box(56, 700, 764, 360)], [tile, box(56, 700, 310, 160)]]), "glide");

    expect(motion.animationOf(row)?.keyframes).toEqual([
      { translate: "544px -584px", clipPath: "inset(0px 264px 0px 0px)" },
      { translate: "0px 0px", clipPath: "inset(0px 0px 240px 0px)" }
    ]);
    expect(motion.animationOf(tile)?.keyframes[0]).toEqual({ translate: "334px 0px" });
  });

  it("draws every frame where its part is laid out before any part moves, so none is drawn off by the motion of a part around it", () => {
    const motion = harness();
    const row = motion.part("row", box(600, 116, 500, 600));
    const tile = motion.part("tile", box(934, 116, 310, 280), { outer: row, frame: true });
    const card = motion.part("card", box(56, 116, 520, 600), { frame: true });
    motion.drawn();

    motion.motion.apply(motion.layout([[row, box(56, 700, 764, 360)], [tile, box(56, 700, 290, 160)], [card, box(56, 200, 708, 476)]]), "glide");

    expect(motion.frames.map(({ part, box, started }) => [part, box, started])).toEqual([
      [tile, box(56, 700, 290, 160), 0],
      [card, box(56, 200, 708, 476), 0]
    ]);
  });

  it("fades in a part only the new layout has, and leaves alone a part that stays where it was", () => {
    const motion = harness();
    const corner = motion.part("corner", box(900, 40, 200, 48));
    motion.drawn();
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

  it("fades in each element the page marks to fade where the new layout puts it, over the glide, and on from where a further change finds it", () => {
    const motion = harness();
    const card = motion.part("card", box(56, 116, 400, 500));
    const bands = motion.fading();
    motion.drawn();

    motion.motion.apply(motion.layout([[card, box(56, 200, 400, 500)]]), "glide");

    expect([motion.animationOf(bands)?.keyframes, motion.animationOf(bands)?.options]).toEqual([[{ opacity: 0 }, { opacity: 1 }], { duration: GLIDE, easing: EASE_OUT }]);

    motion.animations.forEach((started) => (started.progress = 0.25));
    motion.motion.apply(motion.layout([[card, box(56, 116, 400, 500)]]), "follow");

    expect(motion.animationOf(bands)?.keyframes).toEqual([{ opacity: 0.25 }, { opacity: 1 }]);

    motion.timers[1]?.fire();

    expect(motion.animations.filter(({ element }) => element === bands).map(({ cancelled }) => cancelled)).toEqual([true, true]);
  });

  it("lets each screen keep what it keeps: held before the change, put back after it, before the new places are measured, and taken afresh once the page settles", () => {
    const motion = harness();
    const row = motion.part("row", box(600, 116, 500, 600), { frame: true });
    motion.drawn();
    const stop = motion.motion.keep(motion.keeper());

    motion.motion.apply(motion.layout([[row, box(56, 700, 764, 360)]]), "glide");
    motion.timers[0]?.fire();
    stop();
    motion.motion.apply(motion.layout([[row, box(600, 116, 500, 600)]]), "still");

    expect(motion.log).toEqual(["hold", "change", "restore", "measure row", "frame row", "cancel row", "cancel frame of row", "unframe row", "measure row", "rest", "change", "measure row"]);
  });

  it("only fades under reduced motion: the root view transition makes the change, nothing translates or clips, and it runs until the transition has finished", () => {
    const motion = harness({ reduced: true });
    const card = motion.part("card", box(56, 116, 400, 500), { frame: true });
    motion.fading();
    motion.drawn();
    motion.motion.keep(motion.keeper());

    motion.motion.apply(motion.layout([[card, box(56, 200, 700, 300)]]), "glide");

    expect([motion.log, motion.motion.isRunning()]).toEqual([["view transition"], true]);

    motion.transitions[0]?.update();

    expect([motion.log, motion.animations, motion.frames, motion.timers, motion.motion.isRunning()]).toEqual([["view transition", "hold", "change", "restore", "measure card"], [], [], [], true]);

    motion.transitions[0]?.finished();

    expect([motion.log.at(-1), motion.motion.isRunning()]).toEqual(["rest", false]);
  });

  it("starts a further change mid-motion from where each part is drawn, and holds until the fresh motion settles", () => {
    const motion = harness();
    const card = motion.part("card", box(56, 116, 400, 500), { frame: true });
    const greeting = motion.part("greeting", box(56, 40, 600, 48));
    motion.drawn();
    motion.motion.apply(motion.layout([[card, box(56, 200, 700, 300)]]), "glide");
    // Half-way, the card is drawn 42 pixels above its place, 550 by 400.
    const first = motion.animations.slice();
    first.forEach((started) => (started.progress = 0.5));
    motion.log.length = 0;

    motion.motion.apply(motion.layout([[card, box(40, 100, 500, 400)], [greeting, box(40, 40, 600, 48)]]), "glide");

    expect(motion.log).toEqual(["cancel card", "cancel frame of card", "unframe card", "change", "measure card", "measure greeting", "frame card"]);
    expect(motion.animationOf(card)?.keyframes).toEqual([{ translate: "16px 58px" }, { translate: "0px 0px" }]);
    expect(motion.animationOf(motion.frameOf(card)!.element)?.keyframes).toEqual([
      { translate: "16px 58px", width: "550px", height: "400px" },
      { translate: "0px 0px", width: "500px", height: "400px" }
    ]);
    expect(motion.animationOf(greeting)?.keyframes).toEqual([{ translate: "16px 0px" }, { translate: "0px 0px" }]);

    // The first glide's timer, outdated, settles nothing.
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

  it.each([
    ["moves only with the row around it, its place and size in the row kept", box(56 + 334, 700, 310, 280)],
    ["moves and resizes within the row as the row moves", box(56, 700, 290, 160)]
  ])("starts a part that %s on from where it is drawn when a further change cuts the glide short, with no jump", (_, there) => {
    const motion = harness();
    const row = motion.part("row", box(600, 116, 500, 600));
    const tile = motion.part("tile", box(934, 116, 310, 280), { outer: row, frame: true });
    motion.drawn();
    motion.motion.apply(motion.layout([[row, box(56, 700, 764, 360)], [tile, there]]), "glide");
    motion.animations.forEach((started) => (started.progress = 0.5));
    const where = [row, tile].map(motion.drawnAt);

    motion.motion.apply(motion.layout([[row, box(600, 116, 500, 600)], [tile, box(934, 116, 310, 280)]]), "follow");

    expect([row, tile].map(motion.drawnAt)).toEqual(where);
    motion.animations.forEach((started) => (started.progress = 1));
    expect([row, tile].map(motion.drawnAt)).toEqual([box(600, 116, 500, 600), box(934, 116, 310, 280)]);
  });

  it("starts a part fading in within a row that moves on from where it is drawn when a further change cuts the glide short, with no jump", () => {
    const motion = harness();
    const row = motion.part("row", box(600, 116, 500, 600));
    motion.drawn();
    const tile = document.createElement("div");
    tile.setAttribute(TURN_PART, "tile");
    motion.motion.apply(() => {
      motion.layout([[row, box(56, 700, 764, 360)]])();
      row.append(tile);
      motion.boxes.set(tile, box(56, 700, 310, 280));
    }, "glide");
    motion.animations.forEach((started) => (started.progress = 0.5));
    const where = motion.drawnAt(tile);

    motion.motion.apply(motion.layout([[row, box(600, 116, 500, 600)], [tile, box(934, 116, 310, 280)]]), "follow");

    expect([motion.drawnAt(tile), motion.animationOf(tile)?.keyframes[0]?.opacity]).toEqual([where, 0.5]);
  });

  it("follows a resize that keeps the layout at once, measuring the page anew, and glides on from where the parts are drawn where a motion still runs", () => {
    const motion = harness();
    const card = motion.part("card", box(56, 700, 764, 360), { frame: true });
    motion.drawn();
    motion.motion.keep(motion.keeper());

    motion.motion.apply(motion.layout([[card, box(56, 700, 656, 360)]]), "follow");

    expect([motion.log, motion.animations, motion.timers, motion.motion.isRunning()]).toEqual([["hold", "change", "restore", "measure card", "rest"], [], [], false]);

    motion.motion.apply(motion.layout([[card, box(600, 116, 500, 600)]]), "glide");
    motion.motion.apply(motion.layout([[card, box(560, 116, 540, 560)]]), "follow");

    expect(motion.animations.filter(({ element }) => element === card).map(({ keyframes, cancelled }) => [keyframes[0], cancelled])).toEqual([
      [{ translate: "-544px 584px", clipPath: "inset(0px 0px 240px 0px)" }, true],
      [{ translate: "-504px 584px", clipPath: "inset(0px 0px 200px 0px)" }, false]
    ]);
    expect(motion.timers.map(({ ms, stopped }) => [ms, stopped])).toEqual([[GLIDE, true], [GLIDE, false]]);
  });

  it("stops a running motion with every part at rest where nothing is to glide", () => {
    const motion = harness();
    const card = motion.part("card", box(56, 116, 400, 500), { frame: true });
    motion.drawn();
    const changes: boolean[] = [];
    motion.motion.subscribe(() => changes.push(motion.motion.isRunning()));
    motion.motion.apply(motion.layout([[card, box(56, 200, 700, 300)]]), "glide");

    motion.motion.apply(motion.layout([[card, box(0, 0, 393, 852)]]), "still");

    expect([motion.animations.map(({ cancelled }) => cancelled), motion.frames.map(({ removed }) => removed), motion.timers.map(({ stopped }) => stopped), changes]).toEqual([
      [true, true],
      [true],
      [true],
      [true, false]
    ]);
  });

  it.each([
    ["at rest", []],
    ["mid-glide", [box(56, 200, 700, 300)]]
  ])("takes what each screen keeps afresh once a change where nothing moves has put the page at rest, %s", (_, glides) => {
    const motion = harness();
    const card = motion.part("card", box(56, 116, 400, 500));
    motion.drawn();
    motion.motion.keep(motion.keeper());
    glides.forEach((to) => motion.motion.apply(motion.layout([[card, to]]), "glide"));
    motion.log.length = 0;

    motion.motion.apply(motion.layout([[card, box(0, 0, 393, 852)]]), "still");

    expect(motion.log.slice(-5)).toEqual(["hold", "change", "restore", "measure card", "rest"]);
  });

  it("halts, every part at rest, so nothing a change left waiting acts afterwards", () => {
    const motion = harness();
    const card = motion.part("card", box(56, 116, 400, 500), { frame: true });
    motion.drawn();
    motion.motion.apply(motion.layout([[card, box(56, 200, 700, 300)]]), "glide");
    motion.settings.reduced = true;
    motion.motion.apply(motion.layout([[card, box(56, 116, 400, 500)]]), "glide");

    motion.motion.halt();
    motion.log.length = 0;
    motion.transitions[0]?.update();
    motion.transitions[0]?.finished();
    motion.timers[0]?.fire();

    expect([motion.animations.map(({ cancelled }) => cancelled), motion.frames.map(({ removed }) => removed), motion.motion.isRunning(), motion.log]).toEqual([[true, true], [true], false, []]);
  });
});

describe("the fade under reduced motion", () => {
  it("fades again when the window changes during the fade, even keeping the layout, and runs until the last fade has finished", () => {
    const motion = harness({ reduced: true });
    motion.part("card", box(56, 116, 400, 500));
    motion.drawn();
    motion.motion.apply(() => motion.log.push("turn"), "glide");

    motion.motion.apply(() => motion.log.push("resize"), "follow");

    expect(motion.log).toEqual(["view transition", "view transition"]);

    // The browser runs the first transition's update, outdated, then
    // skips it for the second.
    motion.transitions[0]?.update();
    motion.transitions[0]?.finished();

    expect([motion.log, motion.motion.isRunning()]).toEqual([["view transition", "view transition"], true]);

    motion.transitions[1]?.update();

    expect([motion.log.slice(2), motion.motion.isRunning()]).toEqual([["resize", "measure card"], true]);

    motion.transitions[1]?.finished();

    expect(motion.motion.isRunning()).toBe(false);
  });

  it("drops a fade's update, delivered late, once a newer change has put the page at rest", () => {
    const motion = harness({ reduced: true });
    motion.part("card", box(56, 116, 400, 500));
    motion.drawn();
    motion.motion.apply(() => motion.log.push("tall"), "glide");
    motion.motion.apply(() => motion.log.push("tall-narrow"), "still");

    motion.transitions[0]?.update();
    motion.transitions[0]?.finished();

    expect([motion.log, motion.motion.isRunning()]).toEqual([["view transition", "tall-narrow", "measure card"], false]);
  });

  it("holds until the view transition has finished, its update delivered late, whatever the time", () => {
    const motion = harness({ reduced: true });
    motion.part("card", box(56, 116, 400, 500));
    motion.drawn();

    motion.motion.apply(() => motion.log.push("change"), "glide");

    expect([motion.timers, motion.motion.isRunning()]).toEqual([[], true]);

    motion.transitions[0]?.update();

    expect(motion.motion.isRunning()).toBe(true);

    motion.transitions[0]?.finished();

    expect(motion.motion.isRunning()).toBe(false);
  });

  it("fades a glide still running when reduced motion comes on, cutting it short only as the view transition updates", () => {
    const motion = harness();
    const card = motion.part("card", box(56, 116, 400, 500), { frame: true });
    motion.drawn();
    motion.motion.apply(motion.layout([[card, box(56, 200, 700, 300)]]), "glide");
    motion.settings.reduced = true;
    motion.log.length = 0;

    motion.motion.apply(motion.layout([[card, box(56, 116, 400, 500)]]), "glide");

    expect([motion.log, motion.timers.map(({ stopped }) => stopped)]).toEqual([["view transition"], [true]]);

    motion.transitions[0]?.update();

    expect([motion.log, motion.animations.length]).toEqual([["view transition", "cancel card", "cancel frame of card", "unframe card", "change", "measure card"], 2]);
  });
});

describe("the page's own animations", () => {
  it.each([
    ["on the part itself", "part"],
    ["on an element around it", "around"]
  ] as const)("measure the page again before every frame while one runs %s, until it has ended, so a glide starts from where the part was last drawn", (_, on) => {
    const motion = harness();
    const screen = document.createElement("div");
    motion.page.append(screen);
    const card = motion.part("card", box(56, 132, 400, 500), { outer: screen });
    const entrance = motion.play(on === "part" ? card : screen);
    motion.drawn();

    expect(motion.waiting().length).toBe(1);

    motion.boxes.set(card, box(56, 124, 400, 500));
    motion.paint();
    // The animation ends by this frame.
    motion.boxes.set(card, box(56, 116, 400, 500));
    entrance.finished = true;
    motion.paint();

    expect([motion.log, motion.waiting()]).toEqual([["measure card", "measure card"], []]);

    motion.motion.apply(motion.layout([[card, box(56, 300, 400, 500)]]), "glide");

    expect(motion.animationOf(card)?.keyframes[0]).toEqual({ translate: "0px -184px" });
  });

  it("measure nothing before frames while a motion runs, and again once it settles, until the motion halts", () => {
    const motion = harness();
    const card = motion.part("card", box(56, 132, 400, 500));
    motion.play(motion.page);
    motion.drawn();

    motion.motion.apply(motion.layout([[card, box(56, 300, 400, 500)]]), "glide");
    motion.motion.redrawn();

    expect([motion.waiting(), motion.log]).toEqual([[], ["change", "measure card"]]);

    motion.timers[0]?.fire();

    expect(motion.waiting().length).toBe(1);

    motion.motion.halt();
    motion.paint();

    expect([motion.waiting(), motion.log.slice(-1)]).toEqual([[], ["measure card"]]);
  });

  it("are taken over by a glide on the part they run on: it goes on from where and how faded they draw it, and they end before its new place is measured, those around it left running", () => {
    const motion = harness();
    const screen = document.createElement("div");
    motion.page.append(screen);
    const card = motion.part("card", box(56, 124, 400, 500), { outer: screen, frame: true });
    const entrance = motion.play(card, 0.5);
    const around = motion.play(screen);
    motion.drawn();

    motion.motion.apply(motion.layout([[card, box(56, 300, 700, 300)]]), "glide");

    expect([motion.log, entrance.finished, around.finished]).toEqual([["change", "finish card", "measure card", "frame card"], true, false]);
    expect(motion.animationOf(card)?.keyframes.map(({ translate, opacity }) => ({ translate, opacity }))).toEqual([
      { translate: "0px -176px", opacity: 0.5 },
      { translate: "0px 0px", opacity: 1 }
    ]);
    expect(motion.animationOf(motion.frameOf(card)!.element)?.keyframes.map(({ opacity }) => opacity)).toEqual([0.5, 1]);
  });
});

describe("what the motion animates", () => {
  it("moves parts by translation, a clip and opacity alone, and sizes only their frames, never scaling a word or a picture", () => {
    const motion = harness();
    const row = motion.part("row", box(600, 116, 500, 600));
    const tile = motion.part("tile", box(934, 116, 310, 280), { outer: row, frame: true });
    const card = motion.part("card", box(56, 116, 520, 600), { frame: true });
    const footer = document.createElement("div");
    footer.setAttribute(TURN_PART, "footer");
    motion.drawn();

    motion.motion.apply(() => {
      motion.layout([[row, box(56, 700, 764, 360)], [tile, box(56, 700, 290, 160)], [card, box(56, 200, 708, 476)]])();
      motion.page.append(footer);
      motion.boxes.set(footer, box(56, 1100, 200, 20));
    }, "glide");
    motion.animations.forEach((started) => {
      started.progress = 0.5;
    });
    motion.motion.apply(motion.layout([[row, box(600, 116, 500, 600)], [tile, box(934, 116, 310, 280)], [card, box(56, 116, 520, 600)], [footer, box(56, 900, 200, 20)]]), "glide");

    const frames = new Set(motion.frames.map(({ element }) => element));
    const parts = motion.animations.filter(({ element }) => !frames.has(element));
    expect(parts.map(({ element }) => element)).toEqual([row, tile, card, footer, row, tile, card, footer]);
    expect([animated(parts), animated(motion.animations.filter(({ element }) => frames.has(element)))]).toEqual([
      ["clipPath", "opacity", "translate"],
      ["height", "translate", "width"]
    ]);
    expect(motion.animations.flatMap(({ keyframes }) => keyframes).filter((keyframe) => "scale" in keyframe || "transform" in keyframe)).toEqual([]);
  });
});

describe("a screen transition's parts", () => {
  it("glide on from where its snapshots draw them at rest, each part inside moving with the one around it, faded only as drawn", () => {
    const motion = harness();
    const row = motion.part("row", box(0, 100, 600, 200));
    const chip = motion.part("chip", box(20, 120, 100, 50), { outer: row });
    motion.drawn();
    motion.shifts.push({ element: row, offset: { x: 96, y: 0 }, opacity: 0.25 });

    motion.motion.apply(motion.layout([[row, box(0, 400, 600, 200)], [chip, box(40, 420, 100, 50)]]), "glide");

    expect(motion.shifts).toEqual([]);
    expect([motion.animationOf(row)?.keyframes, motion.animationOf(chip)?.keyframes]).toEqual([
      [{ translate: "96px -300px", opacity: 0.25 }, { translate: "0px 0px", opacity: 1 }],
      [{ translate: "-20px 0px" }, { translate: "0px 0px" }]
    ]);
  });

  it("are taken at every change, and a glide still running goes on from where it draws them, past a shift", () => {
    const motion = harness();
    const row = motion.part("row", box(0, 100, 600, 200));
    motion.drawn();
    motion.shifts.push({ element: row, offset: { x: 96, y: 0 }, opacity: 0.25 });

    motion.motion.apply(motion.layout([[row, box(0, 120, 600, 200)]]), "follow");

    expect([motion.shifts, motion.animations]).toEqual([[], []]);

    motion.motion.apply(motion.layout([[row, box(0, 400, 600, 200)]]), "glide");
    motion.animationOf(row)!.progress = 0.5;
    motion.shifts.push({ element: row, offset: { x: 96, y: 0 }, opacity: 0.25 });
    motion.motion.apply(motion.layout([[row, box(0, 500, 600, 200)]]), "glide");

    expect([motion.animationOf(row)?.keyframes, motion.shifts]).toEqual([[{ translate: "0px -240px" }, { translate: "0px 0px" }], []]);
  });
});

describe("a part whose content its box lays out", () => {
  it("travels as a copy whose box changes from where it stood to its new place, the part itself left still, on from where a further change finds it", () => {
    const motion = harness();
    const stage = motion.part("stage", box(0, 100, 800, 600));
    const picture = motion.part("picture", box(100, 150, 600, 450), { outer: stage });
    motion.refitted.add(picture);
    motion.drawn();

    motion.motion.apply(motion.layout([[stage, box(0, 300, 800, 400)], [picture, box(200, 320, 400, 300)]]), "glide");

    const bounds = ({ left, top, width, height }: Box) => ({ left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
    const first = motion.animationOf(motion.copies[0]!.element)!;
    expect([motion.copies.map(({ part, box }) => [part, box]), first.keyframes, first.options, motion.animationOf(picture)]).toEqual([
      [[picture, box(200, 320, 400, 300)]], [bounds(box(100, 150, 600, 450)), bounds(box(200, 320, 400, 300))], { duration: GLIDE, easing: EASE_OUT }, undefined
    ]);

    motion.animations.forEach((started) => (started.progress = 0.5));
    motion.motion.apply(motion.layout([[stage, box(0, 100, 800, 600)], [picture, box(100, 150, 600, 450)]]), "glide");

    expect([motion.copies.map(({ removed }) => removed), first.cancelled]).toEqual([[true, false], true]);
    expect(motion.animationOf(motion.copies[1]!.element)?.keyframes).toEqual([bounds(between(box(100, 150, 600, 450), box(200, 320, 400, 300), 0.5)), bounds(box(100, 150, 600, 450))]);

    motion.timers.at(-1)?.fire();

    expect(motion.copies.map(({ removed }) => removed)).toEqual([true, true]);
  });

  it("only moves with the parts around it where its size stays", () => {
    const motion = harness();
    const stage = motion.part("stage", box(0, 100, 800, 600));
    const picture = motion.part("picture", box(100, 150, 600, 450), { outer: stage });
    motion.refitted.add(picture);
    motion.drawn();

    motion.motion.apply(motion.layout([[stage, box(0, 300, 800, 600)], [picture, box(120, 350, 600, 450)]]), "glide");

    expect([motion.copies, motion.animationOf(picture)?.keyframes]).toEqual([[], [{ translate: "-20px 0px" }, { translate: "0px 0px" }]]);
  });
});
