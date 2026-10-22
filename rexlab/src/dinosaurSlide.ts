import type { Step } from "./catalogue.ts";
import { easedProgress, type PictureMotion } from "./closingPicture.ts";
import type { PartShift, TurnMotionSeams } from "./turnMotion.ts";

// How far the slide keyframes (`slide-in` and its kin in app.css) move a
// creature's picture and words before --motion-amount scales it.
export const SLIDE_DISTANCE = 96;

// What slides as the next or previous creature takes the page: its
// picture, and its words, which start `slide.delay` later.
const SLIDING = [
  { selector: ".dinosaur-stage-art", late: false },
  { selector: ".dinosaur-about", late: true }
];

// The next or previous creature's picture and words as their slide in
// draws them, from the arrow's tap (`start`), handed to a turn (`take`).
// The slide runs on the view transition's snapshots, which leave the live
// page at rest where the turn measures it, and the browser skips it as
// the window changes size: the turn carries the slide on from there.
export function dinosaurSlide({ parts }: Pick<TurnMotionSeams, "parts">, motion: PictureMotion) {
  // A timing or easing the stylesheet did not give leaves the slide to its
  // view transition.
  const slide = motion.slide;
  const given = slide !== undefined && [slide.duration, slide.delay, slide.distance].every(Number.isFinite) && slide.duration > 0;
  const progressAt = given ? easedProgress(motion.easing) : undefined;
  let moving: { started: number; direction: number } | undefined;
  return {
    start: (way: Step) => {
      moving = { started: motion.now(), direction: way === "next" ? 1 : -1 };
    },
    take: (): PartShift[] => {
      const kept = moving;
      moving = undefined;
      if (!kept || !slide || !progressAt) return [];
      const elapsed = motion.now() - kept.started;
      if (elapsed >= slide.delay + slide.duration) return [];
      return SLIDING.flatMap(({ selector, late }) => {
        const element = parts.querySelectorAll(selector)[0];
        if (!element) return [];
        const progress = progressAt((elapsed - (late ? slide.delay : 0)) / slide.duration);
        return [{ element, offset: { x: kept.direction * slide.distance * (1 - progress), y: 0 }, opacity: progress }];
      });
    }
  };
}
