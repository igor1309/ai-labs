import { act, fireEvent, screen, within } from "@testing-library/react";
import { addTransitionType } from "react";
import { describe, expect, it, vi } from "vitest";
import { LANGUAGES, type Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { SCREEN_CHANGE } from "../src/screens.ts";
import { topLine } from "./homeCorner.ts";
import { openMenu, outsideMenu } from "./menus.ts";
import { choices, keptSkeletons, openHomeApp } from "./skeletonsApp.tsx";
import { PALETTE, contrast, gameDoor, symbolOf } from "./support.ts";
import { filterTaps, tapAt } from "./taps.ts";
import { openWindow, windowsAnd } from "./windowSizes.ts";

// home-museum.feature

// Every transition type the app adds, seen as it is added.
vi.mock("react", async (actual) => {
  const react = await actual<typeof import("react")>();
  return { ...react, addTransitionType: vi.fn(react.addTransitionType) };
});

const DEVICES: Record<Language, string> = { en: "en-GB", ru: "ru-RU" };

const museumButton = (language: Language = "en") => screen.getByRole("button", { name: TEXTS[language].museum });

const hall = () => screen.queryByRole("group", { name: "STANDS" });

const onHomePage = () => document.querySelector(".games-tiles") !== null;

const button = (name: string) => screen.getByRole("button", { name });

const px = (value: string) => Number.parseFloat(value) || 0;

const brightness = (element: Element) => {
  const match = /brightness\(([\d.]+)\)/.exec(getComputedStyle(element).filter);
  return match?.[1] === undefined ? 1 : Number(match[1]);
};

// A size the style leaves to the layout.
const unset = (value: string) => ["", "auto", "none"].includes(value);

const partOf = (selector: string) => {
  const part = document.querySelector(selector);
  if (!part) throw new Error(`No ${selector} on the page`);
  return part;
};

describe("the museum on the home page", () => {
  it.each(LANGUAGES)("is offered in the top-right corner, in %s, beside the museum's symbol, left of the parents' menus and sized for a child's tap", (language) => {
    openHomeApp({ deviceLanguage: DEVICES[language] });

    const button = museumButton(language);
    expect(button.textContent).toBe(TEXTS[language].museum);
    expect(TEXTS.ru.museum).toBe("МУЗЕЙ");
    expect(symbolOf(button)).toBe("landmark");
    const corner = partOf(".home-corner");
    const menus = partOf(".parent-menus");
    expect([button.parentElement, menus.parentElement, button.nextElementSibling, menus.contains(button)]).toEqual([corner, corner, menus, false]);
    const style = getComputedStyle(corner);
    expect([style.position, style.display]).toEqual(["fixed", "flex"]);
    expect(style.right).toMatch(/^[\d.]+px$/);
    expect(px(style.gap)).toBeGreaterThanOrEqual(12);
    expect(px(getComputedStyle(button).minWidth)).toBeGreaterThanOrEqual(60);
    expect(px(getComputedStyle(button).height)).toBeGreaterThanOrEqual(60);
  });

  it("opens the museum hall, HOME comes back, and SKELETONS and BUILD ANOTHER both show the choice of dinosaurs", async () => {
    const { user, pictures } = openHomeApp({ storage: keptSkeletons({ earned: ["triceratops"], bestScore: 1, rebuilding: [] }) });

    await user.click(museumButton());
    expect(within(hall() ?? document.body).getByRole("region", { name: "TRICERATOPS" }).getAttribute("data-state")).toBe("built");
    expect(screen.getByLabelText("STARS").textContent).toBe("1/5");

    await user.click(screen.getByRole("button", { name: "HOME" }));
    expect(onHomePage()).toBe(true);

    await user.click(gameDoor("SKELETONS"));
    expect([hall(), choices().length]).toEqual([null, 6]);

    await user.click(screen.getByRole("button", { name: "HOME" }));
    await user.click(museumButton());
    await user.click(screen.getByRole("button", { name: "BUILD ANOTHER" }));
    expect([hall(), choices().length]).toEqual([null, 6]);
  });

  // The museum opens at once, so a double tap's second tap lands on the
  // museum screen. Every button there is tapped in the burst, so
  // whichever one stands under MUSEUM, the tap presses nothing.
  it("opens once on a quick double tap: the second tap presses nothing in the museum, and one HOME comes back", async () => {
    const { user } = openHomeApp();
    filterTaps();

    tapAt(museumButton(), 0);
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((each) => each.textContent)).toEqual(expect.arrayContaining(["HOME", "BUILD ANOTHER"]));
    buttons.forEach((each, i) => tapAt(each, 250 + 250 * i));

    expect(hall()).not.toBeNull();
    await user.click(button("HOME"));
    expect(onHomePage()).toBe(true);
  });

  it.each(["Language", "Theme", "Age level"])("only closes the %s menu when tapped while the menu is open", async (label) => {
    const { user } = openHomeApp();
    await openMenu(user, label);

    // The backdrop over the page lies over the museum too, so a tap on
    // the museum lands on it: both stand in the corner, the backdrop
    // stacked above the museum and under the menus.
    const backdrop = outsideMenu();
    const button = museumButton();
    expect([backdrop.parentElement, button.parentElement]).toEqual([button.parentElement, partOf(".home-corner")]);
    const [over, under, menus] = [backdrop, button, partOf(".parent-menus")].map((element) => getComputedStyle(element));
    expect([over?.position, over?.zIndex, under?.position, under?.zIndex, menus?.position, menus?.zIndex]).toEqual(["fixed", "1", "static", "auto", "relative", "2"]);
    // Fixed to the whole screen: the corner it stands in has no transform
    // or filter, which would pin it to the corner instead.
    expect([over?.top, over?.right, over?.bottom, over?.left]).toEqual(["0px", "0px", "0px", "0px"]);
    // Nothing in its style shrinks it from the insets.
    expect([over?.width, over?.height, over?.maxWidth, over?.maxHeight].filter((size) => !unset(size ?? ""))).toEqual([]);
    const corner = getComputedStyle(partOf(".home-corner"));
    expect([corner.transform || "none", corner.filter || "none"]).toEqual(["none", "none"]);
    fireEvent.click(backdrop);

    expect(screen.queryByRole("menu")).toBeNull();
    expect([onHomePage(), hall()]).toEqual([true, null]);
  });

  it.each(windowsAnd([1366, 1024]).flatMap(([width, height]) => LANGUAGES.map((language) => [language, width, height] as const)))(
    "stands on one line with RexLab and the menus, in %s in a %i by %i window, above the greeting",
    (language, width, height) => {
      openWindow(width, height);
      openHomeApp({ deviceLanguage: DEVICES[language] });

      const line = topLine(width, language);

      expect(line.museumWraps).toBe(false);
      expect(line.between).toBeGreaterThanOrEqual(line.cornerGap);
      // The corner and the wordmark end above where the greeting begins.
      expect(Math.max(line.cornerEnd, line.wordmarkEnd)).toBeLessThanOrEqual(line.greetingTop);
    }
  );

  it.each(["light", "dark"] as const)("reads in the %s theme, brightens under a pointer and presses in", async (theme) => {
    const { user } = openHomeApp({ appearance: theme });

    const button = museumButton();
    const style = getComputedStyle(button);
    expect(button.querySelector("svg")?.getAttribute("stroke")).toBe("currentColor");
    expect(contrast(style.color, style.backgroundColor)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(style.backgroundColor, PALETTE[theme].bg ?? "")).toBeGreaterThanOrEqual(3);

    await user.hover(button);
    expect(brightness(button)).toBeGreaterThan(1);
    await user.pointer({ keys: "[TouchA>]", target: button });
    expect(getComputedStyle(button).transform).toMatch(/^scale\(0\.\d+\)$/);
  });

  it.each([false, true])("opens the museum as a screen change, the shared motion's, with reduced motion %s", async (reducedMotion) => {
    const { user } = openHomeApp({ reducedMotion });
    vi.mocked(addTransitionType).mockClear();

    await user.click(museumButton());

    expect(vi.mocked(addTransitionType).mock.calls).toEqual([[SCREEN_CHANGE]]);
    expect(hall()).not.toBeNull();
  });
});
