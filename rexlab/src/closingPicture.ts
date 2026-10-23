import { TURN_PART, type Box, type PictureContinuation, type TurnFrame, type TurnMotionSeams } from "./turnMotion.ts";

// The screen transitions' clock, and the timing and easing of the
// picture shared between a card and its page; with `slide`, of the next
// or previous creature sliding in, its words `delay` after its picture.
export type PictureMotion = { now(): number; duration: number; easing: string; slide?: { duration: number; delay: number; distance: number } };

// The eased progress of a CSS `cubic-bezier()` at a fraction of its time,
// whose x is the time gone and y the progress; none for any other easing.
export function easedProgress(easing: string): ((fraction: number) => number) | undefined {
  const values = /^cubic-bezier\(([^)]+)\)$/.exec(easing)?.[1]?.split(",").map(Number);
  if (!values || values.length !== 4 || values.some((value) => !Number.isFinite(value))) return undefined;
  const [x1 = 0, y1 = 0, x2 = 1, y2 = 1] = values;
  const at = (t: number, a: number, b: number) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3;
  return (fraction) => {
    const elapsed = Math.max(0, Math.min(1, fraction));
    let low = 0;
    let high = 1;
    for (let step = 0; step < 40; step++) {
      const t = (low + high) / 2;
      if (at(t, x1, x2) < elapsed) low = t;
      else high = t;
    }
    return at((low + high) / 2, y1, y2);
  };
}

// A fixed copy avoids the clips and translations on the card and list, or
// on the stage. The laid-out picture keeps its space until the copy lands
// there. `marker` names what the copy is drawn for.
function drawPictureCopy(element: Element, box: Box, marker: string): TurnFrame {
  const image = element as HTMLElement;
  const copy = image.cloneNode(true) as HTMLElement;
  // The copy is drawn for the part, and is none itself.
  copy.removeAttribute(TURN_PART);
  copy.removeAttribute("id");
  copy.setAttribute("aria-hidden", "true");
  copy.setAttribute("inert", "");
  copy.setAttribute(marker, "");
  Object.assign(copy.style, {
    position: "fixed", left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`,
    maxWidth: "none", maxHeight: "none", margin: "0", zIndex: "100", objectFit: "contain", pointerEvents: "none", animation: "none", transition: "none"
  });
  // What the copy holds is drawn as it stands, none of it entering again.
  for (const inner of copy.querySelectorAll<HTMLElement>("*")) inner.style.animation = "none";
  const visibility = image.style.visibility;
  image.style.visibility = "hidden";
  image.ownerDocument.body.append(copy);
  return { element: copy, remove: () => { copy.remove(); image.style.visibility = visibility; } };
}

// Where the shared picture stands on each screen: on its card in the
// catalogue, and on the stage of its page.
const cardPicture = (id: string) => `.catalogue-card[data-id="${id}"] .catalogue-picture`;
const PAGE_PICTURE = ".dinosaur-stage-picture";

// The result's dinosaur, a part fitted whole in its own box.
const RESULT_PICTURE = ".result-hero";

// Find the pair's welcome's cards, each sized by their row's box.
const WELCOME_CARDS = ".pairs-hero";

// A card on find the pair's board, its footprints and name sized by its
// width.
const BOARD_CARD = ".pair-card";

// A card in sort's tray or in a basket, its picture and name sized by its
// width.
const SORT_CARDS = ".sort-card, .sorted-card";

// A card on the skeleton choice, its picture and name sized by its width.
const SKELETON_CHOICE = ".skeleton-choice";

// A dinosaur on find the pair's result, its art yielding to its name.
const FOUND_CARD = ".pairs-found-card";

// The page's picture as a turn resizes its stage, the result's dinosaur,
// the welcome's cards, a board's card, a found one and sort's cards as a
// turn resizes them. Laid out in place, each would take its new size at once, fitted
// in its new box, so a copy travels in a box that changes with it, as the
// closing picture does.
export function refitPicture(element: Element, box: Box): TurnFrame | undefined {
  const image = element.matches(".dinosaur-stage-art") ? element.querySelectorAll(PAGE_PICTURE)[0] : element.matches(`${RESULT_PICTURE}, ${WELCOME_CARDS}, ${BOARD_CARD}, ${FOUND_CARD}, ${SORT_CARDS}, ${SKELETON_CHOICE}`) ? element : undefined;
  return image ? drawPictureCopy(image, box, "data-fitted-picture") : undefined;
}

// The shared picture a screen transition is still drawing, from the page
// into its card as the page closes (`start`), or from its card into the
// page as it opens (`open`): `arrive` finds where it lands once the next
// screen shows, and `take` hands where it is drawn to a turn. A browser
// skips the screen transition as the window changes size, so the turn
// carries the picture on from there.
export function closingPicture({ parts, measure }: Pick<TurnMotionSeams, "parts" | "measure">, motion: PictureMotion) {
  // A duration or easing the stylesheet did not give leaves the picture
  // to its screen transition.
  const progressAt = Number.isFinite(motion.duration) && motion.duration > 0 ? easedProgress(motion.easing) : undefined;
  let moving: { id: string; from: Box; started: number; landing: string; target?: { element: Element; box: Box } } | undefined;
  const clear = () => { moving = undefined; };
  const leave = (id: string, from: string, landing: string) => {
    const element = parts.querySelectorAll(from)[0];
    moving = element ? { id, from: measure(element), started: motion.now(), landing } : undefined;
  };
  return {
    start: (id: string) => leave(id, PAGE_PICTURE, cardPicture(id)),
    open: (id: string) => leave(id, cardPicture(id), PAGE_PICTURE),
    arrive: (id: string | undefined) => {
      if (!moving || moving.id !== id) return clear();
      const element = parts.querySelectorAll(moving.landing)[0];
      if (element) moving.target = { element, box: measure(element) };
    },
    take: (): PictureContinuation | undefined => {
      const kept = moving;
      clear();
      if (!kept?.target || !progressAt) return undefined;
      const elapsed = motion.now() - kept.started;
      if (elapsed >= motion.duration) return undefined;
      const progress = progressAt(elapsed / motion.duration);
      const { element, box: target } = kept.target;
      const at = (key: keyof Box) => kept.from[key] + (target[key] - kept.from[key]) * progress;
      const box = { left: at("left"), top: at("top"), width: at("width"), height: at("height") };
      return { element, box, draw: (destination) => drawPictureCopy(element, destination, "data-closing-picture") };
    }
  };
}
