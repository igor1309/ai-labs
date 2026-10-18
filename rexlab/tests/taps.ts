import { act } from "@testing-library/react";
import { onTestFinished } from "vitest";
import { filterDoubleTaps } from "../src/root.ts";

// docs/tap-safety.md, part 4: touches timed as a browser times them.

// Puts the double-tap filter before the app, on the window, as the app's
// entry does, for the rest of the test.
export function filterTaps() {
  onTestFinished(filterDoubleTaps(window));
}

export type Spot = { x?: number; y?: number; pointer?: number };

// A step of a touch, happening at `time` ms, as each event's own time.
function step(type: string, target: EventTarget, time: number, { x = 0, y = 0, pointer = 1 }: Spot) {
  const event = new PointerEvent(type, { clientX: x, clientY: y, pointerId: pointer, button: 0, pointerType: "touch", bubbles: true, cancelable: true });
  Object.defineProperty(event, "timeStamp", { value: time });
  act(() => {
    target.dispatchEvent(event);
  });
}

// A finger presses `target` at `time`; moves and the release go to the
// window, as a browser sends them to a touch's first target or above.
export const pressAt = (target: Element, time: number, spot: Spot = {}) => step("pointerdown", target, time, spot);
export const moveAt = (time: number, spot: Spot = {}) => step("pointermove", window, time, spot);
export const releaseAt = (target: EventTarget, time: number, spot: Spot = {}) => step("pointerup", target, time, spot);

// The click a touch makes on `target`, with the detail a pointer gives.
export function clickOf(target: Element, { x = 0, y = 0 }: Spot = {}) {
  act(() => {
    target.dispatchEvent(new MouseEvent("click", { clientX: x, clientY: y, detail: 1, bubbles: true, cancelable: true }));
  });
}

// A tap on `target`: pressed at `time`, released 50 ms later on the same
// spot, and its click.
export function tapAt(target: Element, time: number, spot: Spot = {}) {
  pressAt(target, time, spot);
  releaseAt(target, time + 50, spot);
  clickOf(target, spot);
}
