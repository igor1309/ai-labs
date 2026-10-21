// The attribute a screen marks each part of its layout with. A part of
// the same name before and after a change of layout is the same part,
// and a part inside another moves with it.
export const TURN_PART = "data-turn-part";

export type Box = { left: number; top: number; width: number; height: number };

// An animation as `element.animate` starts it: its eased progress tells
// where its part is drawn when a further change cuts it short.
export type TurnAnimation = {
  cancel(): void;
  effect: { getComputedTiming(): { progress?: number | null } } | null;
};

// A box drawn under a part, with the part's own background, border and
// shadow and none of its content, in place of the part's own: it can be
// sized as the part's box glides from its old size to its new one, which
// the part, its content laid out, cannot be without scaling it.
export type TurnFrame = { element: Element; remove(): void };

// What a screen keeps through a change of layout, such as where a row is
// scrolled. `hold`, before each change, returns how to put it back after
// it; `rest`, once the page has settled at rest, takes what it keeps
// afresh from the page as it now stands.
export type Keeper = { hold(): () => void; rest(): void };

// How a change moves the page. `glide`: the layout changes, and the parts
// glide to their new places, or under reduced motion the page fades.
// `follow`: the layout stays; it applies at once, and a motion still
// running goes on from where its parts are drawn to their new places, or
// fades again. `still`: nothing moves, and a motion still running stops
// with every part at rest.
export type TurnStyle = "glide" | "follow" | "still";

export type TurnMotionSeams = {
  // The page holding the marked parts.
  parts: Pick<ParentNode, "querySelectorAll">;
  // An element's box as the page lays it out now, asked only while no
  // motion runs on it.
  measure(element: Element): Box;
  // Draws `element`'s frame at `box`, its place after the change, under
  // it, hiding its own until removed; none where the element paints none.
  frame(element: Element, box: Box): TurnFrame | undefined;
  // Widens what `element` shows of what it holds by `right` and `bottom`
  // pixels past its box, nothing moving, until the returned stop.
  extend(element: Element, right: number, bottom: number): () => void;
  animate(element: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions): TurnAnimation;
  reducedMotion(): boolean;
  // The root view transition: a cross-fade from the page as drawn to the
  // page `update` makes, calling `finished` once it has ended, or been
  // skipped, its update run.
  startViewTransition(update: () => void, finished: () => void): void;
  startTimer(ms: number, fire: () => void): () => void;
  // The glide's duration and easing. The fade's are the stylesheet's.
  timing: { glide: number; easing: string };
};

export type TurnMotion = {
  // Applies `change`, which changes the page's layout in the DOM, moving
  // the page as `style` says.
  apply(change: () => void, style: TurnStyle): void;
  // Keeps what `keeper` keeps through every change, until the returned
  // stop is called.
  keep(keeper: Keeper): () => void;
  // Tells that the page may be drawn otherwise than it was last measured,
  // as after a scroll or an animation of its own: at rest, its parts are
  // measured again.
  redrawn(): void;
  // Stops any motion, every part at rest, and drops whatever a change
  // still waits for, such as a fade's update.
  halt(): void;
  // Whether a motion is running, from a change until it settles.
  isRunning(): boolean;
  subscribe(onChange: () => void): () => void;
};

// A part's place as drawn: its box and its opacity.
type Place = { element: Element; box: Box; opacity: number };

// A glide started on a part: from where it was drawn to where it is laid
// out, by its eased progress, with the frame drawn for it and how to
// narrow it back.
type Drawing = { animations: TurnAnimation[]; from: Place; to: Box; frame: TurnFrame | undefined; release: (() => void) | undefined };

const lerp = (from: number, to: number, progress: number) => from + (to - from) * progress;

