import { describe, expect, it } from "vitest";
import { mediaAppearance } from "../src/mediaAppearance.ts";
import { mediaQueries } from "./support.ts";

const DARK = "(prefers-color-scheme: dark)";

describe("mediaAppearance", () => {
  it("reads dark from the colour scheme media query and reports each change until unwatched", () => {
    const media = mediaQueries({ [DARK]: false });
    const appearance = mediaAppearance(media.matchMedia);
    const seen: boolean[] = [];
    expect(appearance.dark()).toBe(false);

    const unwatch = appearance.watch(() => seen.push(appearance.dark()));
    media.change(DARK, true);
    media.change(DARK, false);
    unwatch();
    media.change(DARK, true);

    expect(media.queries).toEqual([DARK]);
    expect(seen).toEqual([true, false]);
    expect(appearance.dark()).toBe(true);
  });
});
