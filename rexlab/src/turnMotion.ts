// The attribute a screen marks each part of its layout with. A part of
// the same name before and after a change of layout is the same part,
// and a part inside another moves with it.
export const TURN_PART = "data-turn-part";

// The attribute that marks what a page does not share between its
// layouts, such as bands behind it: it fades in where the new layout
// puts it, over the glide.
export const TURN_FADE = "data-turn-fade";

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

// A picture drawn outside its laid-out box by a screen transition. Its
// copy travels above the page, clear of its card's and list's clips.
export type PictureContinuation = { element: Element; box: Box; draw(destination: Box): TurnFrame };

// What a screen keeps through a change of layout, such as where a row is
// scrolled. `hold`, before each change, returns how to put it back after
// it; `rest`, once the page has settled at rest, takes what it keeps
// afresh from the page as it now stands.
export type Keeper = { hold(): () => void; rest(): void };

// An animation of the page's own, not a motion's, running on an element,
// such as a card's entrance: `finish` ends it where it would end, at once.
export type PageAnimation = { finish(): void };

// How a change moves the page. `glide`: the layout changes, and the parts
// glide to their new places, or under reduced motion the page fades.
// `follow`: the layout stays; it applies at once, and a motion still
// running goes on from where its parts are drawn to their new places, or
// fades again. `still`: nothing moves, and a motion still running stops
// with every part at rest.
export type TurnStyle = "glide" | "follow" | "still";