// Moves a page to its new layout from where its marked parts were last
// drawn: the boxes they were measured at as the page last stood at rest,
// or where a motion still running draws them. By the time a window's
// change is told, the page has already been laid out for it, so a part
// is measured before a change only where the page has gained it since. Each part glides from
// its old place to its new one by translation, its change of size shown
// by a clip of what it holds and a frame drawn under it, so no word or
// picture is scaled. Each change outdates every one before it, and
// nothing a change left waiting acts once it is outdated.
export function turnMotion({ parts, measure, frame, extend, animate, reducedMotion, startViewTransition, startTimer, timing }: TurnMotionSeams): TurnMotion {
  const keepers = new Set<Keeper>();
  const listeners = new Set<() => void>();
  let drawn = new Map<string, Box>();
  let drawings = new Map<Element, Drawing>();
  let running: (() => void) | undefined;
  let changes = 0;

  const setRunning = (next: typeof running) => {
    const changed = (running === undefined) !== (next === undefined);
    running?.();
    running = next;
    if (changed) listeners.forEach((listener) => listener());
  };

  const cancelAll = () => {
    drawings.forEach(({ animations, frame, release }) => {
      animations.forEach((animation) => animation.cancel());
      frame?.remove();
      release?.();
    });
    drawings = new Map();
  };

  const marked = () => {
    const found = new Map<string, Element>();
    for (const element of parts.querySelectorAll(`[${TURN_PART}]`)) {
      const name = element.getAttribute(TURN_PART) ?? "";
      if (!found.has(name)) found.set(name, element);
    }
    return found;
  };

  const remeasure = () => {
    drawn = new Map([...marked()].map(([name, element]) => [name, measure(element)]));
  };

  const kept = (change: () => void) => {
    const restores = [...keepers].map((keeper) => keeper.hold());
    change();
    restores.forEach((restore) => restore());
  };

  // Each part as drawn now. A part the page has gained since it was last
  // measured is measured as it stands.
  const places = (): Map<string, Place> => {
    const found = new Map<string, Place>();
    for (const [name, element] of marked()) {
      const drawing = drawings.get(element);
      if (!drawing) {
        found.set(name, { element, box: drawn.get(name) ?? measure(element), opacity: 1 });
        continue;
      }
      const progress = drawing.animations[0]?.effect?.getComputedTiming().progress ?? 1;
      const { from, to } = drawing;
      found.set(name, {
        element,
        box: {
          left: lerp(from.box.left, to.left, progress),
          top: lerp(from.box.top, to.top, progress),
          width: lerp(from.box.width, to.width, progress),
          height: lerp(from.box.height, to.height, progress)
        },
        opacity: lerp(from.opacity, 1, progress)
      });
    }
    return found;
  };

  const settle = (change: number) => {
    if (change !== changes) return;
    cancelAll();
    setRunning(undefined);
    remeasure();
    keepers.forEach((keeper) => keeper.rest());
  };

  const glide = (change: () => void, current: number) => {
    const before = places();
    cancelAll();
    kept(change);
    remeasure();
    const after = new Map([...marked()].map(([name, element]) => [name, { element, box: drawn.get(name) ?? measure(element) }]));
    const options = { duration: timing.glide, easing: timing.easing };
    const shared = (name: string, element: Element) => before.has(name) && after.get(name)?.element === element;
    // The nearest part around `element` that glides, whose motion it
    // shares and so does not repeat.
    const around = (element: Element) => {
      for (let outer = element.parentElement?.closest(`[${TURN_PART}]`); outer; outer = outer.parentElement?.closest(`[${TURN_PART}]`)) {
        const name = outer.getAttribute(TURN_PART) ?? "";
        if (shared(name, outer)) return name;
      }
      return undefined;
    };
    const holding = new Set([...after].flatMap(([name, { element }]) => (shared(name, element) ? [around(element)] : [])));
    // Every frame is drawn before any part moves, each where its part is
    // laid out.
    const starts: Array<() => void> = [];
    for (const [name, { element, box }] of after) {
      const old = before.get(name);
      if (!old) {
        starts.push(() => drawings.set(element, { animations: [animate(element, [{ opacity: 0 }, { opacity: 1 }], options)], from: { element, box, opacity: 0 }, to: box, frame: undefined, release: undefined }));
        continue;
      }
      const outer = around(element);
      const oldOuter = outer === undefined ? undefined : before.get(outer)?.box;
      const newOuter = outer === undefined ? undefined : after.get(outer)?.box;
      const x = old.box.left - (oldOuter?.left ?? 0) - (box.left - (newOuter?.left ?? 0));
      const y = old.box.top - (oldOuter?.top ?? 0) - (box.top - (newOuter?.top ?? 0));
      const resized = old.box.width !== box.width || old.box.height !== box.height;
      const framed = resized ? frame(element, box) : undefined;
      const holds = holding.has(name);
      // A part with neither a frame nor parts of its own shows nothing of
      // its box but its content, which may reach past it, as an open menu
      // does: it only moves, its content laid out anew at once.
      const sized = framed !== undefined || holds;
      const from: Place = { element, box: sized ? old.box : { ...old.box, width: box.width, height: box.height }, opacity: old.opacity };
      // A part that holds others and shrinks shows them past its new box
      // for as long as its old one is drawn.
      const right = holds ? Math.max(0, old.box.width - box.width) : 0;
      const bottom = holds ? Math.max(0, old.box.height - box.height) : 0;
      const release = right > 0 || bottom > 0 ? extend(element, right, bottom) : undefined;
      const clip = sized ? { right: [Math.max(0, box.width + right - old.box.width), right], bottom: [Math.max(0, box.height + bottom - old.box.height), bottom] } : undefined;
      const clipped = clip !== undefined && (clip.right[0] !== clip.right[1] || clip.bottom[0] !== clip.bottom[1]);
      if (x === 0 && y === 0 && !clipped && !framed && old.opacity === 1) continue;
      const start: Keyframe = { translate: `${x}px ${y}px` };
      const end: Keyframe = { translate: "0px 0px" };
      if (clip && clipped) {
        start.clipPath = `inset(0px ${clip.right[0]}px ${clip.bottom[0]}px 0px)`;
        end.clipPath = `inset(0px ${clip.right[1]}px ${clip.bottom[1]}px 0px)`;
      }
      if (old.opacity < 1) {
        start.opacity = old.opacity;
        end.opacity = 1;
      }
      starts.push(() => {
        const animations = [animate(element, [start, end], options)];
        if (framed) {
          const frameStart: Keyframe = { translate: start.translate, width: `${old.box.width}px`, height: `${old.box.height}px` };
          const frameEnd: Keyframe = { translate: end.translate, width: `${box.width}px`, height: `${box.height}px` };
          if (old.opacity < 1) {
            frameStart.opacity = old.opacity;
            frameEnd.opacity = 1;
          }
          animations.push(animate(framed.element, [frameStart, frameEnd], options));
        }
        drawings.set(element, { animations, from, to: box, frame: framed, release });
      });
    }
    starts.forEach((start) => start());
    setRunning(startTimer(timing.glide, () => settle(current)));
  };

  // The view transition takes its picture of the page as drawn before its
  // update runs, so a glide still running is cut short only inside it.
  // The fade runs until the view transition has finished, its own timer
  // the stylesheet's.
  const fade = (change: () => void, current: number) => {
    setRunning(() => {});
    startViewTransition(
      () => {
        if (current !== changes) return;
        cancelAll();
        kept(change);
        remeasure();
      },
      () => settle(current)
    );
  };

  return {
    apply: (change, style) => {
      const current = ++changes;
      if (style === "still") {
        cancelAll();
        setRunning(undefined);
        kept(change);
        remeasure();
      } else if (style === "glide" || running) {
        (reducedMotion() ? fade : glide)(change, current);
      } else {
        kept(change);
        remeasure();
        keepers.forEach((keeper) => keeper.rest());
      }
    },
    keep: (keeper) => {
      keepers.add(keeper);
      return () => keepers.delete(keeper);
    },
    redrawn: () => {
      if (!running) remeasure();
    },
    halt: () => {
      changes++;
      cancelAll();
      setRunning(undefined);
    },
    isRunning: () => running !== undefined,
    subscribe: (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    }
  };
}
