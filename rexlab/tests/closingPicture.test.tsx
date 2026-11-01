import { describe, expect, it } from "vitest";
import { closingPicture } from "../src/closingPicture.ts";
import type { Box } from "../src/turnMotion.ts";

// A page picture and the card picture it closes into, at fixed boxes.
function closing(duration: number, easing: string) {
  const page = Object.assign(document.createElement("img"), { className: "dinosaur-stage-picture" });
  const card = Object.assign(document.createElement("div"), { className: "catalogue-card" });
  card.dataset.id = "baryonyx";
  const picture = Object.assign(document.createElement("img"), { className: "catalogue-picture" });
  card.append(picture);
  const root = document.createElement("div");
  root.append(page);
  const boxes = new Map<Element, Box>([[page, { left: 80, top: 140, width: 620, height: 500 }], [picture, { left: 72, top: 140, width: 200, height: 126 }]]);
  let clock = 0;
  const kept = closingPicture({ parts: root, measure: (element) => boxes.get(element)! }, { now: () => clock, duration, easing });
  kept.start("baryonyx");
  page.remove();
  root.append(card);
  kept.arrive("baryonyx");
  clock = duration / 2;
  return kept;
}

describe("the closing picture's timing", () => {
  it("is drawn half way in time at the eased progress the stylesheet's curve gives", () => {
    const taken = closing(320, "cubic-bezier(0, 0, 1, 1)")?.take();
    expect(taken?.box).toEqual({ left: expect.closeTo(76, 6), top: 140, width: expect.closeTo(410, 6), height: expect.closeTo(313, 6) });
  });

  it.each([
    [320, ""],
    [320, "ease-out"],
    [Number.NaN, "cubic-bezier(0.22, 1, 0.36, 1)"],
    [0, "cubic-bezier(0.22, 1, 0.36, 1)"]
  ])("leaves the picture to its screen transition for a duration of %s and easing %j", (duration, easing) => {
    expect(closing(duration, easing).take()).toBeUndefined();
  });
});
