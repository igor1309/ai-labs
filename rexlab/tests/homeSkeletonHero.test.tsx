import { act, fireEvent } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { homeSkeletonHero, skeletonYaw, type SkeletonHeroEnvironment, type SkeletonScene } from "../src/homeSkeletonHero.ts";
import { renderHomePageFeaturing } from "./homePage.tsx";

function harness({ reduced = false, visible = true } = {}) {
  const host = document.createElement("span");
  host.innerHTML = '<canvas aria-hidden="true"></canvas>';
  const scene = { draw: vi.fn<SkeletonScene["draw"]>(), dispose: vi.fn() };
  let resolve!: (scene: SkeletonScene) => void;
  let reject!: (error: Error) => void;
  const pending = new Promise<SkeletonScene>((yes, no) => { resolve = yes; reject = no; });
  let visibility!: () => void;
  let motion!: () => void;
  let intersection!: (inside: boolean) => void;
  let size!: (width: number, height: number) => void;
  const stops = Array.from({ length: 4 }, () => vi.fn());
  const frames = new Map<number, (milliseconds: number) => void>();
  let nextFrame = 0;
  const environment: SkeletonHeroEnvironment = {
    load: vi.fn(() => pending), visible: () => visible, reducedMotion: () => reduced,
    watchVisibility: cb => { visibility = cb; return stops[0]!; },
    watchMotion: cb => { motion = cb; return stops[1]!; },
    watchSize: (_host, cb) => { size = cb; return stops[2]!; },
    watchIntersection: (_host, cb) => { intersection = cb; return stops[3]!; },
    requestFrame: cb => { frames.set(++nextFrame, cb); return nextFrame; },
    cancelFrame: id => { frames.delete(id); }
  };
  const stop = homeSkeletonHero(host, environment);
  return {
    host, scene, environment, stops, stop, frames, size, intersection,
    hidden(value: boolean) { visible = !value; visibility(); },
    motion(value: boolean) { reduced = value; motion(); },
    async ready() { resolve(scene); await pending; await Promise.resolve(); await Promise.resolve(); },
    async failed() { reject(new Error("bad GLB")); await pending.catch(() => {}); await Promise.resolve(); await Promise.resolve(); },
    async show() { size(500, 200); intersection(true); await Promise.resolve(); },
    tick(milliseconds: number) {
      expect(frames.size).toBe(1);
      const [id, cb] = [...frames][0]!;
      frames.delete(id); cb(milliseconds);
    }
  };
}

test("does not import the renderer until the hero has a size and is visible on screen", async () => {
  const h = harness({ visible: false });
  h.intersection(true); h.size(500, 200);
  await Promise.resolve();
  expect(h.environment.load).not.toHaveBeenCalled();
  h.hidden(false); await Promise.resolve();
  expect(h.environment.load).toHaveBeenCalledExactlyOnceWith(h.host.querySelector("canvas"), expect.any(AbortSignal));
  expect(h.host.hasAttribute("data-ready")).toBe(false);
  await h.ready();
  expect(h.scene.draw).toHaveBeenCalledWith(500, 200, 0);
  expect(h.host.hasAttribute("data-ready")).toBe(true);
  h.stop();
});

test.each(["hidden-first", "offscreen-first"])("pauses on either condition and resumes only with both, retaining phase: %s", async order => {
  const h = harness(); await h.show(); await h.ready();
  h.tick(100); h.tick(2600);
  expect(h.scene.draw).toHaveBeenLastCalledWith(500, 200, .1);
  h.hidden(true); h.intersection(false);
  expect(h.frames.size).toBe(0);
  const before = h.scene.draw.mock.calls.length;
  if (order === "hidden-first") h.hidden(false); else h.intersection(true);
  expect(h.frames.size).toBe(0);
  expect(h.scene.draw).toHaveBeenCalledTimes(before);
  if (order === "hidden-first") h.intersection(true); else h.hidden(false);
  h.tick(100_000);
  expect(h.scene.draw).toHaveBeenLastCalledWith(500, 200, .1);
  h.tick(102_500);
  expect(h.scene.draw.mock.lastCall![2]).toBeCloseTo(0);
  h.stop();
});

test("reduced motion starts centrally and freezes the current pose on a live change", async () => {
  const h = harness({ reduced: true }); await h.show(); await h.ready();
  expect(h.frames.size).toBe(0);
  expect(h.scene.draw).toHaveBeenLastCalledWith(500, 200, 0);
  h.motion(false); h.tick(0); h.tick(2500);
  expect(h.scene.draw).toHaveBeenLastCalledWith(500, 200, .1);
  h.motion(true);
  expect(h.scene.draw).toHaveBeenLastCalledWith(500, 200, .1);
  expect(h.frames.size).toBe(0);
  h.hidden(true); h.motion(false);
  expect(h.frames.size).toBe(0);
  h.hidden(false); h.tick(90_000);
  expect(h.scene.draw).toHaveBeenLastCalledWith(500, 200, .1);
  h.stop();
});

test("resizing redraws the same scene and pose without replaying readiness", async () => {
  const h = harness(); await h.show(); await h.ready();
  h.tick(0); h.tick(2500);
  h.size(200, 500);
  expect(h.scene.draw).toHaveBeenLastCalledWith(200, 500, .1);
  expect(h.environment.load).toHaveBeenCalledTimes(1);
  expect(h.host.hasAttribute("data-ready")).toBe(true);
  expect(h.frames.size).toBe(1);
  h.stop();
});

