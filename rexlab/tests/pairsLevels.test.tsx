import { NO_LEVEL_OFFER } from "../src/levelOffer.ts";
import { act, fireEvent, isInaccessible, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AGE_LEVELS, type AgeLevel, type AgeLevelSetting } from "../src/ageLevel.ts";
import { LANGUAGES, type Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { PROGRESS_KEY } from "../src/localProgress.ts";
import { MENU_EXIT } from "../src/ParentMenu.tsx";
import { openMenu } from "./menus.ts";
import { LEVEL_EMS } from "./levelEms.ts";
import { CLIMB_LEVELS } from "../src/pairs/index.ts";
import { board, openPairsApp, pairCards, pairsRecord, playBoard, storedPairs, type PairsAppOptions, type StoredPairs } from "./pairsApp.tsx";
import { SHIPPED_PALS, contrast, fakeBodyPicture, homeTile, manualTimers, memoryStorage, pictureClock, seededRandom, seenOn, surfaceOf, type ManualPictures, type ManualTimers } from "./support.ts";

// find-the-pair-levels.feature, the welcome screen's level switch, and
// the choice on it kept in find the pair's progress
// (find-the-pair-level-progress.feature).

const DEVICES: Record<Language, string> = { en: "en-GB", ru: "ru-RU" };

const THEMES = ["light", "dark"] as const;

const SCREEN = { width: 1024, height: 768 };

const NAMES = AGE_LEVELS.map((level) => TEXTS.en.ageLevels[level].name);

const picked = (level: AgeLevel, revision = `picked-${level}`): AgeLevelSetting => ({ level, revision });

const button = (name: string) => screen.getByRole("button", { name });
const levelSwitch = (language: Language = "en") => screen.getByRole("group", { name: TEXTS[language].ageLevelSwitch });
const chosen = () =>
  within(levelSwitch())
    .getAllByRole("button", { pressed: true })
    .map((level) => level.querySelector(".pairs-level-name")?.textContent);
const climbChip = () => screen.getByLabelText("LEVEL");

const px = (value: string) => Number.parseFloat(value) || 0;
// jsdom keeps a gap only as the shorthand, row gap first.
const columnGapOf = (style: CSSStyleDeclaration) => px(style.gap.split(" ").at(-1) ?? "");
const rowGapOf = (style: CSSStyleDeclaration) => px(style.gap.split(" ")[0] ?? "");

const pals = (...ids: string[]) =>
  ids.map((id) => {
    const found = SHIPPED_PALS.find((each) => each.id === id);
    if (!found) throw new Error(`No ${id} in the shipped list`);
    return found;
  });

const entry = (progress: Partial<StoredPairs> = {}): StoredPairs => ({ stars: 0, level: 1, boardsOnLevel: 0, best: {}, found: [], ...progress });

const stored = (progress: Partial<StoredPairs> = {}, options?: { read?: boolean; save?: boolean }) =>
  memoryStorage({ [PROGRESS_KEY]: pairsRecord(entry(progress)) }, options);

async function openPairs<C extends ManualTimers | ManualPictures = ManualTimers>(options: PairsAppOptions<C> = {}) {
  const app = openPairsApp<C>(options);
  await app.user.click(button("FIND THE PAIR"));
  return app;
}

describe("the level switch", () => {
  it.each(AGE_LEVELS)("starts at the age level, %s, until it is used", async (level) => {
    await openPairs({ ageLevel: picked(level) });

    expect(chosen()).toEqual([TEXTS.en.ageLevels[level].name]);
  });

  it("starts at Explorer while no age level is picked", async () => {
    await openPairs({ ageLevel: "unset" });

    expect(chosen()).toEqual(["EXPLORER"]);
  });

  it("stands above PLAY with the levels youngest first, each with its picture from the age level menu", async () => {
    await openPairs();

    expect(levelSwitch().compareDocumentPosition(button("PLAY")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const levels = within(levelSwitch()).getAllByRole("button");
    expect(levels.map((level) => level.querySelector(".pairs-level-picture")?.textContent)).toEqual(["🥚", "🦖", "🦴"]);
    expect(levels.map((level) => level.querySelector(".pairs-level-name")?.textContent)).toEqual(NAMES);
    // The pictures are not read out: each level is read as its name.
    expect(levels).toEqual(NAMES.map((name) => within(levelSwitch()).getByRole("button", { name })));
  });

  it("sets the chosen level apart by more than colour: bolder and raised", async () => {
    await openPairs();

    const [hatchling, explorer, paleontologist] = within(levelSwitch()).getAllByRole("button").map((level) => getComputedStyle(level));
    if (!hatchling || !explorer || !paleontologist) throw new Error("A level is missing");
    expect([hatchling.fontWeight, explorer.fontWeight, paleontologist.fontWeight]).toEqual(["700", "600", "600"]);
    expect([explorer.boxShadow, paleontologist.boxShadow]).toEqual(["none", "none"]);
    expect(hatchling.boxShadow).not.toBe("none");
  });

  it.each([
    ["hatchling", "explorer"],
    ["explorer", "paleontologist"],
    ["paleontologist", "hatchling"],
    ["explorer", "hatchling"]
  ] as const)("slides the chosen mark from %s to %s, the level chosen", async (from, to) => {
    const { user } = await openPairs({ ageLevel: picked(from) });
    const mark = levelSwitch().querySelector(".pairs-level-mark");
    if (!mark) throw new Error("No chosen mark on the switch");
    // The mark is as wide as a level, a third of the switch inside its
    // padding and two gaps, and stands one level and one gap further along
    // for each level before the chosen one.
    const place = () => getComputedStyle(levelSwitch()).getPropertyValue("--chosen");
    const [switchStyle, markStyle] = [getComputedStyle(levelSwitch()), getComputedStyle(mark)];
    const width = /^calc\(0\.3333333333333333 \* \(100% - (\d+)px\)\)$/.exec(markStyle.width);
    const step = /^calc\(var\(--chosen\) \* \(100% \+ (\d+)px\)\) 0$/.exec(markStyle.translate);
    if (!width || !step) throw new Error(`Unknown mark: ${markStyle.width}, ${markStyle.translate}`);
    expect([Number(width[1]), Number(step[1])]).toEqual([px(switchStyle.paddingLeft) + px(switchStyle.paddingRight) + 2 * columnGapOf(switchStyle), columnGapOf(switchStyle)]);
    expect([markStyle.left, place()]).toEqual([switchStyle.paddingLeft, String(AGE_LEVELS.indexOf(from))]);

    await user.click(button(TEXTS.en.ageLevels[to].name));

    expect([chosen(), place()]).toEqual([[TEXTS.en.ageLevels[to].name], String(AGE_LEVELS.indexOf(to))]);
  });

  it("gives each level at least 48 by 48 to tap", async () => {
    await openPairs();

    const style = getComputedStyle(levelSwitch());
    const room = px(getComputedStyle(levelSwitch().parentElement ?? document.body).width) - px(style.borderLeftWidth) - px(style.borderRightWidth) - px(style.paddingLeft) - px(style.paddingRight);
    expect([style.display, style.gridTemplateColumns]).toEqual(["grid", "repeat(3, 1fr)"]);
    const width = (room - columnGapOf(style) * 2) / 3;
    expect(width).toBeGreaterThanOrEqual(48);
    for (const level of within(levelSwitch()).getAllByRole("button")) expect(px(getComputedStyle(level).height)).toBeGreaterThanOrEqual(48);
  });

  it.each(LANGUAGES.flatMap((language) => THEMES.map((theme) => [language, theme] as const)))(
    "fits and reads on a 1024 by 768 screen, in %s and the %s theme",
    async (language, theme) => {
      const app = openPairsApp({ deviceLanguage: DEVICES[language], theme });
      await app.user.click(homeTile(TEXTS[language].pairs));

      // The column of the switch stands beside the cards, which take what
      // is left of the row.
      const screenStyle = getComputedStyle(document.querySelector(".pairs-welcome") ?? document.body);
      const body = getComputedStyle(document.querySelector(".pairs-welcome-body") ?? document.body);
      const column = levelSwitch(language).parentElement;
      if (!column) throw new Error("The switch stands in no column");
      expect(getComputedStyle(column).flexShrink).toBe("0");
      const row = SCREEN.width - px(screenStyle.paddingLeft) - px(screenStyle.paddingRight);
      expect(px(getComputedStyle(column).width) + columnGapOf(body)).toBeLessThanOrEqual(row);

      const style = getComputedStyle(levelSwitch(language));
      const room = px(getComputedStyle(column).width) - px(style.borderLeftWidth) - px(style.borderRightWidth) - px(style.paddingLeft) - px(style.paddingRight);
      const segment = (room - columnGapOf(style) * 2) / 3;
      const levels = within(levelSwitch(language)).getAllByRole("button");
      expect(levels.map((level) => level.querySelector(".pairs-level-name")?.textContent)).toEqual(AGE_LEVELS.map((level) => TEXTS[language].ageLevels[level].name));
      for (const level of levels) {
        const levelStyle = getComputedStyle(level);
        const picture = level.querySelector(".pairs-level-picture");
        const name = level.querySelector(".pairs-level-name");
        if (!picture || !name) throw new Error("A level without its picture or name");
        const words = name.textContent ?? "";
        // The name takes the level's face and colour.
        const needed = (LEVEL_EMS[words] ?? Number.NaN) * px(levelStyle.fontSize) + px(levelStyle.letterSpacing) * words.length;
        const nameRoom = segment - px(levelStyle.paddingLeft) - px(levelStyle.paddingRight) - px(getComputedStyle(picture).width) - columnGapOf(levelStyle);
        expect(levelStyle.whiteSpace).toBe("nowrap");
        expect([words, needed <= nameRoom]).toEqual([words, true]);
        const surface = surfaceOf(name);
        expect(contrast(seenOn(levelStyle.color, surface), surface)).toBeGreaterThanOrEqual(4.5);
      }
    }
  );

  it("shows the climb level only for Hatchling, and the stars at every level", async () => {
    const { user } = await openPairs({ storage: stored({ stars: 5, level: 3 }) });
    expect([climbChip().textContent, isInaccessible(climbChip()), screen.getByLabelText("STARS").textContent]).toEqual(["3", false, "5"]);

    await user.click(button("EXPLORER"));

    expect([chosen(), isInaccessible(climbChip()), isInaccessible(screen.getByLabelText("STARS"))]).toEqual([["EXPLORER"], true, false]);
    await user.click(button("HATCHLING"));
    expect([chosen(), isInaccessible(climbChip())]).toEqual([["HATCHLING"], false]);
  });

  it("reads progress saved before the levels as Hatchling's, its climb and stars kept", async () => {
    const { user } = await openPairs({ storage: stored({ stars: 4, level: 2, best: { 1: 5 } }), ageLevel: picked("explorer") });
    expect([chosen(), screen.getByLabelText("STARS").textContent]).toEqual([["EXPLORER"], "4"]);

    await user.click(button("HATCHLING"));

    expect(climbChip().textContent).toBe("2");
  });

  it("chooses a level once on a quick double tap, changing nothing else", async () => {
    const storage = memoryStorage();
    const writes = vi.spyOn(storage, "setItem");
    const { user } = await openPairs({ storage, ageLevel: picked("hatchling", "2") });

    await user.dblClick(button("EXPLORER"));

    expect(chosen()).toEqual(["EXPLORER"]);
    expect(writes.mock.calls.filter(([key]) => key === PROGRESS_KEY)).toHaveLength(1);
    expect(storedPairs(storage)).toEqual({ ...entry(), offer: NO_LEVEL_OFFER, levelChoice: { level: "explorer", revision: "2" } });
  });

  it("rests once PLAY is tapped: the board is dealt at the level shown then, a level tapped in the same moment kept nowhere", async () => {
    const storage = memoryStorage();
    await openPairs({ storage, pals: pals("triceratops", "stegosaurus", "tyrannosaurus") });
    const [play, explorer] = [button("PLAY"), button("EXPLORER")];

    act(() => {
      fireEvent.click(play);
      fireEvent.click(explorer);
    });

    expect(pairCards()).toHaveLength(6);
    expect(storedPairs(storage)).toBeUndefined();
  });
});

describe("the choice on the level switch", () => {
  it("is kept with the age level it was made under, and wins until a parent picks a different level", async () => {
    const storage = memoryStorage();
    const first = await openPairs({ storage, ageLevel: picked("explorer", "2") });
    await first.user.click(button("HATCHLING"));
    expect(storedPairs(storage)).toEqual({ ...entry(), offer: NO_LEVEL_OFFER, levelChoice: { level: "hatchling", revision: "2" } });
    first.unmount();

    const reopened = await openPairs({ storage, ageLevel: picked("explorer", "2") });
    expect(chosen()).toEqual(["HATCHLING"]);
    await reopened.user.click(button("HOME"));
    const menu = await openMenu(reopened.user, "Age level");
    await reopened.user.click(within(menu).getByRole("menuitemradio", { name: /PALEONTOLOGIST/ }));
    act(() => reopened.clock.fire(MENU_EXIT));
    await reopened.user.click(button("FIND THE PAIR"));
    expect(chosen()).toEqual(["PALEONTOLOGIST"]);
    reopened.unmount();

    await openPairs({ storage, settingsStorage: reopened.ageLevels });
    expect(chosen()).toEqual(["PALEONTOLOGIST"]);
  });

  it.each([
    ["never used", undefined, "EXPLORER"],
    ["Hatchling", { level: "hatchling", revision: "2" }, "HATCHLING"]
  ] as const)("holds while the app is open when it cannot be saved, the saved choice %s back after a reload", async (_, levelChoice, reloaded) => {
    const storage = stored(levelChoice && { levelChoice }, { save: false });
    const { user, unmount } = await openPairs({ storage, ageLevel: picked("explorer", "2") });

    await user.click(button("PALEONTOLOGIST"));
    await user.click(button("HOME"));
    await user.click(button("FIND THE PAIR"));

    expect(chosen()).toEqual(["PALEONTOLOGIST"]);
    unmount();
    await openPairs({ storage, ageLevel: picked("explorer", "2") });
    expect(chosen()).toEqual([reloaded]);
  });

  it.each([
    ["malformed", { levelChoice: { level: "grown-up", revision: "2" } }],
    ["of a choice with no revision", { levelChoice: { level: "hatchling" } }]
  ])("starts afresh at the age level when the stored progress is %s", async (_, progress) => {
    await openPairs({ storage: stored(progress as Partial<StoredPairs>), ageLevel: picked("paleontologist") });

    expect([chosen(), screen.getByLabelText("STARS").textContent]).toEqual([["PALEONTOLOGIST"], "0"]);
  });

  it("holds in memory when progress cannot be read, and is not saved", async () => {
    const storage = stored({ stars: 3 }, { read: false });
    const writes = vi.spyOn(storage, "setItem");
    const { user } = await openPairs({ storage, ageLevel: picked("explorer") });
    expect(chosen()).toEqual(["EXPLORER"]);

    await user.click(button("HATCHLING"));

    expect([chosen(), climbChip().textContent]).toEqual([["HATCHLING"], "1"]);
    expect(writes).not.toHaveBeenCalled();
  });
});

describe("a board at each level", () => {
  // The fit table of find-the-pair-levels.feature: a level's board on a
  // screen, and the least every card is there.
  const FIT = [
    ["Explorer", 1024, 768, 130, "explorer"],
    ["Paleontologist", 1024, 768, 120, "paleontologist"],
    ["Paleontologist", 1366, 1024, 150, "paleontologist"]
  ] as const;

  const styleOf = (selector: string) => {
    const found = document.querySelector(selector);
    if (!found) throw new Error(`No ${selector} on the screen`);
    return getComputedStyle(found);
  };

  // Each card's dinosaur and face, by the dinosaur's name.
  const facesByName = () => {
    const faces = new Map<string, string[]>();
    for (const card of pairCards()) {
      const name = card.getAttribute("aria-label") ?? "";
      faces.set(name, [...(faces.get(name) ?? []), card.getAttribute("data-face") ?? ""].sort());
    }
    return faces;
  };

  it.each([
    ["explorer", 9, 3, 6],
    ["paleontologist", 12, 4, 6]
  ] as const)("deals %s's pairs face down in its rows of 6, each a picture to its silhouette, with no climb level", async (level, pairs, rows, columns) => {
    const { user, clock } = await openPairs({ ageLevel: picked(level) });

    await user.click(button("PLAY"));

    expect(pairCards()).toHaveLength(pairs * 2);
    expect(pairCards().map((card) => card.getAttribute("data-state"))).toEqual(pairCards().map(() => "down"));
    expect([board().style.getPropertyValue("--rows"), board().style.getPropertyValue("--columns")]).toEqual([String(rows), String(columns)]);
    expect([screen.queryByLabelText("LEVEL"), screen.getByLabelText("TRIES").textContent]).toEqual([null, "0"]);
    await playBoard(user, clock);
    expect([...facesByName().values()]).toEqual(Array.from({ length: pairs }, () => ["picture", "silhouette"]));
    expect(board().querySelectorAll("img.pair-silhouette")).toHaveLength(pairs);
  });

  it("plays Hatchling's climb at the climb level reached", async () => {
    const { user } = await openPairs({ storage: stored({ level: 3 }), ageLevel: picked("explorer") });

    await user.click(button("HATCHLING"));
    await user.click(button("PLAY"));

    const { pairs, rows, columns } = CLIMB_LEVELS[3];
    expect([pairCards().length, board().style.getPropertyValue("--rows"), board().style.getPropertyValue("--columns")]).toEqual([pairs * 2, String(rows), String(columns)]);
    expect(screen.getByLabelText("LEVEL").textContent).toBe("3");
  });

  it.each(FIT)("fits an %s board with HOME on a %i by %i screen, with no scrolling, every card at least %i pixels a side", async (_, width, height, size, level) => {
    const { user } = await openPairs({ ageLevel: picked(level) });
    await user.click(button("PLAY"));

    // jsdom lays nothing out, so the board is laid out here as app.css
    // gives it: the screen is the window, cut off where it ends, a column
    // of the bar, with HOME, and the room left under it; the board is as
    // wide as the room, or as the room's height allows at the board's
    // shape, and its cards share it after the gaps.
    const page = styleOf(".pairs-board-screen");
    expect([page.height, page.overflow, page.display, page.flexDirection]).toEqual(["100dvh", "hidden", "flex", "column"]);
    const bar = document.querySelector(".pairs-bar");
    if (!bar) throw new Error("No bar on the board");
    expect(within(bar as HTMLElement).getByRole("button", { name: "HOME" })).toBeDefined();
    const barHeight = px(getComputedStyle(bar).height);
    for (const item of [".home-button", ".pairs-bar-mark", ".pairs-bar-chip"]) expect(px(styleOf(item).height)).toBeLessThanOrEqual(barHeight);
    const roomStyle = styleOf(".pair-board-room");
    expect([roomStyle.flexGrow, roomStyle.flexShrink, roomStyle.flexBasis, roomStyle.minHeight, roomStyle.getPropertyValue("container-type")]).toEqual(["1", "1", "0px", "0px", "size"]);
    const room = {
      width: width - px(page.paddingLeft) - px(page.paddingRight),
      height: height - px(page.paddingTop) - px(page.paddingBottom) - barHeight - rowGapOf(page)
    };

    const style = getComputedStyle(board());
    expect([style.display, style.width, style.aspectRatio]).toEqual(["grid", "min(100cqw, 100cqh * var(--columns) * 3 / (var(--rows) * 3.2))", "calc(var(--columns) * 3) / calc(var(--rows) * 3.2)"]);
    expect([roomStyle.display, roomStyle.placeItems]).toEqual(["grid", "center"]);
    const [rows, columns] = [Number(board().style.getPropertyValue("--rows")), Number(board().style.getPropertyValue("--columns"))];
    const shape = (columns * 3) / (rows * 3.2);
    const boardWidth = Math.min(room.width, room.height * shape);
    const boardHeight = boardWidth / shape;
    const [rowGap, columnGap] = [rowGapOf(style), columnGapOf(style)];
    const card = { width: (boardWidth - (columns - 1) * columnGap) / columns, height: (boardHeight - (rows - 1) * rowGap) / rows };

    expect(boardHeight).toBeLessThanOrEqual(room.height + 0.01);
    expect(Math.min(card.width, card.height)).toBeGreaterThanOrEqual(size);
    // The cards' floor never pushes the board out of its room.
    const floor = px(board().style.getPropertyValue("--card-floor"));
    expect([style.gridTemplateColumns, style.gridTemplateRows]).toEqual(["repeat(var(--columns), minmax(var(--card-floor), 1fr))", "repeat(var(--rows), minmax(var(--card-floor), 1fr))"]);
    expect(floor * columns + (columns - 1) * columnGap).toBeLessThanOrEqual(boardWidth);
    expect(floor * rows + (rows - 1) * rowGap).toBeLessThanOrEqual(boardHeight);
    // A face-down card's footprints are drawn at its share of the card.
    expect([styleOf(".pair-card-back-frame svg").width, styleOf(".pair-card-back-frame svg").height]).toEqual(["30cqi", "30cqi"]);
  });

  it.each(AGE_LEVELS)("draws the footprints of the welcome's face-down card at %s at their share of that card, not of the screen", async (level) => {
    const { user } = await openPairs({ ageLevel: picked(level) });

    // A container query length is of the nearest container, and with none
    // it is of the screen: the card is the footprints' container.
    const card = styleOf(".pairs-hero-back");
    const footprints = styleOf(".pairs-hero-back svg");
    expect([card.getPropertyValue("container-type"), footprints.width, footprints.height]).toEqual(["inline-size", "54cqi", "54cqi"]);

    await user.click(button("PLAY"));
    expect([styleOf(".pair-card").getPropertyValue("container-type"), styleOf(".pair-card-back-frame svg").width]).toEqual(["inline-size", "30cqi"]);
  });

  it.each([
    ["Paleontologist", "Paleontologist", "paleontologist", "paleontologist"],
    ["Paleontologist", "Explorer", "paleontologist", "explorer"],
    ["Explorer", "Explorer", "explorer", "explorer"],
    ["Hatchling", "Paleontologist", "hatchling", "paleontologist"]
  ] as const)("deals after a %s board a %s board, as few of the board before's dinosaurs as the look-alike rule allows", async (_, __, before, next) => {
    // A board is the board before once it is shown, played or not, so each
    // board's dinosaurs are read from the pictures it loads ahead: every
    // picture fails, so a board asks again for each of its own.
    const asked: string[] = [];
    const timers = manualTimers();
    const clock: ManualTimers = { ...timers, ...pictureClock((url, done) => (asked.push(url), done("failed")), timers.startTimer) };
    const { user } = await openPairs({ ageLevel: picked(before), random: seededRandom(296), clock });
    const deal = async (...taps: string[]) => {
      for (const tap of taps.slice(0, -1)) await user.click(button(tap));
      const from = asked.length;
      await user.click(button(taps.at(-1) ?? ""));
      return [...new Set(asked.slice(from))].map((url) => SHIPPED_PALS.find(({ id }) => fakeBodyPicture(id) === url)?.id);
    };

    const first = await deal("PLAY");
    expect([pairCards().length, first.includes(undefined)]).toEqual([first.length * 2, false]);
    const second = await deal("HOME", "FIND THE PAIR", TEXTS.en.ageLevels[next].name, "PLAY");

    expect(pairCards()).toHaveLength(next === "explorer" ? 18 : 24);
    expect(second).toHaveLength(pairCards().length / 2);
    const repeated = second.filter((id) => first.includes(id));
    const availableGroups = new Set(SHIPPED_PALS.filter(({ id }) => !first.includes(id)).map(({ lookAlike }) => lookAlike));
    // Every group with an unplayed dinosaur can supply a fresh pair;
    // only pairs beyond those groups must repeat a dinosaur.
    expect(repeated).toHaveLength(Math.max(0, second.length - availableGroups.size));
    const groups = second.map((id) => SHIPPED_PALS.find((pal) => pal.id === id)?.lookAlike);
    expect(groups).not.toContain(undefined);
    expect(new Set(groups).size).toBe(second.length);
  });
});
