import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.tsx";
import { HomePage } from "../src/HomePage.tsx";
import { LANGUAGES } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { PROGRESS_KEY, localCareProgress, localProgress, localSortingProgress } from "../src/localProgress.ts";
import { careRecord } from "./careApp.tsx";
import { openMenu, outsideMenu } from "./menus.ts";
import {
  SHIPPED_CATALOGUE,
  SHIPPED_DINOSAURS,
  emptyCare,
  emptyProgress,
  emptySorting,
  englishDevice,
  fakeBodyPicture,
  lightDevice,
  loadedPictures,
  manualPictures,
  manualOrientation,
  memoryStorage,
  seededRandom,
  symbolOf,
  type MemoryStorage
} from "./support.ts";

function openHomePage(progress = emptyProgress(), pictures = loadedPictures(), care = emptyCare(), sorting = emptySorting()) {
  render(<App dinosaurs={SHIPPED_DINOSAURS} catalogue={SHIPPED_CATALOGUE} bodyPicture={fakeBodyPicture} random={seededRandom(7)} orientation={manualOrientation("landscape")} progress={progress} {...englishDevice()} {...lightDevice()} {...care} {...sorting} {...pictures} />);
  return { user: userEvent.setup(), card: screen.getByRole("button", { name: "COMPARE" }) };
}

const withStorage = (storage: MemoryStorage) => localProgress(() => storage);

const withSorting = (storage: MemoryStorage) => ({ sortingProgress: localSortingProgress(() => storage) });

// A stored record in the section 5 format of docs/mvp-infrastructure.md.
const record = (bestScore: number | null) =>
  JSON.stringify({ schemaVersion: 1, games: { "compare-dinosaurs": { bestScore, roundsPlayed: 3 } } });

// The same record, for the sorting game.
const sortingRecord = (bestScore: number | null) =>
  JSON.stringify({ schemaVersion: 1, games: { "sort-dinosaurs": { bestScore, roundsPlayed: 2 } } });

const nothing = () => {};

// The home page alone, its SORT card's taps counted in `taps`.
function renderHomePage(taps: number[]) {
  render(
    <HomePage
      language="en"
      onLanguage={nothing}
      theme="light"
      onTheme={nothing}
      faceOff={{ left: fakeBodyPicture("tyrannosaurus"), right: fakeBodyPicture("brachiosaurus") }}
      best={undefined}
      catalogue={{ picture: fakeBodyPicture("stegosaurus"), count: SHIPPED_CATALOGUE.length }}
      care={{ picture: fakeBodyPicture("parasaurolophus"), best: undefined }}
      sort={{ picture: fakeBodyPicture("triceratops"), best: undefined }}
      moreComing={fakeBodyPicture("stegosaurus")}
      onCompareDinosaurs={nothing}
      onCatalogue={nothing}
      onCare={nothing}
      onSort={() => taps.push(1)}
    />
  );
  return { user: userEvent.setup(), card: screen.getByRole("button", { name: "SORT" }) };
}

// The name of every symbol an element shows, in order.
const symbolsOf = (element: Element) =>
  [...element.querySelectorAll("svg.lucide")].map((svg) => [...svg.classList].find((name) => name.startsWith("lucide-"))?.slice("lucide-".length));

const moreComing = () => {
  const card = document.querySelector<HTMLElement>(".more-coming");
  if (!card) throw new Error("No MORE COMING card on the page");
  return card;
};

// jsdom lays nothing out, so the width of each title in every language
// is given here in ems of its bold face, rounded up: Lexend's for the
// Latin words, and the iPad's own face for the Cyrillic ones, which
// Lexend has no letters for. A title missing here fails the test that
// reads it.
const TITLE_EMS: Record<string, number> = {
  COMPARE: 5.1,
  СРАВНИ: 4.1,
  "ALL DINOSAURS": 8.6,
  "ВСЕ ДИНОЗАВРЫ": 8.8,
  CARE: 2.8,
  ПОЗАБОТЬСЯ: 6.9,
  SORT: 2.9,
  РАЗЛОЖИ: 5.2
};

