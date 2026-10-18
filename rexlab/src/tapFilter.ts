// One step of a touch, or the tap it makes, as the root of the app sees
// it, at the time it happened: never the time a handler runs. `pointer`
// tells one finger from another; a tap made by a key is never filtered.
export type TapInput =
  | { kind: "press" | "move" | "release" | "cancel"; pointer: number; x: number; y: number; time: number }
  | { kind: "tap"; byKey: boolean };

// How near in time and place a press must be to the tap before it to be
// that tap's second, and how far a finger may move and still tap.
export type TapLimits = { window: number; reach: number; drag: number };

// A press less than half a second after a tap's release and less than
// 100 CSS pixels from it (docs/tap-safety.md); a sort card's drag begins
// after 8.
export const TAP_LIMITS: TapLimits = { window: 500, reach: 100, drag: 8 };

type Point = { x: number; y: number };
type Pressed = Point & { dragged: boolean };

// Tells each input whether it goes on to the app. A press near a tap's
// release, in time and place, is that tap's second: it and the rest of
// its touch, up to the tap it would make, are swallowed. A swallowed
// press keeps the window open from its own release, so a burst counts
// once. A drag opens no window. The filter knows nothing of screens.
export function tapFilter(limits: TapLimits = TAP_LIMITS): (input: TapInput) => boolean {
  // Where and when the last tap, or swallowed press, was released.
  let last: (Point & { time: number }) | undefined;
  const pressed = new Map<number, Pressed>();
  const swallowed = new Set<number>();
  // The tap a swallowed touch would make, still to come.
  let swallowTap = false;

  const apart = (from: Point, to: Point) => Math.hypot(to.x - from.x, to.y - from.y);

  return (input) => {
    if (input.kind === "tap") {
      if (input.byKey) return true;
      const keep = !swallowTap;
      swallowTap = false;
      return keep;
    }
    const { kind, pointer, time } = input;
    if (kind === "press") {
      swallowTap = false;
      if (last && time - last.time < limits.window && apart(last, input) < limits.reach) {
        swallowed.add(pointer);
        return false;
      }
      pressed.set(pointer, { x: input.x, y: input.y, dragged: false });
      return true;
    }
    if (swallowed.has(pointer)) {
      if (kind === "release") {
        swallowed.delete(pointer);
        last = { x: input.x, y: input.y, time };
        swallowTap = true;
      }
      if (kind === "cancel") swallowed.delete(pointer);
      return false;
    }
    const press = pressed.get(pointer);
    if (kind === "move") {
      if (press && apart(press, input) > limits.drag) press.dragged = true;
      return true;
    }
    pressed.delete(pointer);
    if (kind === "release" && press) last = press.dragged || apart(press, input) > limits.drag ? undefined : { x: input.x, y: input.y, time };
    if (kind === "cancel") last = undefined;
    return true;
  };
}
