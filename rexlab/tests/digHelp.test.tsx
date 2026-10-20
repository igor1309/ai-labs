import { act, fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PICTURE_LIMIT } from "../src/Picture.tsx";
import { TEXTS } from "../src/language/texts.ts";
import { board, drag, openDigApp, placeBoard } from "./digApp.tsx";
import { SHIPPED_DIG, homeTile, manualPictures } from "./support.ts";

type Level = "hatchling" | "explorer" | "paleontologist";

// Tyrannosaurus is under the sand, its spots helped in their own order.
const rex = SHIPPED_DIG.find(({ id }) => id === "tyrannosaurus")!;
const order = rex.spots.map(({ kind }) => kind);
const helped = () => board().getAttribute("data-helped")?.split(" ").filter(Boolean);
const found = () => board().getAttribute("data-found")?.split(" ").filter(Boolean);
const windows = () => [...board().querySelectorAll<HTMLElement>(".dig-help-window")].map((element) => element.dataset.spot);

function openRound(level: Level = "explorer", options: Parameters<typeof openDigApp>[0] = {}) {
  const app = openDigApp({ ageLevel: { level, revision: null }, ...options });
  fireEvent.click(homeTile(TEXTS.en.dig));
  placeBoard(800);
  return app;
}

function spend(app: ReturnType<typeof openRound>, seconds: number) {
  for (let second = 0; second < seconds; second++) act(() => app.timers.fire(1000));
}

function find(kind: string, time = 1000) {
  const spot = rex.spots.find((spot) => spot.kind === kind)!;
  for (let y = spot.y - spot.r; y <= spot.y + spot.r; y += 20) {
    drag([[spot.x - spot.r, y], [spot.x + spot.r, y]], time);
    time += 1000;
  }
}

describe.each(["hatchling", "explorer", "paleontologist"] as const)("help at %s", (level) => {
  it.each([false, true])("thins each next spot after ten quiet seconds, clearing and finding nothing, reduced motion %s", (reducedMotion) => {
    const app = openRound(level, { reducedMotion });
    for (const [at, kind] of order.entries()) {
      spend(app, 9);
      expect(helped()).toEqual(order.slice(0, at));
      spend(app, 1);
      expect(helped()).toEqual(order.slice(0, at + 1));
      const window = board().querySelector<HTMLElement>(`.dig-help-window[data-spot="${kind}"]`)!;
      expect(window.hasAttribute("data-motion")).toBe(!reducedMotion);
      expect(getComputedStyle(window).animation).toContain("fade-in");
    }
    expect([found(), board().getAttribute("data-cleared"), board().hasAttribute("data-blown"), app.timers.timers()]).toEqual([[], "0", false, []]);
    // The window shows the spot's own crop of the body picture.
    const spot = rex.spots[0]!;
    const disc = board().querySelector<HTMLElement>(`.dig-help-window[data-spot="${spot.kind}"] .dig-spot-picture`)!;
    expect(disc.querySelector("img")?.getAttribute("src")).toBe("/pictures/tyrannosaurus.webp");
    expect(getComputedStyle(disc).borderRadius).toBe("50%");
    expect(parseFloat(disc.style.getPropertyValue("--crop-width")) * (2 * spot.r) / 100).toBe(800);
    expect(parseFloat(disc.style.getPropertyValue("--crop-left")) * (2 * spot.r) / 100).toBeCloseTo(spot.r - spot.x);
  });
});

