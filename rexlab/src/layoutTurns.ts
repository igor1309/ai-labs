import { useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { TurnStyle } from "./turnMotion.ts";

// The layout a screen stands in: the screen, whether its portrait layout
// applies, whether the picture asking to turn covers it, and its arrangement
// where a screen has more than one layout in the same size class.
export type ScreenLayout = { screen: string; portrait: boolean; gated: boolean; arrangement?: string };

// The page's changes of layout: `apply` makes one and moves the page as
// `style` says, and a change is running until its motion settles.
// `redrawn` tells that the page may be drawn otherwise than when it last
// settled, and `halt` stops whatever runs or waits.
export type LayoutTurns = {
  apply(change: () => void, style: TurnStyle): void;
  redrawn(): void;
  halt(): void;
  isRunning(): boolean;
  subscribe(onChange: () => void): () => void;
};

// The window's changes, of any of its sizes.
export type WindowChanges = {
  subscribe(onChange: () => void): () => void;
};

// How a change of window moves the page from layout `from` to `to`. Its
// parts glide only where the screen stays and goes to its other layout
// with no picture asking to turn, before or after: that picture fades in
// or out over a page at rest. Any other change follows the window.
export function turnStyle(from: ScreenLayout | undefined, to: ScreenLayout): TurnStyle {
  if (!from || from.screen !== to.screen || from.gated || to.gated) return "still";
  const arrangementChanged = from.arrangement !== undefined && to.arrangement !== undefined && from.arrangement !== to.arrangement;
  return from.portrait === to.portrait && !arrangementChanged ? "follow" : "glide";
}

// The keys a motion holds back: no key reaches the page, nor moves its
// focus, until the motion settles.
const KEYS = ["keydown", "keypress", "keyup"];

// The presses a motion holds back. A press during it lands on the document,
// past a page that takes no tap, and would take the focus there; it still
// reaches the double-tap filter, which counts it.
const PRESSES = ["pointerdown", "mousedown"];

// The clicks a motion holds back, though no tap reaches the page: one
// assistive technology sends to the focused control would still open what
// it names. They are held on the document, after the double-tap filter on
// the window, which still counts each of them.
const CLICKS = ["click"];

// The wheel a motion holds back: a trackpad's swipe, which would scroll
// the page under parts that no longer stand where they are drawn.
const WHEELS = ["wheel"];

// What may draw the page otherwise than it last settled, between changes
// of the window: a scroll, and an animation or transition of its own
// starting, ending or cut short.
const REDRAWS = ["scroll", "animationstart", "animationend", "animationcancel", "transitionrun", "transitionend", "transitioncancel"];

// Sets the window's size class on the document, as `data-size`, through
// `turns`, on every change of the window, of any of its sizes, or of
// `layout`, each moving the page as `turnStyle` says: a motion still
// running goes on to where the latest window puts each part, and what a
// screen keeps is put back even where nothing glides. While a motion
// runs, the document is marked `data-turning`, where the stylesheet lets
// no tap or swipe reach the page, and keys, presses, clicks and the wheel
// are held back.
export function useLayoutTurns(turns: LayoutTurns, viewport: WindowChanges, size: string, layout: ScreenLayout, applyLayout?: () => void) {
  // Each change of the window counts, though it leaves the size class and
  // the width as they were: the page's parts may be sized by its height.
  const resizes = useMemo(() => {
    let count = 0;
    return {
      subscribe: (onChange: () => void) =>
        viewport.subscribe(() => {
          count++;
          onChange();
        }),
      count: () => count
    };
  }, [viewport]);
  const resized = useSyncExternalStore(resizes.subscribe, resizes.count);
  const last = useRef<ScreenLayout>(undefined);
  const { screen, portrait, gated, arrangement } = layout;

  useLayoutEffect(() => {
    const root = document.documentElement;
    const hold = (event: Event) => {
      if (!turns.isRunning()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const press = (event: Event) => {
      if (turns.isRunning()) event.preventDefault();
    };
    const redrawn = () => turns.redrawn();
    KEYS.forEach((type) => window.addEventListener(type, hold, { capture: true }));
    PRESSES.forEach((type) => window.addEventListener(type, press, { capture: true }));
    CLICKS.forEach((type) => document.addEventListener(type, hold, { capture: true }));
    // A browser listens to the wheel on the window passively unless told
    // otherwise, and then scrolls whatever the listener says.
    WHEELS.forEach((type) => window.addEventListener(type, hold, { capture: true, passive: false }));
    REDRAWS.forEach((type) => window.addEventListener(type, redrawn, { capture: true }));
    const stop = turns.subscribe(() => root.toggleAttribute("data-turning", turns.isRunning()));
    return () => {
      stop();
      turns.halt();
      KEYS.forEach((type) => window.removeEventListener(type, hold, { capture: true }));
      PRESSES.forEach((type) => window.removeEventListener(type, press, { capture: true }));
      CLICKS.forEach((type) => document.removeEventListener(type, hold, { capture: true }));
      WHEELS.forEach((type) => window.removeEventListener(type, hold, { capture: true }));
      REDRAWS.forEach((type) => window.removeEventListener(type, redrawn, { capture: true }));
      root.removeAttribute("data-turning");
    };
  }, [turns]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const next: ScreenLayout = arrangement === undefined ? { screen, portrait, gated } : { screen, portrait, gated, arrangement };
    turns.apply(() => {
      root.dataset.size = size;
      applyLayout?.();
    }, turnStyle(last.current, next));
    last.current = next;
  }, [turns, size, screen, portrait, gated, arrangement, resized, applyLayout]);

  useLayoutEffect(
    () => () => {
      delete document.documentElement.dataset.size;
    },
    []
  );
}
