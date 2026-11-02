import { act, fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { homeMotion, type HomeMotionEnvironment } from "../src/homeMotion.ts";
import { renderHomePageFeaturing } from "./homePage.tsx";
import { openHomeApp } from "./skeletonsApp.tsx";
import { manualViewport } from "./support.ts";

function motionEnvironment() {
  let scrollY = 0;
  let reduced = false;
  let scroll = () => {};
  let motion = () => {};
  let frame = () => {};
  let reveal = (_: HTMLElement) => {};
  let tiles: readonly HTMLElement[] = [];
  const stopScroll = vi.fn(), stopMotion = vi.fn(), stopVisible = vi.fn(), cancelFrame = vi.fn();
  const environment: HomeMotionEnvironment = {
    scrollToTop: vi.fn(() => { scrollY = 0; }),
    scrollY: () => scrollY,
    reducedMotion: () => reduced,
    subscribeScroll: vi.fn(update => { scroll = update; return stopScroll; }),
    subscribeMotion: vi.fn(update => { motion = update; return stopMotion; }),
    nextFrame: vi.fn(update => { frame = update; return cancelFrame; }),
    watchVisible: vi.fn((offered, update) => { tiles = offered; reveal = update; return stopVisible; })
  };
  return {
    environment, stopScroll, stopMotion, stopVisible, cancelFrame,
    scroll: (y: number) => { scrollY = y; scroll(); },
    reduced: (value: boolean) => { reduced = value; motion(); },
    frame: () => frame(),
    tiles: () => tiles,
    reveal: (tile: HTMLElement) => reveal(tile)
  };
}

it("moves the sky at half page speed, coalesces scroll frames and removes parallax as motion preferences change", () => {
  const driver = motionEnvironment();
  renderHomePageFeaturing("compare", { motion: page => homeMotion(page, driver.environment) });
  const page = document.querySelector<HTMLElement>(".home")!;
  const offset = () => page.style.getPropertyValue("--home-parallax");
  expect(offset()).toBe("0px");
  driver.scroll(60);
  driver.scroll(180);
  expect(driver.environment.nextFrame).toHaveBeenCalledTimes(1);
  expect(offset()).toBe("0px");
  driver.frame();
  expect(offset()).toBe("90px");
  driver.scroll(240);
  driver.reduced(true);
  expect(offset()).toBe("0px");
  driver.frame();
  expect(offset()).toBe("0px");
  driver.reduced(false);
  expect(offset()).toBe("120px");
  driver.scroll(-20);
  driver.frame();
  expect(offset()).toBe("0px");
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
  driver.scroll(100);
  unmount();
  expect(driver.stopScroll).toHaveBeenCalledOnce();
  expect(driver.stopMotion).toHaveBeenCalledOnce();
  expect(driver.stopVisible).toHaveBeenCalledOnce();
  expect(driver.cancelFrame).toHaveBeenCalledOnce();
  expect(page.style.getPropertyValue("--home-parallax")).toBe("");
  expect(tiles.every(tile => !tile.hasAttribute("data-home-entrance"))).toBe(true);
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
  driver.scroll(300);
  driver.frame();
  await user.click(screen.getByRole("button", { name: "EXPLORE" }));
  expect(driver.stopVisible).toHaveBeenCalledOnce();
  await user.click(screen.getByRole("button", { name: "HOME" }));
  expect(motion).toHaveBeenCalledTimes(2);
  expect(driver.environment.scrollToTop).toHaveBeenCalledTimes(2);
  expect(document.querySelector<HTMLElement>(".home")!.style.getPropertyValue("--home-parallax")).toBe("0px");
  expect(driver.tiles()[0]).not.toBe(firstTile);
});