describe("help's wait", () => {
  it("starts again when brushing clears more of the dinosaur, not when it brushes sand already clear or off it", () => {
    const app = openRound();
    spend(app, 9);
    drag([[300, 200], [330, 200]], 1000);
    spend(app, 9);
    expect(helped()).toEqual([]);
    drag([[300, 200], [330, 200]], 2000);
    drag([[10, 10], [30, 10]], 3000);
    spend(app, 1);
    expect(helped()).toEqual([order[0]]);
  });

  it("skips a spot already found, and takes a helped spot's window away at its find", () => {
    const app = openRound();
    find(order[0]!);
    spend(app, 10);
    expect([found(), helped(), windows()]).toEqual([[order[0]], [order[1]], [order[1]]]);
    find(order[1]!, 20_000);
    expect(windows()).toEqual([]);
    spend(app, 10);
    expect(helped()).toEqual([order[1], order[2]]);
  });

  it.each(["hidden", "portrait"] as const)("pauses in %s, keeping the seconds waited and ignoring stopped callbacks", (pause) => {
    const app = openRound();
    spend(app, 4);
    act(() => (pause === "hidden" ? app.visibility.switchTo("hidden") : app.orientation.turn("portrait")));
    expect(app.timers.timers()).toEqual([]);
    act(() => app.timers.deliverStopped(1000));
    act(() => (pause === "hidden" ? app.visibility.switchTo("visible") : app.orientation.turn("landscape")));
    placeBoard(800);
    act(() => app.timers.deliverStopped(1000));
    spend(app, 5);
    expect(helped()).toEqual([]);
    spend(app, 1);
    expect(helped()).toEqual([order[0]]);
  });

  it("stops on HOME and does not hurry the next visit when an old tick arrives", () => {
    const app = openRound();
    spend(app, 9);
    fireEvent.click(screen.getByRole("button", { name: "HOME" }));
    expect(app.timers.timers()).toEqual([]);
    fireEvent.click(homeTile("DIG"));
    act(() => app.timers.deliverStopped(1000));
    spend(app, 9);
    expect(helped()).toEqual([]);
    spend(app, 1);
    expect(helped()).toEqual([order[0]]);
    app.unmount();
    expect(app.timers.timers()).toEqual([]);
  });

  it.each(["loaded", "failed", "late"] as const)("shows the %s look in a helped window", (outcome) => {
    const pictures = manualPictures();
    const app = openRound("explorer", { timers: pictures });
    spend(app, 10);
    const look = () => board().querySelector(".dig-help-window img")?.getAttribute("data-picture");
    expect(look()).toBe("loading");
    const url = "/pictures/tyrannosaurus.webp";
    act(() => (outcome === "loaded" ? pictures.finish(url) : outcome === "failed" ? pictures.fail(url) : pictures.fire(PICTURE_LIMIT)));
    expect(look()).toBe(outcome === "loaded" ? "appearing" : "failed");
  });
});

describe("a find", () => {
  it.each([false, true])("celebrates each spot once where it lies, in any order, reduced motion %s", (reducedMotion) => {
    const app = openRound("explorer", { reducedMotion });
    find("foot");
    expect(found()).toEqual(["foot"]);
    const pop = board().querySelector<HTMLElement>(".dig-find-pop")!;
    expect(pop.dataset.spot).toBe("foot");
    expect(pop.querySelector(".dig-detail-star")).not.toBeNull();
    expect(pop.querySelector(".dig-detail-sparkle") !== null).toBe(!reducedMotion);
    expect(pop.hasAttribute("data-motion")).toBe(!reducedMotion);
    expect(getComputedStyle(pop).animation).toContain(reducedMotion ? "dig-detail-fade" : "dig-detail-pop");
    // React uses WebKit's event name when jsdom has no AnimationEvent.
    fireEvent(pop, new Event("webkitAnimationEnd", { bubbles: true }));
    find("foot", 20_000);
    expect(board().querySelector(".dig-find-pop")).toBeNull();
    // Orientation remounts the board, without repeating an earlier find.
    act(() => app.orientation.turn("portrait"));
    act(() => app.orientation.turn("landscape"));
    placeBoard(800);
    expect(board().querySelector(".dig-find-pop")).toBeNull();
    find("eye", 30_000);
    expect(found()).toEqual(order.filter((kind) => kind === "eye" || kind === "foot"));
    expect(board().hasAttribute("data-blown")).toBe(false);
  });
});