test.each(["load", "draw", "context"])("failure stays on the picture until the next Home mount: %s", async failure => {
  const h = harness(); await h.show();
  if (failure === "load") await h.failed();
  else {
    await h.ready();
    if (failure === "draw") { h.scene.draw.mockImplementation(() => { throw new Error("GPU failure"); }); h.tick(0); }
    else fireEvent(h.host.querySelector("canvas")!, new Event("webglcontextlost", { cancelable: true }));
    expect(h.scene.dispose).toHaveBeenCalledTimes(1);
  }
  expect(h.host.hasAttribute("data-ready")).toBe(false);
  expect(h.host.hasAttribute("data-failed")).toBe(true);
  expect(h.frames.size).toBe(0);
  h.hidden(true); h.hidden(false); h.intersection(false); h.intersection(true); h.motion(true); h.motion(false); h.size(600, 200);
  expect(h.environment.load).toHaveBeenCalledTimes(1);
  expect(h.frames.size).toBe(0);
  h.stop();
  expect(h.host.hasAttribute("data-failed")).toBe(false);
  const next = harness(); await next.show(); await next.ready();
  expect(next.host.hasAttribute("data-ready")).toBe(true);
  next.stop();
});

test.each(["unmounted", "lost"])("disposes a late load without starting it after the visit is %s", async reason => {
  const h = harness(); await h.show();
  if (reason === "unmounted") h.stop();
  else fireEvent(h.host.querySelector("canvas")!, new Event("webglcontextlost"));
  expect(vi.mocked(h.environment.load).mock.calls[0]![1].aborted).toBe(true);
  await h.ready();
  expect(h.scene.dispose).toHaveBeenCalledTimes(1);
  expect(h.scene.draw).not.toHaveBeenCalled();
  expect(h.frames.size).toBe(0);
  if (reason === "lost") h.stop();
});

test("unmount cancels frames, observers and listeners, aborts loading, and releases the scene once", async () => {
  const h = harness(); await h.show(); await h.ready();
  h.stop();
  expect(h.frames.size).toBe(0);
  expect(h.stops.every(stop => stop.mock.calls.length === 1)).toBe(true);
  expect(h.scene.dispose).toHaveBeenCalledTimes(1);
  fireEvent(h.host.querySelector("canvas")!, new Event("webglcontextlost"));
  h.intersection(true); h.size(300, 100); h.motion(false); h.hidden(false);
  expect(h.frames.size).toBe(0);
  expect(h.scene.dispose).toHaveBeenCalledTimes(1);
});

test("yaw stays inside the gentle range and completes its ten-second cycle", () => {
  for (let ms = 0; ms <= 20_000; ms += 125) expect(Math.abs(skeletonYaw(ms))).toBeLessThanOrEqual(.1);
  expect([0, 2500, 5000, 7500, 10000].map(skeletonYaw)).toEqual([0, .1, expect.closeTo(0), -.1, expect.closeTo(0)]);
});

describe("Home artwork and navigation", () => {
  test("only BONES has the decorative canvas; its picture, title and PLAY keep the same door and reward", async () => {
    const { user, opened, unmount } = renderHomePageFeaturing("skeletons", { allGames: true });
    const hero = document.querySelector<HTMLElement>(".home-skeleton-hero")!;
    expect(hero.getAttribute("aria-hidden")).toBe("true");
    expect(getComputedStyle(hero).pointerEvents).toBe("none");
    expect(hero.querySelector("canvas")!.tabIndex).toBe(-1);
    expect(hero.querySelector("img")!.getAttribute("src")).toContain("tyrannosaurus/skeleton.webp");
    expect(document.querySelector(".featured-card-badge")!.textContent).toBe("3");
    for (const selector of [".home-today-art", ".featured-card-title", ".home-play"]) await user.click(document.querySelector(selector)!);
    expect(opened).toEqual(["skeletons", "skeletons", "skeletons"]);
    unmount();
    renderHomePageFeaturing("compare", { allGames: true });
    expect(document.querySelector("canvas")).toBeNull();
    expect(document.querySelector('.skeletons-tile img')!.getAttribute("src")).toContain("triceratops/skeleton");
  });

  test("the fade replaces only the decorative layer", async () => {
    renderHomePageFeaturing("skeletons");
    const hero = document.querySelector<HTMLElement>(".home-skeleton-hero")!;
    const canvas = hero.querySelector("canvas")!;
    expect(getComputedStyle(canvas).opacity).toBe("0");
    act(() => { hero.dataset.ready = ""; });
    expect(getComputedStyle(canvas).opacity).toBe("1");
    expect(getComputedStyle(hero.querySelector(".skeletons-hero-fallback")!).opacity).toBe("0");
    act(() => { delete hero.dataset.ready; });
    expect(getComputedStyle(canvas).opacity).toBe("0");
    expect(getComputedStyle(hero.querySelector(".skeletons-hero-fallback")!).opacity).toBe("1");
    expect(document.querySelector(".featured-card-badge")!.textContent).toBe("3");
  });
});
