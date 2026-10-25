import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, onTestFinished } from "vitest";
import { App } from "../src/App.tsx";
import type { Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { appStylesheet, type SafeArea } from "./stylesheet.ts";
import {
  SHIPPED_CATALOGUE, SHIPPED_DINOSAURS, emptyCare, emptyDig, emptyPairs,
  emptyProgress, emptySkeletons, emptySorting, fakeBodyPicture, featuring,
  lightDevice, loadedPictures, manualViewport, pageAtRest, seededRandom,
  unreadVersion, unsetAgeLevel
} from "./support.ts";
import { openWindow, styleAt, type WindowSize } from "./windowSizes.ts";

// iPhones on their side, full screen: the smallest, a common one and the
// largest, each with the insets its notch and home indicator take.
const PHONES = [
  [667, 375, { top: 0, right: 0, bottom: 21, left: 0 }],
  [852, 393, { top: 0, right: 59, bottom: 21, left: 59 }],
  [932, 430, { top: 0, right: 59, bottom: 21, left: 59 }]
] as const;

const BOTH = (["en", "ru"] as const).flatMap((language) => PHONES.map(([width, height, insets]) => [language, width, height, insets] as const));

// The position's widest, "52 / 52", in ems of its face, Lexend at 600.
const POSITION_EMS = 0.6 * 2 + 0.31 * 2 + 0.59 + 0.65 + 0.55;

const part = (selector: string, root: ParentNode = document) => {
  const found = root.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector}`);
  return found;
};

// The page of Pachycephalosaurus, the longest name, opened from the
// catalogue in a wide-short window of `size` with the safe-area insets
// `insets`, in `language`.
async function openPage(size: WindowSize, insets: SafeArea, language: Language = "en") {
  openWindow(...size);
  const sheet = document.createElement("style");
  sheet.textContent = appStylesheet(insets);
  document.head.append(sheet);
  onTestFinished(() => sheet.remove());
  const viewport = manualViewport("landscape", { left: insets.left, right: insets.right });
  viewport.resize("wide-short", false);
  const user = userEvent.setup();
  render(<App
    {...featuring()}
    dinosaurs={SHIPPED_DINOSAURS}
    catalogue={SHIPPED_CATALOGUE}
    bodyPicture={fakeBodyPicture}
    random={seededRandom(11)}
    portraitLayouts={{}}
    viewport={viewport}
    progress={emptyProgress()}
    deviceLanguage={language === "ru" ? "ru-RU" : "en-GB"}
    languageStore={{ load: () => undefined, save: () => {} }}
    nameVersion={unreadVersion}
    {...lightDevice()} {...unsetAgeLevel()} {...loadedPictures()}
    {...emptyCare()} {...emptySorting()} {...emptyPairs()}
    {...emptySkeletons()} {...emptyDig()} {...pageAtRest()}
  />);
  await user.click(screen.getByRole("button", { name: TEXTS[language].catalogueTile }));
  await user.click(part('[data-id="pachycephalosaurus"]'));
  return { viewport };
}

describe("a dinosaur's page in a wide-short window", () => {
  it.each(PHONES)("keeps the stage and the words side by side at %i by %i, under one short bar, 20 past each side's inset", async (width, height, insets) => {
    await openPage([width, height], insets);
    const size: WindowSize = [width, height];
    const at = (selector: string) => styleAt(part(selector), size);
    expect([document.documentElement.dataset.size, part(".orientation-gate").hasAttribute("data-shown")]).toEqual(["wide-short", false]);
    const page = at(".dinosaur-page");
    expect([page.px("padding-top"), page.px("padding-right"), page.px("padding-bottom"), page.px("padding-left"), page.rowGap()]).toEqual([8, 20 + insets.right, 12 + insets.bottom, 20 + insets.left, 8]);
    expect([page.value("height"), page.value("overflow-y") || "visible"]).toEqual([`${height}px`, "visible"]);
    expect([...part(".dinosaur-body").children]).toEqual([part(".dinosaur-stage"), part(".dinosaur-info")]);
    const body = at(".dinosaur-body");
    expect([body.value("flex-direction") || "row", body.columnGap(), body.value("flex-basis"), body.px("min-height")]).toEqual(["row", 20, "0px", 0]);
    // The two sides share the row evenly, neither held to a width.
    for (const side of [".dinosaur-stage", ".dinosaur-info"]) {
      expect([at(side).value("flex"), at(side).value("width") || "auto", at(side).px("min-width")], side).toEqual(["1 1 0px", "auto", 0]);
    }
  });

  it.each(PHONES)("fits the stage in the height at %i by %i: the picture over 48-pixel ← and →", async (width, height, insets) => {
    await openPage([width, height], insets);
    const size: WindowSize = [width, height];
    const at = (selector: string) => styleAt(part(selector), size);
    const page = at(".dinosaur-page");
    const body = height - page.px("padding-top") - page.px("padding-bottom") - 48 - page.rowGap();
    const stage = at(".dinosaur-stage");
    expect([stage.value("display"), stage.value("flex-direction"), stage.value("overflow")]).toEqual(["flex", "column", "hidden"]);
    expect([at(".dinosaur-stage-art").value("flex"), at(".dinosaur-stage-art").px("min-height")]).toEqual(["1 1 0px", 0]);
    const picture = body - stage.px("padding-top") - stage.px("padding-bottom") - 48;
    // The picture keeps at least half the stage's height.
    expect(picture).toBeGreaterThanOrEqual(body / 2);
    for (const name of [TEXTS.en.previousDinosaur, TEXTS.en.nextDinosaur]) {
      const step = styleAt(screen.getByRole("button", { name }), size);
      expect([step.px("width"), step.px("height")], name).toEqual([48, 48]);
    }
  });

  it.each(BOTH)("keeps the bar on one row of 48-pixel taps in %s at %i by %i: the button's book and words, and the position", async (language, width, height, insets) => {
    await openPage([width, height], insets, language);
    const size: WindowSize = [width, height];
    const button = screen.getByRole("button", { name: TEXTS[language].catalogue });
    const buttonAt = styleAt(button, size);
    const words = styleAt(part(".narrow-hidden", button), size);
    expect([words.value("position") || "static", buttonAt.px("height")]).toEqual(["static", 48]);
    // One em a glyph for the button's words, as no face is wider.
    const buttonWidth = buttonAt.px("padding-left") + 24 + buttonAt.columnGap() + [...TEXTS[language].catalogue].length * words.px("font-size") + buttonAt.px("padding-right");
    const bar = styleAt(part(".dinosaur-bar"), size);
    const page = styleAt(part(".dinosaur-page"), size);
    expect([bar.value("flex-wrap") || "nowrap", bar.value("justify-content")]).toEqual(["nowrap", "space-between"]);
    const position = POSITION_EMS * styleAt(part(".dinosaur-position"), size).px("font-size");
    expect(buttonWidth + bar.columnGap() + position).toBeLessThanOrEqual(width - page.px("padding-left") - page.px("padding-right"));
  });

  it.each(BOTH)("sets the words in their small type, scrolling within their side, in %s at %i by %i", async (language, width, height, insets) => {
    await openPage([width, height], insets, language);
    const size: WindowSize = [width, height];
    const at = (selector: string) => styleAt(part(selector), size);
    const info = at(".dinosaur-info");
    expect([info.value("overflow-y"), info.value("justify-content"), info.rowGap()]).toEqual(["auto", "flex-start", 12]);
    expect([at(".dinosaur-page-name").value("font-size"), at(".dinosaur-page-name").value("white-space")]).toEqual(["min(32px, 7.8cqi)", "nowrap"]);
    expect([at(".dinosaur-description").px("font-size"), at(".dinosaur-description").px("line-height"), at(".dinosaur-description").value("height") || "auto"]).toEqual([17, 24, "auto"]);
    expect([at(".dinosaur-facts").value("flex-direction") || "row", at(".dinosaur-facts").columnGap()]).toEqual(["row", 8]);
    const fact = at(".dinosaur-fact");
    expect([fact.px("padding-left"), fact.px("padding-right"), at(".dinosaur-fact-label").px("font-size"), at(".dinosaur-fact-value").value("font-size")]).toEqual([12, 12, 14, "min(24px, 26cqi)"]);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(SHIPPED_CATALOGUE.find(({ id }) => id === "pachycephalosaurus")!.name[language].toLocaleUpperCase(language));
  });

  it("goes back to the iPad's layout when the window grows past 600 tall", async () => {
    const { viewport } = await openPage([852, 393], PHONES[1][2]);
    openWindow(1180, 820);
    act(() => viewport.resize("wide", false));
    expect(document.documentElement.dataset.size).toBe("wide");
    expect(styleAt(part(".dinosaur-step"), [1180, 820]).px("width")).toBe(72);
    expect(styleAt(part(".dinosaur-page"), [1180, 820]).px("padding-top")).toBe(40);
  });
});