export type TurnMotionSeams = {
  // Takes over a screen transition's picture, once, when a glide starts.
  continuation?(): PictureContinuation | undefined;
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
  // The animations of the page's own running on `element` itself, none
  // of a motion's: each may draw it elsewhere from frame to frame.
  animations(element: Element): PageAnimation[];
  // The opacity `element` itself is drawn at now.
  opacity(element: Element): number;
  // Calls `fire` before the page is next drawn, unless the returned stop
  // is called first.
  nextFrame(fire: () => void): () => void;
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
  // as after a scroll, or as an animation of its own starts or ends: at
  // rest, its parts are measured again, and before every frame while such
  // an animation runs.
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

// A motion started on an element: by its eased progress, from `offset`
// off where it is laid out to there, from `size`, where it shows one, to
// its own, and from `opacity` to full, with the frame drawn for it and how
// to narrow it back. The parts around it move it further by their own.
type Drawing = {
  animations: TurnAnimation[];
  offset: { x: number; y: number };
  size: { width: number; height: number } | undefined;
  opacity: number;
  frame: TurnFrame | undefined;
  release: (() => void) | undefined;
};

const lerp = (from: number, to: number, progress: number) => from + (to - from) * progress;

// Moves a page to its new layout from where its marked parts were last
// drawn: the boxes they were measured at as the page last stood at rest,
// or where a motion still running draws them. By the time a window's
// change is told, the page has already been laid out for it, so a part
// is measured before a change only where the page has gained it since.
// At rest, while an animation of the page's own draws a part elsewhere
// from frame to frame, on the part or on an element around it, the parts
// are measured again before every frame. Each part glides from its old
// place to its new one by translation, its change of size shown by a
// clip of what it holds and a frame drawn under it, without scaling its
// content. A closing picture travels above those clips in a changing
// box, fitted whole; what the page marks to fade fades in meanwhile. A
// glide takes over the page's own animations on a part, such as its
// entrance, from where and how faded they draw it: left running, they
// would draw it off its new place, their translation giving way to the
// glide's. Each change outdates every one before it, and nothing a
// change left waiting acts once it is outdated.
export function turnMotion({ parts, measure, frame, extend, animate, animations, opacity, nextFrame, reducedMotion, startViewTransition, startTimer, timing, continuation }: TurnMotionSeams): TurnMotion {
  const keepers = new Set<Keeper>();
  const listeners = new Set<() => void>();
  let drawn = new Map<string, Box>();
  let drawings = new Map<Element, Drawing>();
  let running: (() => void) | undefined;
  let watching: (() => void) | undefined;
  let changes = 0;
  let picture: PictureContinuation | undefined;

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
    if (picture) found.set("closing-picture", picture.element);
    return found;
  };

  const remeasure = () => {
    drawn = new Map([...marked()].map(([name, element]) => [name, measure(element)]));
  };

  // Whether an animation of the page's own runs on a marked part or on an
  // element around it, which carries the part with it.
  const stirring = () => {
    const seen = new Set<Element>();
    for (const part of marked().values()) {
      for (let element: Element | null = part; element && !seen.has(element); element = element.parentElement) {
        seen.add(element);
        if (animations(element).length > 0) return true;
      }
    }
    return false;
  };

  const unwatch = () => {
    watching?.();
    watching = undefined;
  };

  // At rest, measures the page again before its next frame while an
  // animation of its own draws a part elsewhere from frame to frame, so
  // the boxes kept are those last drawn.
  const watch = () => {
    unwatch();
    if (running || !stirring()) return;
    watching = nextFrame(() => {
      watching = undefined;
      remeasure();
      watch();
    });
  };

  const kept = (change: () => void) => {
    const restores = [...keepers].map((keeper) => keeper.hold());
    change();
    restores.forEach((restore) => restore());
  };

  const progressOf = (drawing: Drawing) => drawing.animations[0]?.effect?.getComputedTiming().progress ?? 1;

  // How far the motions on `element` and on each part around it draw it
  // off where it is laid out, as far as each has gone. A part that moves
  // only with a part around it has no motion of its own.
  const moved = (element: Element) => {
    if (element === picture?.element) {
      const drawing = drawings.get(element);
      const left = drawing ? 1 - progressOf(drawing) : 0;
      return { x: (drawing?.offset.x ?? 0) * left, y: (drawing?.offset.y ?? 0) * left };
    }
    let [x, y] = [0, 0];
    for (let part = element.closest(`[${TURN_PART}]`); part; part = part.parentElement?.closest(`[${TURN_PART}]`) ?? null) {
      const drawing = drawings.get(part);
      if (!drawing) continue;
      const left = 1 - progressOf(drawing);
      x += drawing.offset.x * left;
      y += drawing.offset.y * left;
    }
    return { x, y };
  };

  // The opacity `element` itself is drawn at now, or `resting` where no
  // motion runs on it.
  const opacityOf = (element: Element, resting: number) => {
    const drawing = drawings.get(element);
    return drawing ? lerp(drawing.opacity, 1, progressOf(drawing)) : resting;
  };

  // The opacity a part is drawn at now: as a motion or an animation of the
  // page's own on it draws it, or full.
  const partOpacity = (element: Element) => (drawings.has(element) || animations(element).length === 0 ? opacityOf(element, 1) : opacity(element));

  // Each part as drawn now: where it was last measured, moved as the
  // motions running draw it. A part the page has gained since it was
  // last measured is measured as it stands.
  const places = (): Map<string, Place> => {
    const found = new Map<string, Place>();
    for (const [name, element] of marked()) {
      if (element === picture?.element && !drawings.has(element)) {
        found.set(name, { element, box: picture.box, opacity: 1 });
        continue;
      }
      const laidOut = drawn.get(name);
      if (!laidOut) {
        found.set(name, { element, box: measure(element), opacity: partOpacity(element) });
        continue;
      }
      const drawing = drawings.get(element);
      const progress = drawing ? progressOf(drawing) : 1;
      const { x, y } = moved(element);
      found.set(name, {
        element,
        box: {
          left: laidOut.left + x,
          top: laidOut.top + y,
          width: lerp(drawing?.size?.width ?? laidOut.width, laidOut.width, progress),
          height: lerp(drawing?.size?.height ?? laidOut.height, laidOut.height, progress)
        },
        opacity: partOpacity(element)
      });
    }
    return found;
  };

  // Stops any motion, every part at rest, after `change` if one is
  // given, and takes the page afresh as it then stands.
  const rest = (change?: () => void) => {
    cancelAll();
    picture = undefined;
    setRunning(undefined);
    if (change) kept(change);
    remeasure();
    keepers.forEach((keeper) => keeper.rest());
    watch();
  };

  const settle = (change: number) => {
    if (change === changes) rest();
  };

  const glide = (change: () => void, current: number) => {
    unwatch();
    picture ??= continuation?.();
    const before = places();
    // What fades goes on from the opacity it is drawn at, or from none.
    const fadedFrom = new Map([...parts.querySelectorAll(`[${TURN_FADE}]`)].map((element) => [element, opacityOf(element, 0)]));
    cancelAll();
    kept(change);
    // The glide goes on from where the page's own animations on a part
    // drew it, which end where the part is laid out.
    for (const element of marked().values()) animations(element).forEach((animation) => animation.finish());
    remeasure();
    const after = new Map([...marked()].map(([name, element]) => [name, { element, box: drawn.get(name) ?? measure(element) }]));
    const options = { duration: timing.glide, easing: timing.easing };
    const shared = (name: string, element: Element) => before.has(name) && after.get(name)?.element === element;
    // The nearest part around `element` that glides, whose motion it
    // shares and so does not repeat.
    const around = (element: Element) => {
      if (element === picture?.element) return undefined;
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
    const fadeIn = (element: Element, opacity: number) =>
      starts.push(() =>
        drawings.set(element, { animations: [animate(element, [{ opacity }, { opacity: 1 }], options)], offset: { x: 0, y: 0 }, size: undefined, opacity, frame: undefined, release: undefined })
      );
    for (const element of parts.querySelectorAll(`[${TURN_FADE}]`)) fadeIn(element, fadedFrom.get(element) ?? 0);
    for (const [name, { element, box }] of after) {
      const old = before.get(name);
      if (!old) {
        fadeIn(element, 0);
        continue;
      }
      if (element === picture?.element) {
        const copy = picture.draw(box);
        const offset = { x: old.box.left - box.left, y: old.box.top - box.top };
        // Only the fixed copy is laid out as its box changes, so contain
        // fits the picture whole without unequal scales stretching it.
        const bounds = (box: Box): Keyframe => ({ left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
        starts.push(() => drawings.set(element, {
          animations: [animate(copy.element, [bounds(old.box), bounds(box)], options)],
          offset, size: { width: old.box.width, height: old.box.height }, opacity: 1, frame: copy, release: undefined
        }));
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
      const size = sized ? { width: old.box.width, height: old.box.height } : undefined;
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
        drawings.set(element, { animations, offset: { x, y }, size, opacity: old.opacity, frame: framed, release });
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
    unwatch();
    setRunning(() => {});
    startViewTransition(
      () => {
        if (current !== changes) return;
        cancelAll();
        picture = undefined;
        kept(change);
        remeasure();
      },
      () => settle(current)
    );
  };

  return {
    apply: (change, style) => {
      const current = ++changes;
      if (style === "glide" || (style === "follow" && running)) {
        (reducedMotion() ? fade : glide)(change, current);
      } else {
        rest(change);
      }
    },
    keep: (keeper) => {
      keepers.add(keeper);
      return () => keepers.delete(keeper);
    },
    redrawn: () => {
      if (running) return;
      remeasure();
      watch();
    },
    halt: () => {
      changes++;
      unwatch();
      cancelAll();
      picture = undefined;
      setRunning(undefined);
    },
    isRunning: () => running !== undefined,
    subscribe: (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    }
  };
}
