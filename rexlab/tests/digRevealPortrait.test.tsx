import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PortraitLayouts } from "../src/App.tsx";
import { STAR_LANDS } from "../src/digGame.tsx";
import { TEXTS } from "../src/language/texts.ts";
import { PROGRESS_KEY } from "../src/localProgress.ts";
import { digUp, finishBoard, openDigApp, placeBoard } from "./digApp.tsx";
import { homeTile, manualViewport, memoryStorage } from "./support.ts";
import { openWindow, styleAt, type WindowSize } from "./windowSizes.ts";

// dig-reveal-portrait.feature in the app.

const PORTRAIT_LAYOUTS: PortraitLayouts = { home: ["tall"], "dig-board": ["tall"], "dig-question": ["tall"], "dig-reveal": ["tall"] };

// jsdom has no animation engine: the offer's reward and dismissal take
// no time.
beforeEach(() => {
  Object.defineProperty(Element.prototype, "getAnimations", { configurable: true, value: () => [{ currentTime: 0, effect: { getComputedTiming: () => ({ endTime: 0 }) } }] });
});
afterEach(() => { Reflect.deleteProperty(Element.prototype, "getAnimations"); });

const part = (selector: string) => {
  const found = document.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector}`);
  return found;
};
const gateShown = () => part(".orientation-gate").hasAttribute("data-shown");

// A dinosaur dug up at Hatchling in a window of `size`, its star landed.
function reveal(size: WindowSize, { language = "en" as "en" | "ru", strong = 0 } = {}) {
  openWindow(...size);
  const storage = memoryStorage({ [PROGRESS_KEY]: JSON.stringify({ schemaVersion: 1, games: { dig: { dug: [], badges: [], levelOffer: { level: "hatchling", strong, declined: [] } } } }) });
  const app = openDigApp({ viewport: manualViewport("portrait"), portraitLayouts: PORTRAIT_LAYOUTS, ageLevel: { level: "hatchling", revision: "parent" }, storage, language });
  fireEvent.click(homeTile(TEXTS[language].dig));
  placeBoard(800);
  digUp();
  finishBoard(app.timers);
  act(() => app.timers.fire(STAR_LANDS.motion));
  return app;
}

describe("DIG's reveal upright", () => {
  it.each([[744, 1133], [820, 1180], [600, 1000]] as const)("stands upright at %j, the dinosaur over its reward", (...size) => {
    reveal(size);
    expect([document.documentElement.dataset.size, gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual(["tall", false, false]);
    const column = styleAt(part(".dig-reveal"), size);
    expect([column.value("flex-direction"), column.value("align-items")]).toEqual(["column", "stretch"]);
    const art = styleAt(part(".dig-reveal-art"), size);
    expect([art.value("flex-grow"), art.value("min-height"), art.value("width")]).toEqual(["1", "0px", "100%"]);
    expect(styleAt(part(".dig-reward"), size).value("flex-grow")).toBe("0");
    const actions = styleAt(part(".dig-reveal-screen .result-actions"), size);
    expect([actions.value("flex-direction"), actions.rowGap()]).toEqual(["column", 12]);
    for (const name of [TEXTS.en.digAgain, TEXTS.en.home]) expect(styleAt(screen.getByRole("button", { name }), size).value("width")).toBe("100%");
    // The navy reveal keeps the switch's pale edge.
    expect(styleAt(part(".dig-reveal-screen .level-switch"), size).value("box-shadow")).toBe("inset 0 0 0 1px #ffffff40");
  });

  it.each(["en", "ru"] as const)("keeps every word on one line at 600 wide in %s", (language) => {
    reveal([600, 1000], { language });
    const size: WindowSize = [600, 1000];
    expect(styleAt(part(".dig-reveal-name"), size).value("white-space")).toBe("nowrap");
    expect(styleAt(part(".dig-reveal-name"), size).value("font-size")).toBe("min(64px, 0.07874015748031496 * (100cqi - 18px))");
    expect(styleAt(part(".dig-card"), size).value("white-space")).toBe("nowrap");
    for (const name of [TEXTS[language].digAgain, TEXTS[language].home]) expect(styleAt(screen.getByRole("button", { name }), size).value("white-space")).toBe("nowrap");
  });

  it("offers the next level upright", () => {
    const app = reveal([820, 1180], { strong: 2 });
    act(() => app.timers.fire(0));
    expect(gateShown()).toBe(false);
    expect(screen.getByRole("dialog", { name: TEXTS.en.levelOffer.question(TEXTS.en.ageLevels.explorer.name) })).toBeTruthy();
  });
});
