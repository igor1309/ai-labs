import { describe, expect, it } from "vitest";
import { mediaViewport } from "../src/mediaViewport.ts";
import { manualScreenOrientation, manualWindow, mediaQueries, rootInsets } from "./support.ts";

const PORTRAIT = "(orientation: portrait)";
const NARROW = "(max-width: 599.98px)";
const SHORT = "(max-height: 599.98px)";

// The page's root, whose style alone the viewport reads, and that style
// in a window with no side safe-area insets. The tests run without a DOM.
const ROOT = {} as Element;
const rootStyle = () => rootInsets(ROOT).getComputedStyle(ROOT);

describe("the browser viewport", () => {
  it.each([
    [1180, 820, "wide"], [820, 1180, "tall"],
    [1440, 900, "wide"], [1440, 560, "wide-short"],
    [852, 393, "wide-short"], [393, 852, "tall-narrow"],
    [600, 900, "tall"], [599, 900, "tall-narrow"],
    [900, 800, "wide"], [800, 800, "tall"],
    [1000, 600, "wide"], [1000, 599, "wide-short"],
    [599, 599, "tall-narrow"], [600, 600, "tall"],
    [568, 320, "wide-short"], [567, 320, "tall-narrow"], [480, 320, "tall-narrow"]
  ])("classifies a %i by %i window as %s", (width, height, size) => {
    const media = mediaQueries({ [PORTRAIT]: height >= width, [NARROW]: width < 600, [SHORT]: height < 600 });
    const viewport = mediaViewport(media.matchMedia, undefined, manualWindow(width), rootStyle);
    expect(viewport.sizeClass()).toBe(size);
    expect(media.queries).toEqual([PORTRAIT, NARROW, SHORT]);
  });

  it.each(["portrait-primary", "portrait-secondary", "landscape-primary", "landscape-secondary"] as const)(
    "reads %s independently of a portrait window", (type) => {
      const media = mediaQueries({ [PORTRAIT]: true, [NARROW]: false, [SHORT]: false });
      const screen = manualScreenOrientation(type);
      const viewport = mediaViewport(media.matchMedia, screen.orientation, manualWindow(820), rootStyle);
      expect(viewport.sizeClass()).toBe("tall");
      expect(viewport.isScreenUpright()).toBe(type.startsWith("portrait"));
    }
  );

  it("reads the window's width, and tells of each resize until unsubscribed", () => {
    const media = mediaQueries({ [PORTRAIT]: true, [NARROW]: false, [SHORT]: false });
    const window = manualWindow(744);
    const viewport = mediaViewport(media.matchMedia, undefined, window, rootStyle);
    const seen: number[] = [];
    expect(viewport.width()).toBe(744);

    const unsubscribe = viewport.subscribe(() => seen.push(viewport.width()));
    window.resize(712);
    window.resize(600);
    unsubscribe();
    window.resize(1032);

    expect(seen).toEqual([712, 600]);
    expect(viewport.width()).toBe(1032);
  });

  it("exposes room reserved by a vertical scrollbar separately from the window width", () => {
    const media = mediaQueries({ [PORTRAIT]: true, [NARROW]: false, [SHORT]: false });
    const viewport = mediaViewport(media.matchMedia, undefined, manualWindow(600), rootStyle, () => 16);

    expect([viewport.width(), viewport.scrollbarWidth?.()]).toEqual([600, 16]);
  });

  it("reads the window's side safe-area insets from the root's style each time, as app.css sets them there", () => {
    const media = mediaQueries({ [PORTRAIT]: true, [NARROW]: false, [SHORT]: false });
    let root = rootInsets(ROOT, { left: 44, right: 0 });
    const viewport = mediaViewport(media.matchMedia, undefined, manualWindow(820), () => root.getComputedStyle(ROOT));
    expect(viewport.sideInsets()).toEqual({ left: 44, right: 0 });

    root = rootInsets(ROOT, { left: 0, right: 47 });

    expect(viewport.sideInsets()).toEqual({ left: 0, right: 47 });
  });

  it("reads no inset where the root's style sets none", () => {
    const media = mediaQueries({ [PORTRAIT]: true, [NARROW]: false, [SHORT]: false });
    const viewport = mediaViewport(media.matchMedia, undefined, manualWindow(820), () => ({ getPropertyValue: () => "" }));

    expect(viewport.sideInsets()).toEqual({ left: 0, right: 0 });
  });
});
