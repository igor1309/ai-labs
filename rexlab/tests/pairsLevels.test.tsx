import { act, isInaccessible, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AGE_LEVELS, type AgeLevel, type AgeLevelSetting } from "../src/ageLevel.ts";
import { LANGUAGES, type Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { PROGRESS_KEY } from "../src/localProgress.ts";
import { LEVEL_EMS } from "./levelEms.ts";
import { openPairsApp, pairCards, pairsRecord, storedPairs, type StoredPairs } from "./pairsApp.tsx";
import { SHIPPED_PALS, contrast, homeTile, manualPictures, memoryStorage, seenOn, surfaceOf } from "./support.ts";

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

const pals = (...ids: string[]) =>
  ids.map((id) => {
    const found = SHIPPED_PALS.find((each) => each.id === id);
    if (!found) throw new Error(`No ${id} in the shipped list`);
    return found;
  });

const entry = (progress: Partial<StoredPairs> = {}): StoredPairs => ({ stars: 0, level: 1, boardsOnLevel: 0, best: {}, found: [], ...progress });

const stored = (progress: Partial<StoredPairs> = {}, options?: { read?: boolean; save?: boolean }) =>
  memoryStorage({ [PROGRESS_KEY]: pairsRecord(entry(progress)) }, options);

async function openPairs(options: Parameters<typeof openPairsApp>[0] = {}) {
  const app = openPairsApp(options);
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

  it("gives each level at least 48 by 48 to tap", async () => {
    await openPairs();

    const style = getComputedStyle(levelSwitch());
    const room = px(getComputedStyle(levelSwitch().parentElement ?? document.body).width) - px(style.borderLeftWidth) - px(style.borderRightWidth) - px(style.paddingLeft) - px(style.paddingRight);
    expect([style.display, style.gridTemplateColumns]).toEqual(["grid", "repeat(3, 1fr)"]);
    const width = (room - px(style.columnGap) * 2) / 3;
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
      expect(px(getComputedStyle(column).width) + px(body.columnGap)).toBeLessThanOrEqual(row);

      const style = getComputedStyle(levelSwitch(language));
      const room = px(getComputedStyle(column).width) - px(style.borderLeftWidth) - px(style.borderRightWidth) - px(style.paddingLeft) - px(style.paddingRight);
      const segment = (room - px(style.columnGap) * 2) / 3;
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
        const nameRoom = segment - px(levelStyle.paddingLeft) - px(levelStyle.paddingRight) - px(getComputedStyle(picture).width) - px(levelStyle.columnGap);
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
    expect(storedPairs(storage)).toEqual({ ...entry(), levelChoice: { level: "explorer", revision: "2" } });
  });

  it("rests once PLAY is tapped: the board is dealt at the level shown then", async () => {
    const pictures = manualPictures();
    const storage = memoryStorage();
    const { user } = await openPairs({ storage, pals: pals("triceratops", "stegosaurus", "tyrannosaurus"), clock: pictures });
    await user.click(button("PLAY"));

    await user.click(button("EXPLORER"));

    expect(chosen()).toEqual(["HATCHLING"]);
    expect(storedPairs(storage)).toBeUndefined();
    act(() => pictures.loading().forEach(pictures.finish));
    expect(pairCards()).toHaveLength(6);
  });
});

describe("the choice on the level switch", () => {
  it("is kept with the age level it was made under, and wins until a parent picks a different level", async () => {
    const storage = memoryStorage();
    const first = await openPairs({ storage, ageLevel: picked("explorer", "2") });
    await first.user.click(button("HATCHLING"));
    expect(storedPairs(storage)).toEqual({ ...entry(), levelChoice: { level: "hatchling", revision: "2" } });
    first.unmount();

    const reopened = await openPairs({ storage, ageLevel: picked("explorer", "2") });
    expect(chosen()).toEqual(["HATCHLING"]);
    reopened.unmount();

    await openPairs({ storage, ageLevel: picked("paleontologist", "3") });
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
