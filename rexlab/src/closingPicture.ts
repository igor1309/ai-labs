import type { Box, PictureContinuation, TurnFrame, TurnMotionSeams } from "./turnMotion.ts";

export type PictureMotion = { now(): number; duration: number; easing: string };

// The eased progress of a CSS `cubic-bezier()` at a fraction of its time,
// whose x is the time gone and y the progress; none for any other easing.
function easedProgress(easing: string): ((fraction: number) => number) | undefined {
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

// A fixed copy avoids the clips and translations on the card and list.
// The laid-out picture keeps its space until the copy lands there.
function drawClosingPicture(element: Element, box: Box): TurnFrame {
  const image = element as HTMLElement;
  const copy = image.cloneNode(true) as HTMLElement;
  copy.removeAttribute("id");
  copy.setAttribute("aria-hidden", "true");
  copy.setAttribute("inert", "");
  copy.setAttribute("data-closing-picture", "");
  Object.assign(copy.style, {
    position: "fixed", left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`,
    maxWidth: "none", maxHeight: "none", margin: "0", zIndex: "100", objectFit: "contain", pointerEvents: "none", animation: "none", transition: "none"
  });
  const visibility = image.style.visibility;
  image.style.visibility = "hidden";
  image.ownerDocument.body.append(copy);
  return { element: copy, remove: () => { copy.remove(); image.style.visibility = visibility; } };
}

export function closingPicture({ parts, measure }: Pick<TurnMotionSeams, "parts" | "measure">, motion: PictureMotion) {
  // A duration or easing the stylesheet did not give leaves the picture
  // to its screen transition.
  const progressAt = Number.isFinite(motion.duration) && motion.duration > 0 ? easedProgress(motion.easing) : undefined;
  let close: { id: string; from: Box; started: number; target?: { element: Element; box: Box } } | undefined;
  const clear = () => { close = undefined; };
  return {
    start: (id: string) => {
      const page = parts.querySelectorAll(".dinosaur-stage-picture")[0];
      close = page ? { id, from: measure(page), started: motion.now() } : undefined;
    },
    arrive: (id: string | undefined) => {
      if (!close || close.id !== id) return clear();
      const element = parts.querySelectorAll(`.catalogue-card[data-id="${id}"] .catalogue-picture`)[0];
      if (element) close.target = { element, box: measure(element) };
    },
    take: (): PictureContinuation | undefined => {
      const kept = close;
      clear();
      if (!kept?.target || !progressAt) return undefined;
      const elapsed = motion.now() - kept.started;
      if (elapsed >= motion.duration) return undefined;
      const progress = progressAt(elapsed / motion.duration);
      const { element, box: target } = kept.target;
      const at = (key: keyof Box) => kept.from[key] + (target[key] - kept.from[key]) * progress;
      const box = { left: at("left"), top: at("top"), width: at("width"), height: at("height") };
      return { element, box, draw: (destination) => drawClosingPicture(element, destination) };
    }
  };
}
