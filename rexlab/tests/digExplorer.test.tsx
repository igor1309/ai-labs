import { act, fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GUST, STAR_LANDS } from "../src/digGame.tsx";
import { PICTURE_LIMIT } from "../src/Picture.tsx";
import { TEXTS } from "../src/language/texts.ts";
import { board, cleared, drag, openDigApp, placeBoard } from "./digApp.tsx";
import { SHIPPED_DIG, homeTile, manualPictures } from "./support.ts";

const rex = SHIPPED_DIG.find(({ id }) => id === "tyrannosaurus")!;
const cards = () => [...document.querySelectorAll<HTMLElement>(".dig-find-card")];
const ids = (attribute: string) => cards().filter((card) => card.hasAttribute(attribute)).map((card) => card.dataset.spot);
const helped = () => board().getAttribute("data-helped")?.split(" ").filter(Boolean);
const found = () => board().getAttribute("data-found")?.split(" ").filter(Boolean);

function openRound(options: Parameters<typeof openDigApp>[0] = {}) {
  const app = openDigApp(options);
  fireEvent.click(homeTile(TEXTS[options?.language ?? "en"].dig));
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

describe("Explorer's board", () => {
  it.each(["en", "ru"] as const)("shows three round body close-ups and their %s words, with a 36 CSS pixel brush", (language) => {
    openRound({ language });
    expect(cards().map((card) => card.textContent)).toEqual(["eye", "claw", "foot"].map((kind) => TEXTS[language].spotKinds[kind as "eye" | "claw" | "foot"]));
    expect(board().style.getPropertyValue("--brush")).toBe("36px");
    cards().forEach((card, at) => {
      const spot = rex.spots[at]!;
      const disc = card.querySelector<HTMLElement>(".dig-spot-picture")!;
      const image = disc.querySelector("img")!;
      expect(image.getAttribute("src")).toBe("/pictures/tyrannosaurus.webp");
      expect(getComputedStyle(disc).borderRadius).toBe("50%");
      expect(parseFloat(disc.style.getPropertyValue("--crop-width")) * (2 * spot.r) / 100).toBe(800);
      expect(parseFloat(disc.style.getPropertyValue("--crop-left")) * (2 * spot.r) / 100).toBeCloseTo(spot.r - spot.x);
    });
    expect([found(), helped(), board().getAttribute("data-help-shown")]).toEqual([[], [], "false"]);
  });

  it.each([false, true])("ticks in any order, celebrates once, and reveals only after all three, reduced motion %s", (reducedMotion) => {
    const app = openRound({ reducedMotion });
    find("foot");
    expect(found()).toEqual(["foot"]);
    expect(ids("data-found")).toEqual(["foot"]);
    expect(screen.getByLabelText("DUG UP").textContent).toBe(`0/${SHIPPED_DIG.length}`);
    expect(cards()[2]?.querySelector(".dig-find-tick")).not.toBeNull();
    const pop = board().querySelector(".dig-find-pop")!;
    expect(pop.querySelector(".dig-detail-star")).not.toBeNull();
    expect(pop.querySelector(".dig-detail-sparkle") !== null).toBe(!reducedMotion);
    expect(pop.hasAttribute("data-motion")).toBe(!reducedMotion);
    expect(getComputedStyle(pop).animation).toContain(reducedMotion ? "dig-detail-fade" : "dig-detail-pop");
    // React uses WebKit's event name when jsdom has no AnimationEvent.
    fireEvent(pop, new Event("webkitAnimationEnd", { bubbles: true }));
    find("foot", 20_000);
    expect(board().querySelector(".dig-find-pop")).toBeNull();
    // Orientation remounts the board, without repeating a previous find.
    act(() => app.orientation.turn("portrait"));
    act(() => app.orientation.turn("landscape"));
    placeBoard(800);
    expect(board().querySelector(".dig-find-pop")).toBeNull();
    expect(ids("data-found")).toEqual(["foot"]);
    find("eye", 30_000);
    expect(found()).toEqual(["eye", "foot"]);
    expect(board().hasAttribute("data-blown")).toBe(false);
    find("claw", 40_000);
    expect(found()).toEqual(["eye", "claw", "foot"]);
    expect(board().hasAttribute("data-blown")).toBe(true);
    expect(cleared()).toBeLessThan(0.7);
    expect(app.timers.timers()).toEqual([GUST[reducedMotion ? "reduced" : "motion"]]);
    act(() => app.timers.fire(GUST[reducedMotion ? "reduced" : "motion"]));
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("TYRANNOSAURUS");
    expect(screen.getByRole("region", { name: "DUG UP" }).textContent).toContain(`1/${SHIPPED_DIG.length}`);
    act(() => app.timers.fire(STAR_LANDS[reducedMotion ? "reduced" : "motion"]));
  });
});

describe("Explorer help", () => {
  it.each([false, true])("thins each next spot after ten quiet seconds, preserving sand counts, reduced motion %s", (reducedMotion) => {
    const app = openRound({ reducedMotion });
    const clear = board().getAttribute("data-clear");
    for (const [at, kind] of ["eye", "claw", "foot"].entries()) {
      spend(app, 9);
      expect(helped()).toHaveLength(at);
      drag([[300, 200], [330, 200]], 1000 + at * 1000);
      spend(app, 1);
      expect(helped()).toEqual(["eye", "claw", "foot"].slice(0, at + 1));
      expect(ids("data-pulse")).toEqual(reducedMotion ? [] : helped());
      expect(getComputedStyle(cards()[at]!).animation).toContain(reducedMotion ? "fade-in" : "dig-card-pulse");
      const window = board().querySelector(`.dig-help-window[data-spot="${kind}"]`)!;
      expect(window.hasAttribute("data-motion")).toBe(!reducedMotion);
      expect(getComputedStyle(window).animation).toContain("fade-in");
    }
    expect([found(), board().getAttribute("data-help-shown"), board().hasAttribute("data-blown")]).toEqual([[], "true", false]);
    expect(app.timers.timers()).toEqual([]);
    expect(board().getAttribute("data-clear")).not.toBe(clear);
    // Help leaves a spot's cells covered even when its picture shows.
    const spot = rex.spots[0]!;
    const rows = board().getAttribute("data-clear")!.split(" ");
    expect(rows[Math.floor(spot.y / 20)]?.[Math.floor(spot.x / 20)]).toBe("0");
  });

  it("keeps help until its own find, and resets the wait after another find without reusing help", () => {
    const app = openRound();
    spend(app, 10);
    spend(app, 9);
    find("claw");
    act(() => app.timers.deliverStopped(1000));
    expect(helped()).toEqual(["eye"]);
    expect(board().querySelectorAll(".dig-help-window")).toHaveLength(1);
    spend(app, 9);
    expect(helped()).toEqual(["eye"]);
    spend(app, 1);
    expect(helped()).toEqual(["eye", "foot"]);
    find("eye", 20_000);
    expect([...board().querySelectorAll<HTMLElement>(".dig-help-window")].map((element) => element.dataset.spot)).toEqual(["foot"]);
    expect(board().getAttribute("data-help-shown")).toBe("true");
    expect(ids("data-pulse")).toEqual(["foot"]);
  });

  it.each(["hidden", "portrait"] as const)("pauses in %s, retaining elapsed seconds and ignoring stopped callbacks", (pause) => {
    const app = openRound();
    spend(app, 4);
    act(() => pause === "hidden" ? app.visibility.switchTo("hidden") : app.orientation.turn("portrait"));
    expect(app.timers.timers()).toEqual([]);
    act(() => app.timers.deliverStopped(1000));
    act(() => pause === "hidden" ? app.visibility.switchTo("visible") : app.orientation.turn("landscape"));
    placeBoard(800);
    act(() => app.timers.deliverStopped(1000));
    spend(app, 5);
    expect(helped()).toEqual([]);
    spend(app, 1);
    expect(helped()).toEqual(["eye"]);
  });

  it("stops on HOME and does not advance the next visit when an old tick arrives", () => {
    const app = openRound();
    spend(app, 9);
    fireEvent.click(screen.getByRole("button", { name: "HOME" }));
    expect(app.timers.timers()).toEqual([]);
    fireEvent.click(homeTile("DIG"));
    act(() => app.timers.deliverStopped(1000));
    spend(app, 9);
    expect(helped()).toEqual([]);
    spend(app, 1);
    expect(helped()).toEqual(["eye"]);
    app.unmount();
    expect(app.timers.timers()).toEqual([]);
  });
});

describe("close-up loading", () => {
  it.each(["loaded", "failed", "late"] as const)("starts at once with shimmering discs, then shows the %s look, and still finds spots", (outcome) => {
    const pictures = manualPictures();
    const app = openRound({ timers: pictures });
    const looks = () => cards().map((card) => card.querySelector("img")?.getAttribute("data-picture"));
    expect(looks()).toEqual(["loading", "loading", "loading"]);
    const url = "/pictures/tyrannosaurus.webp";
    act(() => outcome === "loaded" ? pictures.finish(url) : outcome === "failed" ? pictures.fail(url) : pictures.fire(PICTURE_LIMIT));
    expect(looks()).toEqual(Array(3).fill(outcome === "loaded" ? "appearing" : "failed"));
    find("eye");
    expect(found()).toEqual(["eye"]);
    expect(cards()[0]?.querySelector(".dig-find-tick")).not.toBeNull();
    app.unmount();
  });
});
