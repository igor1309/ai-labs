import { describe, expect, it } from "vitest";
import { mediaOrientation } from "../src/mediaOrientation.ts";
import { portraitQuery } from "./support.ts";

describe("mediaOrientation", () => {
  it("reads portrait from the orientation media query and reports each change until unwatched", () => {
    const media = portraitQuery(false);
    const orientation = mediaOrientation(media.matchMedia);
    const seen: boolean[] = [];

    const unwatch = orientation.watch(() => seen.push(orientation.portrait()));
    media.change(true);
    media.change(false);
    unwatch();
    media.change(true);

    expect(media.queries).toEqual(["(orientation: portrait)"]);
    expect(seen).toEqual([true, false]);
    expect(orientation.portrait()).toBe(true);
  });
});
