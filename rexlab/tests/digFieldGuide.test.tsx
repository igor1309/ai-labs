import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DigFieldGuideScreen, type FieldGuideCardView } from "../src/DigFieldGuideScreen.tsx";
import { TREASURE_KINDS, type TreasureKind } from "../src/dig/index.ts";
import type { Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { withPictures } from "./pictures.tsx";
import { fakeTreasurePicture, symbolOf, words } from "./support.ts";

// dig-field-guide.feature: the page of the treasures found, a card for
// each kind in the FIELD GUIDE's order.

// A card for each kind, with the counts found of each.
const guideCards = (found: Partial<Record<TreasureKind, number>>): FieldGuideCardView[] =>
  TREASURE_KINDS.map((kind) => ({ kind, picture: fakeTreasurePicture(kind), count: found[kind] ?? 0 }));

function showGuide(found: Partial<Record<TreasureKind, number>>, language: Language = "en") {
  const callbacks = { onBack: vi.fn(), onHome: vi.fn() };
  render(<DigFieldGuideScreen language={language} cards={guideCards(found)} {...callbacks} />, withPictures);
  return callbacks;
}

const cards = (language: Language = "en") => within(screen.getByRole("group", { name: TEXTS[language].treasureCards })).getAllByRole("region");

// What a card shows: its picture's address, its name, its count, and the
// address of the picture its outline is cut from.
const shown = (card: HTMLElement) => ({
  picture: card.querySelector("img")?.getAttribute("src"),
  name: card.querySelector("h2")?.textContent,
  count: card.querySelector(".dig-guide-count")?.textContent,
  outline: card.querySelector<HTMLElement>(".dig-guide-outline")?.style.getPropertyValue("--outline"),
  unknown: card.querySelector(".dig-guide-unknown")?.textContent
});

describe("the FIELD GUIDE page", () => {
  it("is titled FIELD GUIDE beside the book, under HOME and BACK, with the kinds found", () => {
    showGuide({ shell: 3, "egg-nest": 1 });
    const bar = screen.getByRole("banner");
    const title = within(bar).getByRole("heading", { level: 1 });

    expect([title.textContent, symbolOf(title)]).toEqual(["FIELD GUIDE", "book-open"]);
    expect([...bar.children].map((part) => words(part as HTMLElement))).toEqual(["HOME", "BACK", "FIELD GUIDE", "2/5"]);
    expect(within(bar).getByLabelText(TEXTS.en.kindsFound).textContent).toBe("2/5");
  });

  it("shows five cards in the FIELD GUIDE's order, each kind found with its picture, its name and its count, each other only as an outline and ?", () => {
    showGuide({ shell: 3, "egg-nest": 1 });
    const unknown = (kind: TreasureKind) => ({ picture: undefined, name: undefined, count: undefined, outline: `url("${fakeTreasurePicture(kind)}")`, unknown: "?" });

    expect(cards().map((card) => card.getAttribute("data-kind"))).toEqual(["shell", "tooth", "amber", "egg-nest", "golden-fossil"]);
    expect(cards().map((card) => card.getAttribute("aria-label"))).toEqual(["SHELL", "?", "?", "EGG NEST", "?"]);
    expect(cards().map(shown)).toEqual([
      { picture: fakeTreasurePicture("shell"), name: "SHELL", count: "×3", outline: undefined, unknown: undefined },
      unknown("tooth"),
      unknown("amber"),
      { picture: fakeTreasurePicture("egg-nest"), name: "EGG NEST", count: "×1", outline: undefined, unknown: undefined },
      unknown("golden-fossil")
    ]);
    // Only the words of a kind found are read out: an outline and its "?"
    // are pictures.
    expect(cards().map((card) => words(card))).toEqual(["SHELL×3", "", "", "EGG NEST×1", ""]);
    // A picture is square at its card's width, not its file's 400 high:
    // the page's rule for it sets the height itself, over the attribute.
    const rule = [...document.styleSheets].flatMap((sheet) => [...sheet.cssRules]).find((each): each is CSSStyleRule => each instanceof CSSStyleRule && each.selectorText.split(/,\s*/).includes(".dig-guide-picture"));
    expect([rule?.style.height, rule?.style.aspectRatio]).toEqual(["auto", "1 / 1"]);
  });

  it.each([
    [{}, "0/5"],
    [{ amber: 1 }, "1/5"],
    [{ shell: 12, tooth: 1, amber: 2, "egg-nest": 1, "golden-fossil": 4 }, "5/5"]
  ] as const)("counts the kinds found, not the treasures: %o reads %s", (found, kinds) => {
    showGuide(found);

    expect(screen.getByLabelText(TEXTS.en.kindsFound).textContent).toBe(kinds);
    expect(cards().filter((card) => card.hasAttribute("data-found")).map((card) => card.getAttribute("data-kind"))).toEqual(TREASURE_KINDS.filter((kind) => kind in found));
  });

  it.each([
    ["en", ["SHELL", "TOOTH", "AMBER", "EGG NEST", "GOLDEN FOSSIL"], ["HOME", "BACK", "FIELD GUIDE"]],
    ["ru", ["РАКУШКА", "ЗУБ", "ЯНТАРЬ", "ГНЕЗДО С ЯЙЦАМИ", "ЗОЛОТАЯ ОКАМЕНЕЛОСТЬ"], ["ДОМОЙ", "НАЗАД", "ПОЛЕВОЙ ДНЕВНИК"]]
  ] as const)("names every kind in capitals in %s", (language, names, bar) => {
    showGuide({ shell: 1, tooth: 1, amber: 1, "egg-nest": 1, "golden-fossil": 1 }, language);

    expect(cards(language).map((card) => card.querySelector("h2")?.textContent)).toEqual(names);
    expect([...screen.getByRole("banner").children].slice(0, 3).map((part) => words(part as HTMLElement))).toEqual(bar);
  });

  it("calls BACK and HOME once each, and nothing else", () => {
    const { onBack, onHome } = showGuide({ shell: 3 });

    fireEvent.click(screen.getByRole("button", { name: "BACK" }));
    expect([onBack.mock.calls.length, onHome.mock.calls.length]).toEqual([1, 0]);
    fireEvent.click(screen.getByRole("button", { name: "HOME" }));
    expect([onBack.mock.calls.length, onHome.mock.calls.length]).toEqual([1, 1]);
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("brings its cards in one after the other, each by its place in the row", () => {
    showGuide({ shell: 3, "egg-nest": 1 });

    expect(cards().map((card) => card.style.getPropertyValue("--card"))).toEqual(["0", "1", "2", "3", "4"]);
  });
});
