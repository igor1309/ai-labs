import { addTransitionType, startTransition, useCallback, useRef, useState } from "react";

// The view transition type of one screen giving way to another.
export const SCREEN_CHANGE = "screen-change";

// The next screen, or how to make it from the screen it changes.
export type Change<Screen> = Screen | ((current: Screen) => Screen);

// The view transition type of the change from `from` to `to`, or
// undefined for a change applied at once. `intent` tells apart changes
// that the two screens alone cannot, such as a step's direction.
export type TransitionFor<Screen, Intent> = (from: Screen, to: Screen, intent: Intent | undefined) => string | undefined;

export type GoOptions<Intent> = {
  intent?: Intent | undefined;
  // Companion updates, made in the same change, after the screen's.
  also?: (() => void) | undefined;
};

// A module's screens, the only place screen state is written. `go`
// changes the screen as a view transition of the type `transitionFor`
// gives, or at once when it gives none. `set` starts no transition of its
// own: called from another module's `also`, it joins that one's.
export function useScreens<Screen, Intent = never>(first: Screen, transitionFor: TransitionFor<Screen, Intent>) {
  const [screen, setScreen] = useState<Screen>(first);
  // The latest screen asked for, ahead of what React has rendered: it only
  // picks a change's transition type, and is never rendered.
  const asked = useRef(first);

  // Asks for `next` and returns the change before and after it.
  const ask = useCallback((next: Change<Screen>) => {
    const from = asked.current;
    const to = applied(next, from);
    asked.current = to;
    return { from, to, update: updater(next, from, to) };
  }, []);

  const set = useCallback((next: Change<Screen>) => setScreen(ask(next).update), [ask]);

  const go = useCallback(
    (next: Change<Screen>, { intent, also }: GoOptions<Intent> = {}) => {
      const { from, to, update } = ask(next);
      const type = transitionFor(from, to, intent);
      const change = () => {
        setScreen(update);
        also?.();
      };
      if (type === undefined) {
        change();
        return;
      }
      startTransition(() => {
        addTransitionType(type);
        change();
      });
    },
    [ask, transitionFor]
  );

  return { screen, go, set };
}

// What React is given for `next`, asked for as `from` became `to`. A
// function of the screen is React's updater, so the screen rendered follows
// React's update queue, an urgent change during a pending transition
// included. Applied to `from` itself, it gives `to` itself, so a later
// change that checks it is still on a screen it was given finds the same
// one in the screen asked for as in the screen rendered.
function updater<Screen>(next: Change<Screen>, from: Screen, to: Screen): Change<Screen> {
  if (typeof next !== "function") return next;
  return (current: Screen) => (current === from ? to : applied(next, current));
}

function applied<Screen>(next: Change<Screen>, current: Screen): Screen {
  return typeof next === "function" ? (next as (current: Screen) => Screen)(current) : next;
}
