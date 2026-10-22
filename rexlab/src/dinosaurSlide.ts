import { easedProgress, type PictureMotion } from "./closingPicture.ts";
import { TURN_PART, type PartOrigin, type TurnMotionSeams } from "./turnMotion.ts";

// View-transition snapshots leave the live page at rest. Keep the incoming
// parts' resting boxes before a resize, and hand their snapshot translation
// and fade to the turn when the browser drops those snapshots.
export function dinosaurSlide({ parts, measure }: Pick<TurnMotionSeams, "parts" | "measure">, motion: PictureMotion) {
  const ease = easedProgress(motion.easing);
  let moving: { started: number; direction: number; resting: PartOrigin[] } | undefined;
  return {
    start: (way: "next" | "previous") => {
      moving = { started: motion.now(), direction: way === "next" ? 1 : -1, resting: [] };
    },
    arrive: () => {
      if (!moving) return;
      moving.resting = [...parts.querySelectorAll(`[${TURN_PART}]`)]
        .filter((element) => element.matches(".dinosaur-stage-art, .dinosaur-about, .dinosaur-about [data-turn-part]"))
        .map((element) => ({ element, box: measure(element), opacity: 1 }));
    },
    clear: () => { moving = undefined; },
    take: (): PartOrigin[] => {
      const kept = moving;
      moving = undefined;
      const timing = motion.slide;
      if (!kept || !timing || !ease) return [];
      const elapsed = motion.now() - kept.started;
      if (elapsed >= timing.duration + timing.delay) return [];
      return kept.resting.map(({ element, box }) => {
        const picture = element.matches(".dinosaur-stage-art");
        const progress = ease((elapsed - (picture ? 0 : timing.delay)) / timing.duration);
        return {
          element,
          box: { ...box, left: box.left + kept.direction * timing.distance * (1 - progress) },
          opacity: picture || element.matches(".dinosaur-about") ? progress : 1
        };
      });
    }
  };
}