// The words each title on the home page shows.
const TITLE_TEXTS: Record<string, "quizCard" | "catalogue" | "care" | "sort"> = {
  "quiz-card-title": "quizCard",
  "catalogue-tile-title": "catalogue",
  "care-tile-title": "care",
  "sort-tile-title": "sort"
};

const px = (value: string) => Number.parseFloat(value) || 0;

// jsdom keeps a gap as it is written, unexpanded.
const columnGapOf = (style: CSSStyleDeclaration) => px(style.gap.split(" ").at(-1) ?? "");

const sidesOf = (style: CSSStyleDeclaration) => px(style.paddingLeft) + px(style.paddingRight) + px(style.borderLeftWidth) + px(style.borderRightWidth);

// The width each column of the games takes on a page `width` wide: the
// columns grow from nothing by their shares of what the page's padding,
// the gaps and their own sides leave.
function columnWidths(width: number) {
  const home = document.querySelector(".home");
  const games = document.querySelector(".games");
  if (!home || !games) throw new Error("No games on the page");
  const columns = [...games.children].map((column) => ({ column, style: getComputedStyle(column) }));
  expect(columns.map(({ style }) => [style.flexBasis, style.minWidth])).toEqual(columns.map(() => ["0px", "0px"]));
  const free = width - sidesOf(getComputedStyle(home)) - columnGapOf(getComputedStyle(games)) * (columns.length - 1) - columns.reduce((sum, { style }) => sum + sidesOf(style), 0);
  const shares = columns.reduce((sum, { style }) => sum + Number(style.flexGrow), 0);
  return new Map(columns.map(({ column, style }) => [column, (free * Number(style.flexGrow)) / shares + sidesOf(style)]));
}

// The width a title has on a page `width` wide: its card's column, short
// of the sides of the card and the row, and of the row's other parts and
// the gaps between them.
function roomFor(title: Element, width: number) {
  const row = title.parentElement;
  const card = title.closest("button");
  const column = [...columnWidths(width)].find(([column]) => column.contains(card));
  if (!row || !card || !column) throw new Error("A title outside the games");
  const others = [...row.children].filter((child) => child !== title);
  return (
    column[1] -
    sidesOf(getComputedStyle(card)) -
    sidesOf(getComputedStyle(row)) -
    others.reduce((sum, other) => sum + px(getComputedStyle(other).width), 0) -
    columnGapOf(getComputedStyle(row)) * others.length
  );
}

const brightness = (element: Element) => {
  const match = /brightness\(([\d.]+)\)/.exec(getComputedStyle(element).filter);
  return match?.[1] === undefined ? 1 : Number(match[1]);
};

