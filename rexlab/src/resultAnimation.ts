import type { StartTimer } from "./ownedTimers.ts";

// Read the running CSS animations so reward order and dismissal follow
// the stylesheet, including the device's reduced-motion timings.
export function afterResultAnimations(elements: readonly Element[], startTimer: StartTimer, done: () => void): () => void {
  const remaining = elements.flatMap((element) => element.getAnimations()).map((animation) => {
    const end = Number(animation.effect?.getComputedTiming().endTime ?? 0);
    return Math.max(0, end - Number(animation.currentTime ?? 0));
  });
  let active = true;
  const stop = startTimer(Math.max(0, ...remaining), () => {
    if (active) done();
  });
  return () => {
    active = false;
    stop();
  };
}
