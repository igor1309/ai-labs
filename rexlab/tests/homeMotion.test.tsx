import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { homeMotion, type HomeMotionEnvironment } from "../src/homeMotion.ts";
import { renderHomePageFeaturing } from "./homePage.tsx";
import { openHomeApp } from "./skeletonsApp.tsx";
import { manualViewport } from "./support.ts";

function motionEnvironment() {
  let reveal = (_: HTMLElement) => {};
  let tiles: readonly HTMLElement[] = [];
  const stopVisible = vi.fn();
  const environment: HomeMotionEnvironment = {
    scrollToTop: vi.fn(),
    watchVisible: vi.fn((offered, update) => { tiles = offered; reveal = update; return stopVisible; })
  };
  return {
    environment, stopVisible,
    tiles: () => tiles,
    reveal: (tile: HTMLElement) => reveal(tile)
  };
}

// The drift is on the scroll timeline, so nothing is set from script as the page scrolls.
it("leaves the sky's drift to the stylesheet's scroll timeline", () => {
  const css = readFileSync(join(import.meta.dirname, "../src/app.css"), "utf8");
  const drift = /@supports \(animation-timeline: scroll\(\)\) \{\s*@media \(prefers-reduced-motion: no-preference\) \{([^}]*)\{([^}]*)\}/.exec(css);
  expect(drift?.[1]).toContain(".home-sky-body");
  expect(drift?.[1]).toContain(".home-today-art > *");
  expect(drift?.[1]).toContain(".home-today-art::before");
  expect(drift?.[1]).toContain(".home-today-art::after");
  expect(drift?.[2]).toContain("animation-timeline: scroll(root block)");
  expect(css).toMatch(/@keyframes home-sky-drift \{ to \{ translate: 0 calc\(1000px \* var\(--motion-amount\)\); \} \}/);
  expect(drift?.[2]).toContain("animation-range: 0px 2000px");
  renderHomePageFeaturing("compare", { motion: page => homeMotion(page, motionEnvironment().environment) });
  expect(document.querySelector<HTMLElement>(".home")!.getAttribute("style")).toBeNull();
});

it("reveals tiles only on first appearance, including keyboard focus, and disposes the visit's work", () => {
  const driver = motionEnvironment();
  const { unmount } = renderHomePageFeaturing("compare", { allGames: true, motion: page => homeMotion(page, driver.environment) });
  const page = document.querySelector<HTMLElement>(".home")!;
  const tiles = driver.tiles();
  expect(tiles).toEqual([...page.querySelectorAll(".home-ground-tile")]);
  expect(tiles.every(tile => tile.dataset.homeEntrance === "pending")).toBe(true);
  expect(tiles.map(tile => getComputedStyle(tile).opacity)).toEqual(tiles.map(() => "0"));
  for (const tile of tiles.slice(0, 3)) driver.reveal(tile);
  expect(tiles.slice(0, 3).every(tile => tile.dataset.homeEntrance === "revealed")).toBe(true);
  expect(tiles.slice(3).every(tile => tile.dataset.homeEntrance === "pending")).toBe(true);
  driver.reveal(tiles[0]!);
  expect(tiles[0]!.dataset.homeEntrance).toBe("revealed");
  fireEvent.focusIn(tiles[3]!);
  expect(tiles[3]!.dataset.homeEntrance).toBe("revealed");
  unmount();
  expect(driver.stopVisible).toHaveBeenCalledOnce();
});

// React's development check runs a page's effects a second time on the same
// tiles; a tile already in view must not drop back and rise again.
it("leaves revealed tiles revealed when it starts again on the same page", () => {
  const driver = motionEnvironment();
  renderHomePageFeaturing("compare", { allGames: true, motion: page => homeMotion(page, driver.environment) });
  const page = document.querySelector<HTMLElement>(".home")!;
  const tiles = driver.tiles();
  driver.reveal(tiles[0]!);
  const again = motionEnvironment();
  const stop = homeMotion(page, again.environment);
  expect(again.tiles()).toEqual(tiles);
  expect(tiles[0]!.dataset.homeEntrance).toBe("revealed");
  expect(tiles.slice(1).every(tile => tile.dataset.homeEntrance === "pending")).toBe(true);
  again.reveal(tiles[1]!);
  expect(tiles[1]!.dataset.homeEntrance).toBe("revealed");
  stop();
  expect(again.stopVisible).toHaveBeenCalledOnce();
});

it("keeps the same motion visit through turns and menu changes, and starts a fresh visit at the top on return", async () => {
  const driver = motionEnvironment();
  const viewport = manualViewport("landscape");
  const motion = vi.fn((page: HTMLElement) => homeMotion(page, driver.environment));
  const { user } = openHomeApp({ viewport, reducedMotion: true, homeMotion: motion, portraitLayouts: { home: ["tall", "tall-narrow"] } });
  const firstTile = driver.tiles()[0]!;
  driver.reveal(firstTile);
  fireEvent.click(screen.getByRole("button", { name: "Theme" }));
  for (const size of ["tall", "tall-narrow", "wide-short", "wide"] as const) {
    act(() => viewport.resize(size, size.startsWith("tall")));
    expect(firstTile.dataset.homeEntrance).toBe("revealed");
    expect(screen.getByRole("menu", { name: "Theme" })).toBeTruthy();
  }
  expect(motion).toHaveBeenCalledOnce();
  expect(driver.environment.scrollToTop).toHaveBeenCalledOnce();
  fireEvent.click(document.querySelector(".menu-backdrop")!);
  await user.click(screen.getByRole("button", { name: "EXPLORE" }));
  expect(driver.stopVisible).toHaveBeenCalledOnce();
  await user.click(screen.getByRole("button", { name: "HOME" }));
  expect(motion).toHaveBeenCalledTimes(2);
  expect(driver.environment.scrollToTop).toHaveBeenCalledTimes(2);
  expect(driver.tiles()[0]).not.toBe(firstTile);
});