describe("the home page", () => {
  it("offers the quiz as a card with the app's own Tyrannosaurus and Brachiosaurus facing off", () => {
    const { card } = openHomePage();

    expect(card.textContent).toBe("COMPARE");
    expect(symbolOf(card)).toBe("scale");
    const faceOff = within(card).getByRole("img", { name: "TWO DINOSAURS" });
    const pictures = [...faceOff.querySelectorAll("img")];
    expect(pictures.map((picture) => picture.getAttribute("src"))).toEqual([fakeBodyPicture("tyrannosaurus"), fakeBodyPicture("brachiosaurus")]);
  });

  it("lays the games out in three columns, 3 : 2 : 2 of the width: COMPARE, ALL DINOSAURS over CARE, then SORT over MORE COMING", () => {
    const { card } = openHomePage();

    const games = card.parentElement;
    expect(games?.classList.contains("games")).toBe(true);
    const catalogue = screen.getByRole("button", { name: "ALL DINOSAURS" });
    const care = screen.getByRole("button", { name: "CARE" });
    const sort = screen.getByRole("button", { name: "SORT" });
    const tiles = catalogue.parentElement;
    const third = sort.parentElement;
    expect([...(tiles?.children ?? [])]).toEqual([catalogue, care]);
    expect([...(third?.children ?? [])]).toEqual([sort, moreComing()]);
    expect([...(games?.children ?? [])]).toEqual([card, tiles, third]);
    expect(
      [card, tiles, third].map((column) => {
        const style = getComputedStyle(column ?? card);
        return [style.flexGrow, style.flexBasis, style.alignSelf];
      })
    ).toEqual([
      ["3", "0px", "auto"],
      ["2", "0px", "auto"],
      ["2", "0px", "auto"]
    ]);
    expect(getComputedStyle(games ?? card).alignItems).toBe("normal");
    // Each column's two cards share its height.
    expect(
      [catalogue, care, sort, moreComing()].map((tile) => {
        const style = getComputedStyle(tile);
        return [style.flexGrow, style.flexBasis, style.minHeight];
      })
    ).toEqual([0, 1, 2, 3].map(() => ["1", "0px", "0px"]));
    expect([tiles, third].map((column) => getComputedStyle(column ?? card).flexDirection)).toEqual(["column", "column"]);
  });

  it.each([1024, 1180, 1366])(
    "keeps the title of every game on one line in every language at %ipx wide, the tiles' at least 24px and their counts at least 20px in the pictures' corners",
    (width) => {
      const careStorage = memoryStorage({ [PROGRESS_KEY]: careRecord({ bestScore: 7, visitsFinished: 1, friends: [] }) });
      openHomePage(
        withStorage(memoryStorage({ [PROGRESS_KEY]: record(7) })),
        loadedPictures(),
        { ...emptyCare(), careProgress: localCareProgress(() => careStorage) },
        withSorting(memoryStorage({ [PROGRESS_KEY]: sortingRecord(4) }))
      );

      const titles = [...document.querySelectorAll(Object.keys(TITLE_TEXTS).map((name) => `.${name}`).join(", "))];
      expect(titles.map((title) => [title.textContent, getComputedStyle(title).whiteSpace])).toEqual([
        ["COMPARE", "nowrap"],
        ["ALL DINOSAURS", "nowrap"],
        ["CARE", "nowrap"],
        ["SORT", "nowrap"]
      ]);
      const overflowing = titles.flatMap((title) => {
        const style = getComputedStyle(title);
        const room = roomFor(title, width);
        const key = TITLE_TEXTS[title.className];
        // A size worked out by the browser, such as one from the tile's
        // width, cannot be read here, so a title's size is in pixels.
        if (!/^[\d.]+px$/.test(style.fontSize)) return [`${title.textContent}: a size of ${style.fontSize}`];
        return LANGUAGES.map((language) => (key ? TEXTS[language][key] : "")).flatMap((words) => {
          const ems = TITLE_EMS[words];
          if (ems === undefined) return [`${words}: no width in ems`];
          const needed = ems * px(style.fontSize) + px(style.letterSpacing) * words.length;
          return needed > room ? [`${words}: ${needed.toFixed(1)}px in ${room.toFixed(1)}px`] : [];
        });
      });
      expect(overflowing).toEqual([]);

      const tiles = ["ALL DINOSAURS", "CARE", "SORT"].map((name) => screen.getByRole("button", { name }));
      expect(tiles.map((tile) => px(getComputedStyle(tile.querySelector('[class$="-tile-title"]') ?? tile).fontSize) >= 24)).toEqual([true, true, true]);
      const counts = tiles.map((tile) => tile.querySelector(".catalogue-tile-count, .care-tile-best, .sort-tile-best"));
      expect(counts.map((count) => [count?.textContent, count?.parentElement === count?.closest("button"), getComputedStyle(count ?? document.body).position])).toEqual([
        [String(SHIPPED_CATALOGUE.length), true, "absolute"],
        ["7", true, "absolute"],
        ["4", true, "absolute"]
      ]);
      expect(counts.map((count) => px(getComputedStyle(count ?? document.body).fontSize) >= 20)).toEqual([true, true, true]);
      expect(tiles.map((tile) => getComputedStyle(tile).position)).toEqual(["relative", "relative", "relative"]);
    }
  );

  it("shows MORE COMING under SORT as a picture, not a button: a faded Stegosaurus over a lock", () => {
    openHomePage();

    const card = moreComing();
    expect(card.textContent).toBe("MORE COMING");
    expect(symbolsOf(card)).toEqual(["lock"]);
    const picture = card.querySelector("img");
    expect(picture?.getAttribute("src")).toBe(fakeBodyPicture("stegosaurus"));
    expect(Number(getComputedStyle(picture ?? card).opacity)).toBeLessThan(1);
    expect(card.closest("button")).toBeNull();
    expect(within(card).queryAllByRole("button")).toEqual([]);
    expect([card, ...card.querySelectorAll("*")].filter((element) => element instanceof HTMLElement && element.tabIndex >= 0)).toEqual([]);
  });

  it("does nothing on a tap or a press of MORE COMING, and it neither brightens nor presses in", async () => {
    const { user } = openHomePage();
    const card = moreComing();
    const before = document.body.innerHTML;

    await user.hover(card);
    expect(brightness(card)).toBe(1);
    await user.pointer({ keys: "[TouchA>]", target: card });
    expect([brightness(card), getComputedStyle(card).transform]).toEqual([1, "none"]);
    await user.pointer({ keys: "[/TouchA]", target: card });
    await user.click(card);
    await user.unhover(card);

    expect(document.body.innerHTML).toBe(before);
    expect(screen.queryByLabelText("PROGRESS")).toBeNull();
  });

  it("shows the best score in the quiz card's corner, over the face-off, beside a trophy", () => {
    const { card } = openHomePage(withStorage(memoryStorage({ [PROGRESS_KEY]: record(7) })));

    const best = card.querySelector(".quiz-card-best");
    expect(best && [symbolOf(best), best.textContent]).toEqual(["trophy", "7"]);
    expect(best?.parentElement).toBe(card);
    expect(card.querySelector(".quiz-card-footer")?.contains(best)).toBe(false);
    const [cardStyle, style] = [getComputedStyle(card), getComputedStyle(best ?? card)];
    expect([cardStyle.position, style.position]).toEqual(["relative", "absolute"]);
    expect([style.top, style.right]).toEqual(["24px", "24px"]);
  });

  it.each([
    ["no round finished yet", memoryStorage()],
    ["no best kept", memoryStorage({ [PROGRESS_KEY]: record(null) })],
    ["storage that cannot be read", memoryStorage({ [PROGRESS_KEY]: record(7) }, { read: false })]
  ])("shows no best score on the quiz card with %s", (_, storage) => {
    const { card } = openHomePage(withStorage(storage));

    expect(card.querySelector(".quiz-card-best")).toBeNull();
    expect(symbolsOf(card)).toEqual(["scale"]);
  });

  it("offers the sorting game as a SORT card with a Triceratops beside a symbol of shapes, and no best score before a board is finished", () => {
    openHomePage();

    const sort = screen.getByRole("button", { name: "SORT" });
    expect(sort.textContent).toBe("SORT");
    expect(symbolsOf(sort)).toEqual(["shapes"]);
    expect(sort.querySelector("img")?.getAttribute("src")).toBe(fakeBodyPicture("triceratops"));
    const title = sort.querySelector(".sort-tile-title");
    expect(title?.previousElementSibling?.contains(sort.querySelector("svg.lucide-shapes"))).toBe(true);
    expect(sort.querySelector(".sort-tile-best")).toBeNull();
  });

  it("shows the sorting game's best score in the SORT card's picture's corner, beside a trophy", () => {
    openHomePage(emptyProgress(), loadedPictures(), emptyCare(), withSorting(memoryStorage({ [PROGRESS_KEY]: sortingRecord(4) })));

    const sort = screen.getByRole("button", { name: "SORT" });
    const best = sort.querySelector(".sort-tile-best");
    expect(best && [symbolOf(best), best.textContent]).toEqual(["trophy", "4"]);
    expect(best?.parentElement).toBe(sort);
    expect(sort.querySelector(".sort-tile-row")?.contains(best)).toBe(false);
    const [cardStyle, style] = [getComputedStyle(sort), getComputedStyle(best ?? sort)];
    expect([cardStyle.position, style.position, style.top, style.right]).toEqual(["relative", "absolute", "12px", "12px"]);
    expect(screen.getByRole("button", { name: "COMPARE" }).querySelector(".quiz-card-best")).toBeNull();
  });

  it.each([
    ["no best kept", memoryStorage({ [PROGRESS_KEY]: sortingRecord(null) })],
    ["storage that cannot be read", memoryStorage({ [PROGRESS_KEY]: sortingRecord(4) }, { read: false })],
    ["only the quiz's best kept", memoryStorage({ [PROGRESS_KEY]: record(7) })]
  ])("shows no best score on the SORT card with %s", (_, storage) => {
    openHomePage(emptyProgress(), loadedPictures(), emptyCare(), withSorting(storage));

    const sort = screen.getByRole("button", { name: "SORT" });
    expect(sort.querySelector(".sort-tile-best")).toBeNull();
    expect(symbolsOf(sort)).toEqual(["shapes"]);
  });

  it("brightens the SORT card under a pointer", async () => {
    const { user, card } = renderHomePage([]);
    expect(brightness(card)).toBe(1);

    await user.hover(card);
    expect(brightness(card)).toBeGreaterThan(1);

    await user.unhover(card);
    expect(brightness(card)).toBe(1);
  });

  it("shows the SORT card pressed before the game is opened, and opens it as the press ends", async () => {
    const taps: number[] = [];
    const { user, card } = renderHomePage(taps);

    await user.pointer({ keys: "[TouchA>]", target: card });

    expect(getComputedStyle(card).transform).toMatch(/^scale\(0\.\d+\)$/);
    expect(taps).toEqual([]);

    await user.pointer({ keys: "[/TouchA]", target: card });

    expect(taps).toEqual([1]);
    expect(getComputedStyle(card).transform).toBe("none");
  });

  it("opens the sorting game once for each tap on the SORT card", async () => {
    const taps: number[] = [];
    const { user, card } = renderHomePage(taps);

    await user.click(card);
    expect(taps).toEqual([1]);

    await user.click(card);
    expect(taps).toEqual([1, 1]);
  });

  it("shows the RexLab wordmark, small, in the top-left corner", () => {
    const { card } = openHomePage();

    const wordmark = screen.getByText("RexLab");
    const style = getComputedStyle(wordmark);
    expect(style.position).toBe("fixed");
    expect(style.top).toMatch(/^[\d.]+(px|rem)$/);
    expect(style.left).toMatch(/^[\d.]+(px|rem)$/);
    expect(parseFloat(style.fontSize)).toBeLessThan(parseFloat(getComputedStyle(within(card).getByText("COMPARE")).fontSize) / 2);
  });

  it("opens one menu for parents at a time, and a tap outside it does not start a round", async () => {
    const { user } = openHomePage();

    await openMenu(user, "Language");
    await openMenu(user, "Theme");

    expect(screen.getAllByRole("menu").map((menu) => menu.getAttribute("aria-label"))).toEqual(["Theme"]);

    await user.click(outsideMenu());

    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.queryByLabelText("PROGRESS")).toBeNull();
    expect(document.querySelector(".menu-backdrop")).toBeNull();
  });

  it("closes a menu for parents with Escape, back on its button, after the keys move through its choices", async () => {
    const { user } = openHomePage();

    const menu = await openMenu(user, "Theme");

    expect(document.activeElement?.textContent).toBe("System");
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement?.textContent).toBe("Light");
    await user.keyboard("{End}");
    expect(document.activeElement?.textContent).toBe("Dark");
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement?.textContent).toBe("System");
    await user.keyboard("{ArrowUp}");
    expect(document.activeElement?.textContent).toBe("Dark");
    await user.keyboard("{Home}");
    expect(document.activeElement?.textContent).toBe("System");
    expect(menu.contains(document.activeElement)).toBe(true);

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Theme" }));
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("brightens the quiz card under a pointer", async () => {
    const { user, card } = openHomePage();
    expect(brightness(card)).toBe(1);

    await user.hover(card);
    expect(brightness(card)).toBeGreaterThan(1);

    await user.unhover(card);
    expect(brightness(card)).toBe(1);
  });

  it("shows the card pressed before the round opens", async () => {
    const { user, card } = openHomePage();

    await user.pointer({ keys: "[TouchA>]", target: card });

    expect(getComputedStyle(card).transform).toMatch(/^scale\(0\.\d+\)$/);
    expect(screen.queryByLabelText("PROGRESS")).toBeNull();

    await user.pointer({ keys: "[/TouchA]", target: card });

    expect(screen.getByLabelText("PROGRESS").textContent).toBe("1/10");
  });

  it("starts a round of 10 questions on a tap", async () => {
    const { user, card } = openHomePage();

    await user.click(card);

    expect(screen.getByLabelText("PROGRESS").textContent).toBe("1/10");
    expect(within(screen.getByRole("group", { name: "DINOSAURS" })).getAllByRole("button")).toHaveLength(2);
  });
});

