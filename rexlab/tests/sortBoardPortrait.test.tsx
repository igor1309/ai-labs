import { act, screen } from "@testing-library/react";
import { describe, expect, it, onTestFinished } from "vitest";
import type { PortraitLayouts } from "../src/App.tsx";
import type { AgeLevel } from "../src/ageLevel.ts";
import { refitPicture } from "../src/closingPicture.ts";
import { TEXTS } from "../src/language/texts.ts";
import { NARROW_SORT, PORTRAIT_SORT, sortBoardGeometry, sortBoardStyle, sortBoardWidth } from "../src/sortBoardLayout.ts";
import { openPairsApp } from "./pairsApp.tsx";
import { appStylesheet, NO_SAFE_AREA, type SafeArea } from "./stylesheet.ts";
import { gameDoor, manualViewport, type ManualViewport } from "./support.ts";
import { openWindow, styleAt, type WindowSize } from "./windowSizes.ts";

// sort-dinosaurs-board-portrait.feature in the app; its sums are
// sortBoardLayout.test.ts's.

const PORTRAIT_LAYOUTS: PortraitLayouts = { home: ["tall"], "sorting-board": ["tall"] };
const NARROW_LAYOUTS: PortraitLayouts = { home: ["tall", "tall-narrow"], "sorting-board": ["tall", "tall-narrow"] };

const narrowViewport = () => {
  const viewport = manualViewport("portrait");
  viewport.resize("tall-narrow", true);
  return viewport;
};

