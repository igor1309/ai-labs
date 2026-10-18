import { act, fireEvent, screen, within } from "@testing-library/react";
import { addTransitionType } from "react";
import { describe, expect, it, vi } from "vitest";
import { LANGUAGES, type Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { SCREEN_CHANGE } from "../src/screens.ts";
import { openMenu, outsideMenu } from "./menus.ts";
import { choices, keptSkeletons, openHomeApp } from "./skeletonsApp.tsx";
import { PALETTE, contrast, homeTile, symbolOf, type ManualPictures } from "./support.ts";

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

// How long the museum, opened from the home page, takes no taps: half a
// second, longer than the gap between a child's two quick taps.
const SETTLE = 500;

const settle = (pictures: ManualPictures) => act(() => pictures.fire(SETTLE));

const px = (value: string) => Number.parseFloat(value) || 0;

const brightness = (element: Element) => {
  const match = /brightness\(([\d.]+)\)/.exec(getComputedStyle(element).filter);
  return match?.[1] === undefined ? 1 : Number(match[1]);
};

// jsdom lays nothing out, so the width of each word in the top corners
// is given here in ems of its face, rounded up: Lexend's at the weight
// it is shown in for the Latin words, and the iPad's own bold face for
// the Cyrillic one, which Lexend has no letters for.
const WORD_EMS: Record<string, number> = { RexLab: 3.8, MUSEUM: 4.6, МУЗЕЙ: 3.5, EN: 1.5, RU: 1.5 };

const wordWidth = (words: string, style: CSSStyleDeclaration) => (WORD_EMS[words] ?? Number.NaN) * px(style.fontSize) + px(style.letterSpacing) * words.length;

const sides = (style: CSSStyleDeclaration) => px(style.paddingLeft) + px(style.paddingRight);

// A row's width: its sides, its parts and the gaps between them.
const rowWidth = (row: Element, parts: number[]) => {
  const style = getComputedStyle(row);
  return sides(style) + parts.reduce((sum, part) => sum + part, 0) + px(style.gap) * (parts.length - 1);
};

// The width a box takes for its content: its own width if it sets one,
// held between its least and its most.
const boxWidth = (box: Element, content: number) => {
  const style = getComputedStyle(box);
  const most = px(style.maxWidth) || Number.POSITIVE_INFINITY;
  return Math.min(most, Math.max(px(style.minWidth), px(style.width) || content));
};

// A size the style leaves to the layout.
const unset = (value: string) => ["", "auto", "none"].includes(value);

const drawnWidth = (symbol: Element | null) => px(symbol?.getAttribute("width") ?? "");

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
    settle(pictures);
    expect(within(hall() ?? document.body).getByRole("region", { name: "TRICERATOPS" }).getAttribute("data-state")).toBe("built");
    expect(screen.getByLabelText("STARS").textContent).toBe("1/3");

    await user.click(screen.getByRole("button", { name: "HOME" }));
    expect(onHomePage()).toBe(true);

    await user.click(homeTile("SKELETONS"));
    expect([hall(), choices().length]).toEqual([null, 3]);

    await user.click(screen.getByRole("button", { name: "HOME" }));
    await user.click(museumButton());
    settle(pictures);
    await user.click(screen.getByRole("button", { name: "BUILD ANOTHER" }));
    expect([hall(), choices().length]).toEqual([null, 3]);
  });

  // The museum opens at once, so a double tap's second tap lands on the
  // museum screen. Every button there is tapped while it settles, so
  // whichever one stands under MUSEUM, the tap presses nothing.
  it("opens once on a quick double tap: the second tap presses nothing in the museum, and one HOME comes back once it settles", async () => {
    const { user, pictures } = openHomeApp();

    await user.click(museumButton());
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((each) => each.textContent)).toEqual(expect.arrayContaining(["HOME", "BUILD ANOTHER"]));
    for (const each of buttons) await user.click(each);

    expect(hall()).not.toBeNull();
    expect(pictures.timers()).toEqual([SETTLE]);
    settle(pictures);
    await user.click(button("HOME"));
    expect(onHomePage()).toBe(true);
  });

  it.each(["Language", "Theme"])("only closes the %s menu when tapped while the menu is open", async (label) => {
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

  it.each([
    ["en", 1024],
    ["ru", 1024],
    ["ru", 1133],
    ["en", 1366],
    ["ru", 1366]
  ] as const)("stands on one line with RexLab and the menus, in %s at %ipx wide, above the greeting", (language, width) => {
    openHomeApp({ deviceLanguage: DEVICES[language] });

    const button = museumButton(language);
    const museumStyle = getComputedStyle(button);
    expect(museumStyle.whiteSpace).toBe("nowrap");
    const museum = boxWidth(button, rowWidth(button, [drawnWidth(button.querySelector("svg")), wordWidth(TEXTS[language].museum, museumStyle)]));
    const menuButtons = [...partOf(".parent-menus").querySelectorAll(".parent-menu-button")].map((menuButton) => {
      const style = getComputedStyle(menuButton);
      const code = menuButton.querySelector(".parent-menu-code")?.textContent;
      const parts = [drawnWidth(menuButton.querySelector("svg")), ...(code ? [wordWidth(code, style)] : [])];
      return boxWidth(menuButton, rowWidth(menuButton, parts));
    });
    const corner = partOf(".home-corner");
    // The widths add up along one row, every part centred on it.
    for (const row of [corner, partOf(".parent-menus"), button, partOf(".wordmark")]) {
      const style = getComputedStyle(row);
      expect([style.display, style.flexDirection || "row", style.flexWrap || "nowrap", style.alignItems]).toEqual(["flex", "row", "nowrap", "center"]);
    }
    const cornerWidth = boxWidth(corner, rowWidth(corner, [museum, boxWidth(partOf(".parent-menus"), rowWidth(partOf(".parent-menus"), menuButtons))]));
    const wordmark = partOf(".wordmark");
    const wordmarkStyle = getComputedStyle(wordmark);
    const wordmarkWidth = rowWidth(wordmark, [px(getComputedStyle(partOf(".wordmark-mark")).width), wordWidth("RexLab", wordmarkStyle)]);

    const cornerLeft = width - px(getComputedStyle(corner).right) - cornerWidth;
    expect(cornerLeft - (px(wordmarkStyle.left) + wordmarkWidth)).toBeGreaterThanOrEqual(px(getComputedStyle(corner).gap));
    // The corner and the wordmark end above where the greeting begins.
    const greetingTop = px(getComputedStyle(partOf(".home")).paddingTop);
    const menusStyle = getComputedStyle(partOf(".parent-menus"));
    const menuHeight = Math.max(...[...partOf(".parent-menus").querySelectorAll(".parent-menu-button")].map((menuButton) => px(getComputedStyle(menuButton).minHeight)));
    const cornerHeight = Math.max(px(museumStyle.height), px(menusStyle.paddingTop) + menuHeight + px(menusStyle.paddingBottom));
    expect(px(getComputedStyle(corner).top) + cornerHeight).toBeLessThanOrEqual(greetingTop);
    expect(px(wordmarkStyle.top) + px(wordmarkStyle.height)).toBeLessThanOrEqual(greetingTop);
  });

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
