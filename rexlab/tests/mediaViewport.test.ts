import { describe, expect, it } from "vitest";
import { mediaViewport } from "../src/mediaViewport.ts";
import { manualScreenOrientation, mediaQueries } from "./support.ts";

const PORTRAIT = "(orientation: portrait)";
const NARROW = "(max-width: 599.98px)";
const SHORT = "(max-height: 599.98px)";

describe("the browser viewport", () => {
  it.each([
    [1180, 820, "wide"], [820, 1180, "tall"],
    [1440, 900, "wide"], [1440, 560, "wide-short"],
    [852, 393, "wide-short"], [393, 852, "tall-narrow"],
    [600, 900, "tall"], [599, 900, "tall-narrow"],
    [900, 800, "wide"], [800, 800, "tall"],
    [1000, 600, "wide"], [1000, 599, "wide-short"],
    [599, 599, "tall-narrow"], [600, 600, "tall"]
  ])("classifies a %i by %i window as %s", (width, height, size) => {
    const media = mediaQueries({ [PORTRAIT]: height >= width, [NARROW]: width < 600, [SHORT]: height < 600 });
    const viewport = mediaViewport(media.matchMedia, undefined);
    expect(viewport.sizeClass()).toBe(size);
    expect(media.queries).toEqual([PORTRAIT, NARROW, SHORT]);
  });

  it.each(["portrait-primary", "portrait-secondary", "landscape-primary", "landscape-secondary"] as const)(
    "reads %s independently of a portrait window", (type) => {
      const media = mediaQueries({ [PORTRAIT]: true, [NARROW]: false, [SHORT]: false });
      const screen = manualScreenOrientation(type);
      const viewport = mediaViewport(media.matchMedia, screen.orientation);
      expect(viewport.sizeClass()).toBe("tall");
      expect(viewport.isScreenUpright()).toBe(type.startsWith("portrait"));
    }
  );
});
