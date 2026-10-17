import { describe, expect, it } from "vitest";
import { mediaOrientation } from "../src/mediaOrientation.ts";
import { mediaQueries } from "./support.ts";

const PORTRAIT = "(orientation: portrait)";

describe("mediaOrientation", () => {
  it("reads portrait from the orientation media query and reports each change until unwatched", () => {
    const media = mediaQueries({ [PORTRAIT]: false });
    const orientation = mediaOrientation(media.matchMedia);
    const seen: boolean[] = [];

    const unwatch = orientation.watch(() => seen.push(orientation.portrait()));
    media.change(PORTRAIT, true);
    media.change(PORTRAIT, false);
    unwatch();
    media.change(PORTRAIT, true);

    expect(media.queries).toEqual([PORTRAIT]);
    expect(seen).toEqual([true, false]);
    expect(orientation.portrait()).toBe(true);
  });
});