describe("the first question of a round", () => {
  const progressShown = () => screen.queryByLabelText("PROGRESS")?.textContent;
  const picturesShown = () =>
    within(screen.getByRole("group", { name: "DINOSAURS" }))
      .getAllByRole("img")
      .map((picture) => picture.getAttribute("src"));

  it("waits for its pictures, with the home page on screen until both have loaded", async () => {
    const pictures = manualPictures();
    const { user, card } = openHomePage(emptyProgress(), pictures);

    await user.click(card);

    const asked = pictures.loading();
    expect(asked).toHaveLength(2);
    expect(pictures.timers()).toEqual([1000]);
    act(() => pictures.finish(asked[0] ?? ""));
    expect(progressShown()).toBeUndefined();
    expect(screen.getByRole("button", { name: "COMPARE" })).toBeDefined();

    act(() => pictures.finish(asked[1] ?? ""));

    expect(progressShown()).toBe("1/10");
    expect(picturesShown()).toEqual(asked);
    expect(pictures.timers()).toEqual([]);
  });

  it("starts after a second when its pictures are slow, and not again when they arrive", async () => {
    const pictures = manualPictures();
    const { user, card } = openHomePage(emptyProgress(), pictures);
    await user.click(card);
    const asked = pictures.loading();

    act(() => pictures.fire(1000));

    expect(progressShown()).toBe("1/10");
    expect(picturesShown()).toEqual(asked);
    const first = document.body.innerHTML;
    act(() => asked.forEach(pictures.finish));
    expect(document.body.innerHTML).toBe(first);
  });

  it("starts one round on a quick double tap while its pictures load", async () => {
    const pictures = manualPictures();
    const { user, card } = openHomePage(emptyProgress(), pictures);

    await user.dblClick(card);

    const asked = pictures.loading();
    expect(asked).toHaveLength(2);
    expect(pictures.timers()).toEqual([1000]);
    act(() => asked.forEach(pictures.finish));
    expect(progressShown()).toBe("1/10");
    expect(picturesShown()).toEqual(asked);
  });
});