const part = (selector: string) => {
  const found = document.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector}`);
  return found;
};
const gateShown = () => part(".orientation-gate").hasAttribute("data-shown");
const trayCards = () => [...document.querySelectorAll<HTMLElement>(".sort-card")];
const baskets = () => [...document.querySelectorAll<HTMLElement>(".basket")];

// A board at `level` in a window of `size`.
async function openSort(size: WindowSize, level: AgeLevel, { insets = NO_SAFE_AREA, viewport = manualViewport("portrait", insets), layouts = PORTRAIT_LAYOUTS }: { insets?: SafeArea; viewport?: ManualViewport; layouts?: PortraitLayouts } = {}) {
  openWindow(...size);
  const app = openPairsApp({ viewport, portraitLayouts: layouts, ageLevel: { level, revision: `picked-${level}` } });
  await app.user.click(gameDoor(TEXTS.en.sort));
  return { ...app, viewport };
}

describe("sort's board upright", () => {
  it.each([
    [[744, 1133], "hatchling"],
    [[744, 1133], "explorer"],
    [[600, 1000], "paleontologist"],
    [[1024, 1366], "paleontologist"]
  ] as const)("stands upright at %j for a %s board, the screen giving the sizes the width sets", async (size, level) => {
    await openSort(size, level);
    expect([document.documentElement.dataset.size, gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual(["tall", false, false]);
    expect(screen.queryByRole("img", { name: TEXTS.en.turnSideways })).toBeNull();
    const sort = part(".sort");
    const expected = sortBoardStyle(sortBoardWidth(size[0], 0, 0), trayCards().length, baskets().length);
    for (const [name, value] of Object.entries(expected)) expect(sort.style.getPropertyValue(name), name).toBe(value);
    // The stylesheet's contracts the sums rely on.
    const page = styleAt(sort, size);
    expect([...sort.children].map((child) => child.className)).toEqual(["stratum stratum-1", "sort-bar", "prompt", "sort-tray-area", "baskets"]);
    expect([page.px("padding-top"), page.px("padding-bottom"), page.px("padding-left"), page.px("padding-right"), page.rowGap()]).toEqual([
      PORTRAIT_SORT.topPadding, PORTRAIT_SORT.bottomPadding, PORTRAIT_SORT.sidePadding, PORTRAIT_SORT.sidePadding, PORTRAIT_SORT.gap
    ]);
    expect([page.px("min-height"), page.value("height")]).toEqual([size[1], "auto"]);
    const tray = styleAt(part(".sort-tray"), size);
    expect([tray.rowGap(), tray.columnGap(), tray.value("justify-content")]).toEqual([PORTRAIT_SORT.cardsDown, PORTRAIT_SORT.cardsAcross, "center"]);
    // 604: the padding, the bar, the prompt, three gaps and the baskets' least.
    expect(tray.value("grid-template-columns")).toBe(
      "repeat(var(--upright-columns), max(120px, min(var(--card-by-width), ((100vh - (604px + 0px + 0px) - (var(--upright-rows) - 1) * 12px) / var(--upright-rows) - var(--strip)) / 0.75)))"
    );
    expect(PORTRAIT_SORT.topPadding + PORTRAIT_SORT.bottomPadding + PORTRAIT_SORT.bar + PORTRAIT_SORT.prompt + 3 * PORTRAIT_SORT.gap + PORTRAIT_SORT.basketsMinimum).toBe(604);
    expect(styleAt(part(".sort-art"), size).value("aspect-ratio")).toBe("4 / 3");
    expect(styleAt(part(".sort-footer"), size).value("height")).toBe(expected["--strip"]);
    const room = styleAt(part(".baskets"), size);
    expect([room.value("flex-grow"), room.value("flex-shrink"), room.px("min-height")]).toEqual(["1", "0", PORTRAIT_SORT.basketsMinimum]);
    const basket = styleAt(baskets()[0]!, size);
    expect([basket.px("padding-top"), basket.px("padding-left")]).toEqual([PORTRAIT_SORT.basketPadding, PORTRAIT_SORT.basketPadding]);
    expect(styleAt(part(".basket-label"), size).value("flex-direction")).toBe("column");
    const name = styleAt(part(".basket-name"), size);
    expect([name.value("font-size"), name.value("white-space")]).toEqual([expected["--basket-type"], "normal"]);
  });

  it("takes the side insets and the scrollbar from the viewport", async () => {
    const viewport = { ...manualViewport("portrait", { left: 19, right: 13 }), scrollbarWidth: () => 16 };
    await openSort([744, 1133], "explorer", { viewport });
    expect(part(".sort").style.getPropertyValue("--card-by-width")).toBe(sortBoardStyle(744 - 19 - 13 - 64 - 16, trayCards().length, baskets().length)["--card-by-width"]);
  });

  it("taps a card into a basket upright, as in landscape", async () => {
    const { user } = await openSort([820, 1180], "hatchling");
    const [card] = trayCards();
    await user.click(card!);
    expect(card!.getAttribute("aria-pressed")).toBe("true");
    await user.click(baskets()[0]!);
    expect(document.querySelectorAll(".sort-card[aria-pressed='true']")).toHaveLength(0);
  });

  it("takes the phone's sizes as a tall window narrows over the board, asking nothing", async () => {
    const viewport = manualViewport("portrait");
    await openSort([820, 1180], "hatchling", { viewport, layouts: NARROW_LAYOUTS });
    const board = part(".sort");
    openWindow(393, 852);
    act(() => viewport.resize("tall-narrow", true));
    expect([document.documentElement.dataset.size, gateShown(), part(".gated-screen").hasAttribute("inert"), part(".sort")]).toEqual(["tall-narrow", false, false, board]);
    expect(part(".sort").style.getPropertyValue("--card-by-width")).toBe(sortBoardStyle(sortBoardWidth(393, 0, 0, 0, NARROW_SORT), trayCards().length, baskets().length, NARROW_SORT)["--card-by-width"]);
  });

  it("keeps the landscape board as it was", async () => {
    await openSort([1180, 820], "explorer", { viewport: manualViewport("landscape") });
    expect([document.documentElement.dataset.size, gateShown()]).toEqual(["wide", false]);
    const page = getComputedStyle(part(".sort"));
    expect([page.height, page.paddingLeft]).toEqual(["820px", "56px"]);
    expect(getComputedStyle(part(".sort-tray")).gridTemplateColumns).toBe("repeat(var(--columns), minmax(0, 1fr))");
    expect(getComputedStyle(part(".basket-label")).flexDirection || "row").toBe("row");
  });

  it("puts the bar below the top inset and the baskets above the home indicator", async () => {
    const insets = { top: 24, right: 13, bottom: 20, left: 19 };
    const sheet = Object.assign(document.createElement("style"), { textContent: appStylesheet(insets) });
    document.head.append(sheet);
    onTestFinished(() => sheet.remove());
    await openSort([744, 1133], "explorer", { insets });
    const page = getComputedStyle(part(".sort"));
    expect([page.paddingTop, page.paddingRight, page.paddingBottom, page.paddingLeft]).toEqual(["64px", "45px", "68px", "51px"]);
    expect(getComputedStyle(part(".sort-tray")).gridTemplateColumns).toContain("(604px + 24px + 20px)");
  });

  it("marks the tray's cards, the baskets and the cards in them as parts a turn glides, the cards travelling as fitted copies", async () => {
    const { user } = await openSort([820, 1180], "hatchling");
    const [card] = trayCards();
    const id = card!.getAttribute("data-turn-part");
    for (const each of trayCards()) expect(each.getAttribute("data-turn-part")).toMatch(/^sort-card-./);
    expect(new Set(trayCards().map((each) => each.getAttribute("data-turn-part"))).size).toBe(trayCards().length);
    expect(baskets().map((each) => each.getAttribute("data-turn-part"))).toEqual(baskets().map((each) => `basket-${Object.entries(TEXTS.en.baskets).find(([, name]) => name === each.getAttribute("aria-label"))![0]}`));
    for (const basket of baskets()) {
      await user.click(trayCards().find((each) => each.getAttribute("data-turn-part") === id)!);
      await user.click(basket);
      if (document.querySelector(".sorted-card")) break;
    }
    const sorted = part(".sorted-card");
    expect(sorted.getAttribute("data-turn-part")).toBe(id!.replace("sort-card-", "sorted-card-"));
    const box = { left: 0, top: 0, width: 100, height: 100 };
    for (const element of [trayCards()[0]!, sorted]) {
      const copy = refitPicture(element, box);
      expect(copy).toBeDefined();
      copy!.remove();
    }
    expect(refitPicture(baskets()[0]!, box)).toBeUndefined();
  });
});

// "The board stands upright on a phone": the window, the level, the
// tray's rows and columns, each card's width and whether it scrolls.
const PHONES = [
  [[320, 568], "hatchling", 2, 3, 72, true],
  [[393, 852], "hatchling", 2, 3, 112, false],
  [[393, 852], "explorer", 2, 4, 82, false],
  [[393, 852], "paleontologist", 3, 4, 82, false],
  [[430, 932], "paleontologist", 3, 4, 92, false]
] as const;

describe("sort's board upright on a phone", () => {
  it.each(PHONES)("stands upright at %j for a %s board, %i rows of %i, each card %i wide, scrolling %s", async (size, level, rows, columns, card, scrolls) => {
    await openSort(size, level, { viewport: narrowViewport(), layouts: NARROW_LAYOUTS });
    expect([document.documentElement.dataset.size, gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual(["tall-narrow", false, false]);
    const sizes = NARROW_SORT;
    const sort = part(".sort");
    const expected = sortBoardStyle(sortBoardWidth(size[0], 0, 0, 0, sizes), trayCards().length, baskets().length, sizes);
    for (const [name, value] of Object.entries(expected)) expect(sort.style.getPropertyValue(name), name).toBe(value);
    const page = styleAt(sort, size);
    expect([page.px("padding-top"), page.px("padding-bottom"), page.px("padding-left"), page.px("padding-right"), page.rowGap()]).toEqual([
      sizes.topPadding, sizes.bottomPadding, sizes.sidePadding, sizes.sidePadding, sizes.gap
    ]);
    expect([page.px("min-height"), page.value("height")]).toEqual([size[1], "auto"]);
    // HOME is its house alone, 56 square.
    const home = styleAt(part(".sort-bar .home-button"), size);
    expect([home.px("width"), home.value("flex-shrink"), styleAt(part(".sort-bar .home-button .narrow-hidden"), size).value("position")]).toEqual([56, "0", "absolute"]);
    expect(styleAt(part(".sort-bar"), size).columnGap()).toBe(16);
    expect(styleAt(part(".sort .prompt"), size).px("font-size")).toBe(22);
    const tray = styleAt(part(".sort-tray"), size);
    expect([tray.rowGap(), tray.columnGap(), tray.value("justify-content")]).toEqual([sizes.cardsDown, sizes.cardsAcross, "center"]);
    // 456: the padding, the bar, the prompt, three gaps and the baskets' least.
    expect(tray.value("grid-template-columns")).toBe(
      "repeat(var(--upright-columns), max(72px, min(var(--card-by-width), ((100vh - (456px + 0px + 0px) - (var(--upright-rows) - 1) * 8px) / var(--upright-rows) - var(--strip)) / 0.75)))"
    );
    expect(sizes.topPadding + sizes.bottomPadding + sizes.bar + sizes.prompt + 3 * sizes.gap + sizes.basketsMinimum).toBe(456);
    const room = styleAt(part(".baskets"), size);
    expect([room.value("flex-grow"), room.px("min-height"), room.columnGap()]).toEqual(["1", sizes.basketsMinimum, sizes.basketsGap.two]);
    for (const basket of baskets()) {
      const own = styleAt(basket, size);
      expect([own.px("padding-top"), own.px("padding-left")]).toEqual([sizes.basketPadding, sizes.basketPadding]);
      // Each basket its mark alone, its name kept for screen readers.
      const name = basket.querySelector(".basket-name")!;
      expect([styleAt(name, size).value("position"), styleAt(name, size).px("width"), basket.getAttribute("aria-label")]).toEqual(["absolute", 1, name.textContent]);
    }
    const geometry = sortBoardGeometry(trayCards().length, baskets().length, size[0], size[1], 0, 0, 0, sizes);
    expect([geometry.rows, geometry.columns, Math.abs(geometry.card - card) <= 2, geometry.scrolls]).toEqual([rows, columns, true, scrolls]);
  });
});
