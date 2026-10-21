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

// What a screen keeps through a change of layout, such as where a row is
// scrolled: called before the change, it returns how to restore it after.
export type Keeper = () => () => void;

// How a change moves the page. `glide`: the layout changes, and the parts
// glide to their new places, or under reduced motion the page fades.
// `follow`: the layout stays; it applies at once, and a glide still
// running goes on from where its parts are drawn to their new places.
// `still`: nothing moves, and a motion still running stops with every
// part at rest.
export type TurnStyle = "glide" | "follow" | "still";

export type TurnMotionSeams = {
  // The page holding the marked parts.
  parts: Pick<ParentNode, "querySelectorAll">;
  // An element's box as drawn, with any animation running on it.
  measure(element: Element): Box;
  animate(element: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions): TurnAnimation;
  reducedMotion(): boolean;
  // The root view transition: a cross-fade from the page as drawn to the
  // page `update` makes.
  startViewTransition(update: () => void): void;
  startTimer(ms: number, fire: () => void): () => void;
  // The glide's duration and easing, and the fade's duration, which only
  // holds the motion running: the view transition's is the stylesheet's.
  timing: { glide: number; easing: string; fade: number };
};

export type TurnMotion = {
  // Applies `change`, which changes the page's layout in the DOM, moving
  // the page as `style` says.
  apply(change: () => void, style: TurnStyle): void;
  // Keeps what `keeper` keeps through every change, until the returned
  // stop is called.
  keep(keeper: Keeper): () => void;
  // Whether a motion is running, from a change until it settles.
  isRunning(): boolean;
  subscribe(onChange: () => void): () => void;
};

// How far past a part's box its clip stands where the part does not grow,
// and where a growing edge's clip ends: past the farthest shadow a part
// casts, so no shadow is cut off and none appears at once as the motion
// ends.
const SHADOW_ROOM = 64;

// A part's place before a change, as drawn, or after it, laid out.
type Place = { element: Element; box: Box; opacity: number };

// An animation started on a part: its clip's right and bottom insets at
// its start, each moving to -SHADOW_ROOM, and its opacity at its start,
// moving to 1.
type Drawing = { animation: TurnAnimation; right: number; bottom: number; opacity: number };

// Moves a page to its new layout by measuring its marked parts, changing
// the layout, measuring them again and animating each from its old place
// to its new one, by translation and a clip only, so no word or picture
// is scaled. A box as drawn includes the animation running on it, so a
// further change starts each part from where it is.
export function turnMotion({ parts, measure, animate, reducedMotion, startViewTransition, startTimer, timing }: TurnMotionSeams): TurnMotion {
  const keepers = new Set<Keeper>();
  const listeners = new Set<() => void>();
  let drawings = new Map<Element, Drawing>();
  let running: { style: "glide" | "fade"; stop: () => void } | undefined;

  const setRunning = (next: typeof running) => {
    const changed = (running === undefined) !== (next === undefined);
    running?.stop();
    running = next;
    if (changed) listeners.forEach((listener) => listener());
  };

  const runFor = (style: "glide" | "fade", ms: number) => {
    const stop = startTimer(ms, () => {
      if (running?.stop === stop) setRunning(undefined);
    });
    setRunning({ style, stop });
  };

  const cancelAll = () => {
    drawings.forEach(({ animation }) => animation.cancel());
    drawings = new Map();
  };

  const kept = (change: () => void) => {
    const restores = [...keepers].map((keeper) => keeper());
    change();
    restores.forEach((restore) => restore());
  };

  const places = (): Map<string, Place> => {
    const found = new Map<string, Place>();
    for (const element of parts.querySelectorAll(`[${TURN_PART}]`)) {
      const name = element.getAttribute(TURN_PART) ?? "";
      if (found.has(name)) continue;
      const box = measure(element);
      const drawing = drawings.get(element);
      if (!drawing) {
        found.set(name, { element, box, opacity: 1 });
        continue;
      }
      const progress = drawing.animation.effect?.getComputedTiming().progress ?? 1;
      const cut = (from: number) => Math.max(0, from + (-SHADOW_ROOM - from) * progress);
      found.set(name, {
        element,
        box: { ...box, width: box.width - cut(drawing.right), height: box.height - cut(drawing.bottom) },
        opacity: drawing.opacity + (1 - drawing.opacity) * progress
      });
    }
    return found;
  };

  const glide = (change: () => void) => {
    const before = places();
    cancelAll();
    kept(change);
    const after = places();
    const options = { duration: timing.glide, easing: timing.easing };
    // The nearest part around `element` that glides, whose motion it
    // shares and so does not repeat.
    const around = (element: Element) => {
      for (let outer = element.parentElement?.closest(`[${TURN_PART}]`); outer; outer = outer.parentElement?.closest(`[${TURN_PART}]`)) {
        const name = outer.getAttribute(TURN_PART) ?? "";
        if (before.has(name) && after.get(name)?.element === outer) return name;
      }
      return undefined;
    };
    for (const [name, { element, box }] of after) {
      const old = before.get(name);
      if (!old) {
        drawings.set(element, { animation: animate(element, [{ opacity: 0 }, { opacity: 1 }], options), right: -SHADOW_ROOM, bottom: -SHADOW_ROOM, opacity: 0 });
        continue;
      }
      const outer = around(element);
      const oldOuter = outer === undefined ? undefined : before.get(outer)?.box;
      const newOuter = outer === undefined ? undefined : after.get(outer)?.box;
      const x = old.box.left - (oldOuter?.left ?? 0) - (box.left - (newOuter?.left ?? 0));
      const y = old.box.top - (oldOuter?.top ?? 0) - (box.top - (newOuter?.top ?? 0));
      const right = box.width > old.box.width ? box.width - old.box.width : -SHADOW_ROOM;
      const bottom = box.height > old.box.height ? box.height - old.box.height : -SHADOW_ROOM;
      const clipped = right > 0 || bottom > 0;
      if (x === 0 && y === 0 && !clipped && old.opacity === 1) continue;
      const from: Keyframe = { translate: `${x}px ${y}px` };
      const to: Keyframe = { translate: "0px 0px" };
      if (clipped) {
        from.clipPath = inset(right, bottom);
        to.clipPath = inset(-SHADOW_ROOM, -SHADOW_ROOM);
      }
      if (old.opacity < 1) {
        from.opacity = old.opacity;
        to.opacity = 1;
      }
      drawings.set(element, { animation: animate(element, [from, to], options), right, bottom, opacity: old.opacity });
    }
    runFor("glide", timing.glide);
  };

  // The view transition takes its picture of the page as drawn before its
  // update runs, so a glide still running is cut short only inside it.
  const fade = (change: () => void) => {
    startViewTransition(() => {
      cancelAll();
      kept(change);
    });
    runFor("fade", timing.fade);
  };

  return {
    apply: (change, style) => {
      if (style === "still") {
        cancelAll();
        setRunning(undefined);
        kept(change);
      } else if (style === "glide" || running?.style === "glide") {
        (reducedMotion() ? fade : glide)(change);
      } else {
        kept(change);
      }
    },
    keep: (keeper) => {
      keepers.add(keeper);
      return () => keepers.delete(keeper);
    },
    isRunning: () => running !== undefined,
    subscribe: (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    }
  };
}

// A clip of a part's box with its right and bottom edges `right` and
// `bottom` in from the box's, its top and left past the part's shadow.
function inset(right: number, bottom: number): string {
  return `inset(${-SHADOW_ROOM}px ${right}px ${bottom}px ${-SHADOW_ROOM}px)`;
}
