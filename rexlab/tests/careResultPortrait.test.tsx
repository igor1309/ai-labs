import "./careSheets.ts";
import { act, screen } from "@testing-library/react";
import { describe, expect, it, onTestFinished } from "vitest";
import type { PortraitLayouts } from "../src/App.tsx";
import { TEXTS } from "../src/language/texts.ts";
import { playVisit } from "./care.ts";
import { openCareApp } from "./careApp.tsx";
import { SHIPPED_VISITORS, manualViewport, type ManualViewport } from "./support.ts";
import { openWindow, styleAt, type WindowSize } from "./windowSizes.ts";

// dinosaur-care-result-portrait.feature in the app.

const PORTRAIT_LAYOUTS: PortraitLayouts = { home: ["tall"], "care-welcome": ["tall"], "care-visit": ["tall"], "care-friends": ["tall"], "care-result": ["tall"] };

const part = (selector: string) => {
  const found = document.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector}`);
  return found;
};
const gateShown = () => part(".orientation-gate").hasAttribute("data-shown");

// A first visit played whole to its result in a window of `size`.
async function openResult(size: WindowSize, { language = "en", viewport = manualViewport("portrait") }: { language?: "en" | "ru"; viewport?: ManualViewport } = {}) {
  openWindow(...size);
  const app = openCareApp({ viewport, portraitLayouts: PORTRAIT_LAYOUTS, deviceLanguage: language === "ru" ? "ru-RU" : "en-GB" });
  await app.user.click(screen.getByRole("button", { name: TEXTS[language].care }));
  await app.user.click(screen.getByRole("button", { name: TEXTS[language].newVisitor }));
  await playVisit(app.user, app.clock);
  act(() => app.clock.settle());
  expect(screen.getByLabelText(TEXTS[language].score)).toBeTruthy();
  return app;
}

// jsdom does not lay out: capitals at a conservative 0.8 em with their
// spacing.
const capitalsWidth = (words: string, style: ReturnType<typeof styleAt>) => words.length * (style.px("font-size") * 0.8 + style.px("letter-spacing"));

const THEME = {
  light: { label: "rgb(255, 253, 248)", reward: "rgb(227, 155, 45)", strong: "rgb(31, 43, 77)", onStrong: "rgb(246, 242, 233)", action: "rgb(193, 80, 54)" },
  dark: { label: "rgb(28, 34, 56)", reward: "rgb(240, 174, 69)", strong: "rgb(237, 229, 210)", onStrong: "rgb(29, 39, 66)", action: "rgb(229, 122, 93)" }
} as const;

describe("care's result upright", () => {
  it.each([[744, 1133], [820, 1180], [600, 1000]] as const)("stands upright at %j on the dig site, the visitor over the chips, the score, the hearts, the title and the three actions stacked", async (...size) => {
    await openResult(size);
    expect([document.documentElement.dataset.size, gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual(["tall", false, false]);
    expect(screen.queryByRole("img", { name: TEXTS.en.turnSideways })).toBeNull();
    expect(part(".care-result > .dig-ground")).toBeTruthy();
    const page = styleAt(part(".care-result"), size);
    expect([page.value("display"), page.value("grid-template-areas"), page.value("overflow")]).toEqual(["grid", '"art" "content" "actions"', "hidden"]);
    expect([...part(".care-result").children].map((element) => element.className).filter((name) => name !== "festivity")).toEqual(["dig-ground", "care-result-art", "result-content", "result-actions"]);
    // The visitor, whole at its 4:3, standing on the sand.
    const hero = styleAt(part(".care-result .result-hero"), size);
    expect([hero.value("object-fit"), hero.value("object-position")]).toEqual(["contain", "bottom"]);
    expect([part(".care-result .result-hero").getAttribute("width"), part(".care-result .result-hero").getAttribute("height")]).toEqual(["800", "600"]);
    // Under it the chips first, then the score, the hearts and the title.
    expect([...part(".result-content").children].map((element) => element.className)).toEqual(["result-score", "result-hearts", "result-title", "care-result-chips"]);
    expect(styleAt(part(".care-result-chips"), size).value("order")).toBe("-1");
    const actions = styleAt(part(".result-actions"), size);
    expect([actions.value("flex-direction"), actions.value("width")]).toEqual(["column", "min(360px, 100%)"]);
    for (const name of [TEXTS.en.newVisitor, TEXTS.en.friends, TEXTS.en.home]) {
      const button = styleAt(screen.getByRole("button", { name }), size);
      expect([button.value("justify-content"), button.px("height")], name).toEqual(["center", 64]);
    }
  });

  it.each(["en", "ru"] as const)("fits the hearts on one row and every word at 600 wide in %s", async (language) => {
    const size: WindowSize = [600, 1000];
    await openResult(size, { language });
    const text = TEXTS[language];
    const page = styleAt(part(".care-result"), size);
    const width = 600 - page.px("padding-left") - page.px("padding-right");

    const hearts = styleAt(part(".result-hearts"), size);
    const count = document.querySelectorAll(".result-heart").length;
    expect(hearts.value("flex-wrap") || "nowrap").toBe("nowrap");
    expect(count * 44 + (count - 1) * hearts.columnGap()).toBeLessThanOrEqual(width);

    const title = styleAt(part(".result-title"), size);
    expect(title.value("white-space")).toBe("nowrap");
    for (const words of [text.newFriend, text.wellDone]) expect(capitalsWidth(words, title), words).toBeLessThanOrEqual(width);

    // The friend chip with the longest visitor's name.
    const chip = styleAt(part(".friend-chip"), size);
    const longest = Math.max(...SHIPPED_VISITORS.map((visitor) => capitalsWidth(visitor.name[language], chip)));
    expect(chip.px("padding-left") + 24 + chip.columnGap() + longest + chip.px("padding-right")).toBeLessThanOrEqual(width);

    for (const name of [text.newVisitor, text.friends, text.home]) {
      const button = styleAt(screen.getByRole("button", { name }), size);
      expect(button.value("white-space")).toBe("nowrap");
      expect(button.px("padding-left") + 28 + button.columnGap() + capitalsWidth(name, button) + button.px("padding-right"), name).toBeLessThanOrEqual(360);
    }
  });

  it("stands the landscape result on the dig site, the visitor beside the reward and the actions in one row on the sand", async () => {
    await openResult([1180, 820], { viewport: manualViewport("landscape") });
    expect([document.documentElement.dataset.size, gateShown()]).toEqual(["wide", false]);
    const page = styleAt(part(".care-result"), [1180, 820]);
    expect(page.value("grid-template-areas")).toBe('"art content" "actions actions"');
    expect(getComputedStyle(part(".result-actions")).flexDirection || "row").toBe("row");
  });

  it.each(["light", "dark"] as const)("dresses the chips and the actions in the %s theme's tokens", async (theme) => {
    const colours = THEME[theme];
    await openResult([820, 1180]);
    document.documentElement.dataset.theme = theme;
    onTestFinished(() => { delete document.documentElement.dataset.theme; });
    expect(getComputedStyle(part(".friend-chip")).backgroundColor).toBe(colours.label);
    expect(getComputedStyle(part(".care-record")).backgroundColor).toBe(colours.reward);
    expect(getComputedStyle(screen.getByRole("button", { name: TEXTS.en.newVisitor })).backgroundColor).toBe(colours.action);
    const friends = getComputedStyle(screen.getByRole("button", { name: TEXTS.en.friends }));
    expect([friends.backgroundColor, friends.color]).toEqual([colours.strong, colours.onStrong]);
  });

  it("comes upright from landscape as the window turns, its parts marked for the glide, and NEW VISITOR brings a new visitor", async () => {
    const viewport = manualViewport("landscape");
    const { user, clock } = await openResult([1180, 820], { viewport });
    const result = part(".care-result");
    openWindow(820, 1180);
    act(() => viewport.resize("tall", true));
    expect([document.documentElement.dataset.size, gateShown(), part(".care-result")]).toEqual(["tall", false, result]);
    const parts = [...result.querySelectorAll<HTMLElement>("[data-turn-part]")].map((element) => element.dataset.turnPart);
    expect(parts).toEqual(expect.arrayContaining(["result-hero", "result-score", "result-hearts", "result-title", "care-result-chips", "result-actions"]));
    // The glide settles, and play goes on.
    expect(document.documentElement.hasAttribute("data-turning")).toBe(true);
    act(() => clock.fire(240));
    expect(document.documentElement.hasAttribute("data-turning")).toBe(false);
    await user.click(screen.getByRole("button", { name: TEXTS.en.newVisitor }));
    expect([document.querySelector(".visit"), gateShown()]).toEqual([expect.anything(), false]);
  });

  it("keeps asking to turn in a tall-narrow window", async () => {
    const viewport = manualViewport("portrait");
    await openResult([820, 1180], { viewport });
    openWindow(393, 852);
    act(() => viewport.resize("tall-narrow", true));
    expect([gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual([true, true]);
  });
});
