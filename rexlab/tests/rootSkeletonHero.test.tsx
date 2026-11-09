import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { appProps } from "../src/root.ts";
import { renderHomePageFeaturing } from "./homePage.tsx";

const wiring = vi.hoisted(() => ({ startHero: vi.fn(), startHome: vi.fn() }));
vi.mock("../src/homeSkeletonHero.ts", () => ({ homeSkeletonHero: wiring.startHero }));
vi.mock("../src/homeMotion.ts", () => ({ homeMotion: wiring.startHome }));

beforeEach(() => {
  const version = document.createElement("span");
  version.id = "version";
  document.body.append(version);
  vi.stubGlobal("matchMedia", vi.fn((media: string) => ({
    matches: false, media, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn()
  })));
});
afterEach(() => { document.getElementById("version")?.remove(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

test.each(["loading", "ready"])("leaving a %s Home visit invokes the browser-wired hero cleanup", state => {
  const stopHero = vi.fn();
  const stopHome = vi.fn();
  wiring.startHome.mockReturnValue(stopHome);
  wiring.startHero.mockImplementation((host: HTMLElement) => {
    if (state === "ready") host.dataset.ready = "";
    return stopHero;
  });
  const app = renderHomePageFeaturing("skeletons", { motion: appProps(window).homeMotion });
  expect(wiring.startHero).toHaveBeenCalledTimes(1);
  expect(wiring.startHero.mock.calls[0]![0].querySelector("canvas")).toBeInstanceOf(HTMLCanvasElement);
  expect(stopHero).not.toHaveBeenCalled();
  app.unmount();
  expect(stopHero).toHaveBeenCalledTimes(1);
  expect(stopHome).toHaveBeenCalledTimes(1);
});
