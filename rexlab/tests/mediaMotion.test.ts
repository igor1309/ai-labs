import { describe, expect, it } from "vitest";
import { mediaReducedMotion } from "../src/mediaMotion.ts";
import { mediaQueries } from "./support.ts";

const REDUCED = "(prefers-reduced-motion: reduce)";

describe("mediaReducedMotion", () => {
  it("reads reduced motion from its media query each time it is asked", () => {
    const media = mediaQueries({ [REDUCED]: false });
    const reduced = mediaReducedMotion(media.matchMedia);
    expect(reduced()).toBe(false);

    media.change(REDUCED, true);

    expect(reduced()).toBe(true);
    expect(media.queries).toEqual([REDUCED]);
  });
});
