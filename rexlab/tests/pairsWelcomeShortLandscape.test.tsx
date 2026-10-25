import { act, screen, within } from "@testing-library/react";
import { describe, expect, it, onTestFinished } from "vitest";
import type { Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { openPairsApp, PICKED_HATCHLING } from "./pairsApp.tsx";
import { appStylesheet, NO_SAFE_AREA, type SafeArea } from "./stylesheet.ts";
import { gameDoor, manualViewport, memoryStorage } from "./support.ts";
import { openWindow, styleAt, type WindowSize } from "./windowSizes.ts";

// Windows on their side, full screen: the shortest a phone gives the
// layout, and iPhones from the smallest to the largest, each with the
// insets its notch and home indicator take.
const PHONES = [
  [568, 320, NO_SAFE_AREA],
  [667, 375, { top: 0, right: 0, bottom: 21, left: 0 }],
  [852, 393, { top: 0, right: 59, bottom: 21, left: 59 }],
  [932, 430, { top: 0, right: 59, bottom: 21, left: 59 }]
] as const;

const DEVICES: Record<Language, string> = { en: "en-GB", ru: "ru-RU" };

// Advances at weight 700, rounded up: Lexend's for English, the system
// face's for Russian with 10% room.
const TITLE_EMS: Record<string, number> = { "FIND THE PAIR": 8.03, "НАЙДИ ПАРУ": 7.4 };
const PLAY_EMS: Record<string, number> = { PLAY: 2.58, "ИГРАТЬ": 4.07 };

const part = (selector: string, root: ParentNode = document) => {
  const found = root.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector}`);
  return found;
};

// The welcome in a wide-short window of `size` with the insets `insets`.
async function openWelcome(size: WindowSize, insets: SafeArea, language: Language = "en") {
  openWindow(...size);
  const sheet = Object.assign(document.createElement("style"), { textContent: appStylesheet(insets) });
  document.head.append(sheet);
  onTestFinished(() => sheet.remove());
  const viewport = manualViewport("landscape", { left: insets.left, right: insets.right });
  viewport.resize("wide-short", false);
  const app = openPairsApp({ storage: memoryStorage(), viewport, deviceLanguage: DEVICES[language], ageLevel: PICKED_HATCHLING });
  await app.user.click(gameDoor(TEXTS[language].pairs));
  return { ...app, viewport };
}

describe("find the pair's welcome in a wide-short window", () => {
  it.each(PHONES)("stands the cards beside the column, all of it within the height, at %i by %i", async (width, height, insets) => {
    await openWelcome([width, height], insets);
    const size: WindowSize = [width, height];
    const at = (selector: string) => styleAt(part(selector), size);
    expect([document.documentElement.dataset.size, part(".orientation-gate").hasAttribute("data-shown")]).toEqual(["wide-short", false]);
    const screenStyle = at(".pairs-welcome");
    expect([screenStyle.px("padding-top"), screenStyle.px("padding-right"), screenStyle.px("padding-bottom"), screenStyle.px("padding-left"), screenStyle.rowGap()]).toEqual([12, 20 + insets.right, 12 + insets.bottom, 20 + insets.left, 8]);
    expect([screenStyle.value("height"), screenStyle.value("overflow")]).toEqual([`${height}px`, "hidden"]);
    const home = styleAt(screen.getByRole("button", { name: TEXTS.en.home }), size);
    expect([home.value("width"), home.value("height"), home.px("padding-left")]).toEqual(["48px", "48px", 0]);
    const body = at(".pairs-welcome-body");
    expect([body.value("flex-direction") || "row", body.columnGap()]).toEqual(["row", 24]);
    const start = at(".pairs-start");
    expect([start.value("width"), start.value("flex-direction"), start.rowGap()]).toEqual(["320px", "column", 12]);
    // The column: the title's row as tall as its mark, the chips, the
    // switch's padding and a level, and PLAY, 12 apart.
    const title = at(".pairs-title");
    const mark = at(".pairs-mark").px("height");
    expect(mark).toBeGreaterThanOrEqual(title.px("font-size") * 1.1);
    const switchStyle = at(".pairs-welcome .level-switch");
    const switchHeight = switchStyle.px("padding-top") + switchStyle.px("padding-bottom") + at(".pairs-welcome .level-switch-level").px("height");
    const column = mark + at(".pairs-chip").px("height") + switchHeight + at(".pairs-play-button").px("height") + 3 * start.rowGap();
    const bodyHeight = height - 12 - 12 - insets.bottom - 48 - 8;
    expect(column).toBeLessThanOrEqual(bodyHeight);
    // The cards take what the column leaves, each 32% of it at 3:4, no
    // taller than the body.
    const hero = width - 40 - insets.left - insets.right - 320 - 24;
    const card = at(".pairs-hero-card");
    expect([card.value("width"), card.value("aspect-ratio"), card.value("max-height")]).toEqual(["32%", "3 / 4", "100%"]);
    expect(at(".pairs-hero").value("align-self")).toBe("stretch");
    expect(Math.min(hero * 0.32, (bodyHeight * 3) / 4)).toBeGreaterThan(56);
  });

  it.each(PHONES.flatMap((phone) => (["en", "ru"] as const).map((language) => [...phone, language] as const)))("shows each level's picture alone on the switch, its name kept for screen readers, at %i by %i, in %s", async (width, height, insets, language) => {
    await openWelcome([width, height], insets, language);
    const size: WindowSize = [width, height];
    const levels = screen.getByRole("group", { name: TEXTS[language].ageLevelSwitch });
    const named = (["hatchling", "explorer", "paleontologist"] as const).map((level) => within(levels).getByRole("button", { name: TEXTS[language].ageLevels[level].name }));
    for (const button of named) expect(styleAt(part(".level-switch-name", button), size).value("display")).not.toBe("none");
    const names = [...document.querySelectorAll<HTMLElement>(".pairs-welcome .level-switch-name")];
    expect(names).toHaveLength(3);
    for (const name of names) expect([styleAt(name, size).value("position"), styleAt(name, size).value("clip-path")]).toEqual(["absolute", "inset(50%)"]);
    const mark = styleAt(part(".pairs-welcome .level-switch-mark"), size);
    expect([mark.px("top"), mark.px("bottom"), mark.px("left")]).toEqual([4, 4, 4]);
    // jsdom writes the third as 0.333… times the width less the padding
    // and gaps.
    expect(mark.value("width").replace(/\s+/g, "")).toMatch(/^calc\(0\.333+\d*\*\(100%-16px\)\)$/);
  });

  it.each(["en", "ru"] as const)("fits the title beside its mark and PLAY on one line in the column, in %s", async (language) => {
    const size: WindowSize = [667, 375];
    await openWelcome(size, PHONES[1][2], language);
    const at = (selector: string) => styleAt(part(selector), size);
    const title = at(".pairs-title");
    expect([title.value("white-space"), title.value("flex-wrap")]).toEqual(["nowrap", "nowrap"]);
    expect(at(".pairs-mark").px("width") + title.columnGap() + TITLE_EMS[TEXTS[language].pairs]! * title.px("font-size")).toBeLessThanOrEqual(320);
    const play = at(".pairs-play-button");
    const playWidth = play.px("padding-left") + play.px("padding-right") + styleAt(part(".pairs-play-button svg"), size).px("width") + play.columnGap() + PLAY_EMS[TEXTS[language].play]! * play.px("font-size");
    expect(playWidth).toBeLessThanOrEqual(320);
  });

  it("goes back to the iPad's layout when the window grows past 600 tall", async () => {
    const { viewport } = await openWelcome([852, 393], PHONES[2][2]);
    act(() => viewport.resize("wide", false));
    openWindow(1180, 820);
    const size: WindowSize = [1180, 820];
    expect([document.documentElement.dataset.size, styleAt(part(".pairs-start"), size).value("width"), styleAt(part(".pairs-play-button"), size).value("height")]).toEqual(["wide", "648px", "104px"]);
  });
});
