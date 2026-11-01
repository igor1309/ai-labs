import { act, fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AGE_LEVELS, type AgeLevel, type AgeLevelSetting } from "../src/ageLevel.ts";
import { LANGUAGES, type Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { AGE_LEVEL_KEY } from "../src/localAgeLevel.ts";
import { PROGRESS_KEY } from "../src/localProgress.ts";
import type { Cut, Skeleton } from "../src/skeletons/index.ts";
import { LEVEL_EMS } from "./levelEms.ts";
import { openMenu } from "./menus.ts";
import { finishLoading, fitAll, keptSkeletons, layOutPuzzle, openSkeletonsApp, PIECES, savedSkeletons, skeletonOf, slots, type SkeletonsAppOptions } from "./skeletonsApp.tsx";
import { contrast, gameDoor, memoryStorage, seenOn, SHIPPED_SKELETONS, surfaceOf } from "./support.ts";
import { WINDOW_SIZES, openWindow } from "./windowSizes.ts";

// skeleton-assembly-levels.feature: the selection screen's level switch,
// the choice on it kept in the skeleton game's progress, and the cut each
// level plays.

const DEVICES: Record<Language, string> = { en: "en-GB", ru: "ru-RU" };

const NAMES = AGE_LEVELS.map((level) => TEXTS.en.ageLevels[level].name);

const picked = (level: AgeLevel, revision = `picked-${level}`): AgeLevelSetting => ({ level, revision });

// The parent's age level, kept apart from progress.
const settingOf = (setting: AgeLevelSetting) => memoryStorage({ [AGE_LEVEL_KEY]: JSON.stringify(setting) });

const button = (name: string) => screen.getByRole("button", { name });
const levelSwitch = (language: Language = "en") => screen.getByRole("group", { name: TEXTS[language].ageLevelSwitch });
const chosen = () =>
  within(levelSwitch())
    .getAllByRole("button", { pressed: true })
    .map((level) => level.querySelector(".level-switch-name")?.textContent);

const px = (value: string) => Number.parseFloat(value) || 0;
// jsdom keeps a gap only as the shorthand, row gap first.
const columnGapOf = (style: CSSStyleDeclaration) => px(style.gap.split(" ").at(-1) ?? "");

// A cut of these pieces, side by side across the frame.
const cutOf = (ids: readonly string[]): Cut => ids.map((id, at) => ({ id, name: { en: id.toUpperCase(), ru: id.toUpperCase() }, area: "back", place: { x: at * 100, y: 0, width: 100, height: 100 } }));

// The shipped skeletons, Triceratops and Stegosaurus with an Explorer cut
// of their own and Paleontologist's of Stegosaurus only.
const WITH_CUTS: readonly Skeleton[] = SHIPPED_SKELETONS.map((skeleton) =>
  skeleton.id === "triceratops"
    ? { ...skeleton, cuts: { hatchling: skeleton.cuts.hatchling, explorer: cutOf(["head", "neck", "back", "hips", "legs", "tail"]) } }
    : skeleton.id === "stegosaurus"
      ? { ...skeleton, cuts: { ...skeleton.cuts, explorer: cutOf(["front", "back"]), paleontologist: cutOf(["a", "b", "c", "d", "e"]) } }
      : skeleton
);

// The pieces of the puzzle shown, in the tray's order.
const pieces = () => slots().map(([piece]) => piece);

// The skeleton game's selection screen opened at the age level `setting`.
const openAt = (setting: AgeLevelSetting, options: SkeletonsAppOptions = {}) => openSkeletonsApp({ ageLevels: settingOf(setting), ...options });

describe("the level switch", () => {
  it.each(AGE_LEVELS)("starts at the age level, %s, until it is used", (level) => {
    openAt(picked(level));

    expect(chosen()).toEqual([TEXTS.en.ageLevels[level].name]);
  });

  it("starts at Explorer while no age level is picked", () => {
    openSkeletonsApp({ ageLevels: memoryStorage() });

    expect(chosen()).toEqual(["EXPLORER"]);
  });

  it("stands above the dinosaurs, find the pair's switch with the levels youngest first, each with its picture", () => {
    openSkeletonsApp();

    const dinosaurs = screen.getByRole("group", { name: TEXTS.en.creatures });
    expect(levelSwitch().compareDocumentPosition(dinosaurs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const levels = within(levelSwitch()).getAllByRole("button");
    expect(levels.map((level) => level.querySelector(".level-switch-picture")?.textContent)).toEqual(["🥚", "🦖", "🦴"]);
    expect(levels).toEqual(NAMES.map((name) => within(levelSwitch()).getByRole("button", { name })));
    expect(levelSwitch().classList.contains("level-switch")).toBe(true);
  });

  it("sets the chosen level apart by more than colour, and gives each level at least 48 by 48 to tap", () => {
    openSkeletonsApp({ ageLevels: memoryStorage() });

    const styles = within(levelSwitch()).getAllByRole("button").map((level) => getComputedStyle(level));
    expect(styles.map(({ fontWeight }) => fontWeight)).toEqual(["600", "700", "600"]);
    expect(styles.map(({ boxShadow }) => boxShadow !== "none")).toEqual([false, true, false]);
    const style = getComputedStyle(levelSwitch());
    const room = px(getComputedStyle(levelSwitch().parentElement ?? document.body).width) - px(style.paddingLeft) - px(style.paddingRight) - 2 * px(style.borderLeftWidth);
    expect((room - columnGapOf(style) * 2) / 3).toBeGreaterThanOrEqual(48);
    for (const level of styles) expect(px(level.height)).toBeGreaterThanOrEqual(48);
  });

  it.each(WINDOW_SIZES)("keeps its row off the dinosaurs' room, which shrinks to fit the screen, in a %i by %i window", (width, height) => {
    openWindow(width, height);
    openSkeletonsApp();

    const row = getComputedStyle(levelSwitch().parentElement ?? document.body);
    const screenStyle = getComputedStyle(document.querySelector(".skeleton-screen") ?? document.body);
    const dinosaurs = getComputedStyle(screen.getByRole("group", { name: TEXTS.en.creatures }));
    expect([row.flexShrink, px(row.width) <= width - px(screenStyle.paddingLeft) - px(screenStyle.paddingRight)]).toEqual(["0", true]);
    expect([screenStyle.overflow, dinosaurs.flexShrink, px(dinosaurs.minHeight)]).toEqual(["hidden", "1", 0]);
  });

  it.each(LANGUAGES.flatMap((language) => (["light", "dark"] as const).map((theme) => [language, theme] as const)))(
    "reads each level's name on one line in %s and the %s theme, with at least 4.5:1 contrast",
    (language, theme) => {
      openSkeletonsApp({ deviceLanguage: DEVICES[language], appearance: theme });

      const style = getComputedStyle(levelSwitch(language));
      const room = px(getComputedStyle(levelSwitch(language).parentElement ?? document.body).width) - px(style.paddingLeft) - px(style.paddingRight) - 2 * px(style.borderLeftWidth);
      const segment = (room - columnGapOf(style) * 2) / 3;
      for (const level of within(levelSwitch(language)).getAllByRole("button")) {
        const levelStyle = getComputedStyle(level);
        const picture = level.querySelector(".level-switch-picture");
        const name = level.querySelector(".level-switch-name");
        if (!picture || !name) throw new Error("A level without its picture or name");
        const words = name.textContent ?? "";
        const needed = (LEVEL_EMS[words] ?? Number.NaN) * px(levelStyle.fontSize) + px(levelStyle.letterSpacing) * words.length;
        const nameRoom = segment - px(levelStyle.paddingLeft) - px(levelStyle.paddingRight) - px(getComputedStyle(picture).width) - columnGapOf(levelStyle);
        expect([words, levelStyle.whiteSpace, needed <= nameRoom]).toEqual([words, "nowrap", true]);
        const surface = surfaceOf(name);
        expect(contrast(seenOn(levelStyle.color, surface), surface)).toBeGreaterThanOrEqual(4.5);
      }
    }
  );

  it("chooses a level once on a quick double tap, changing nothing else", async () => {
    const storage = memoryStorage();
    const writes = vi.spyOn(storage, "setItem");
    const { user } = openAt(picked("hatchling", "2"), { storage });

    await user.dblClick(button("EXPLORER"));

    expect(chosen()).toEqual(["EXPLORER"]);
    expect(writes.mock.calls.filter(([key]) => key === PROGRESS_KEY)).toHaveLength(1);
    expect(savedSkeletons(storage)).toEqual({ earned: [], bestScore: null, rebuilding: [], levelChoice: { level: "explorer", revision: "2" } });
  });

  it("rests once a dinosaur is tapped: the puzzle starts at the level shown then, a level tapped in the same moment kept nowhere", () => {
    const storage = memoryStorage();
    openAt(picked("hatchling"), { storage, skeletons: WITH_CUTS });
    const [triceratops, explorer] = [button("TRICERATOPS"), button("EXPLORER")];

    act(() => {
      fireEvent.click(triceratops);
      fireEvent.click(explorer);
    });

    expect(pieces()).toEqual([...PIECES]);
    expect(savedSkeletons(storage)).toBeUndefined();
  });
});

describe("a puzzle at each level", () => {
  it.each([
    ["hatchling", ["skull", "spine", "legs", "tail"]],
    ["explorer", ["head", "neck", "back", "hips", "legs", "tail"]],
    ["paleontologist", ["skull", "spine", "legs", "tail"]]
  ] as const)("is cut as %s plays it, Hatchling's four pieces while the level has no cut of its own", async (level, cut) => {
    const { user, pictures } = openAt(picked(level), { skeletons: WITH_CUTS });

    await user.click(button("TRICERATOPS"));
    act(() => finishLoading(pictures));

    expect(pieces()).toEqual([...cut]);
    expect(screen.getByLabelText(TEXTS.en.fitted).textContent).toBe(`0/${cut.length}`);
  });

  it("is rebuilt at the level the switch shows", async () => {
    const { user, pictures } = openAt(picked("paleontologist"), {
      skeletons: WITH_CUTS,
      storage: keptSkeletons({ earned: ["stegosaurus"], bestScore: 1, rebuilding: [] })
    });
    await user.click(button("MUSEUM"));
    act(() => finishLoading(pictures));

    await user.click(within(screen.getByRole("region", { name: "STEGOSAURUS" })).getByRole("button"));

    expect(pieces()).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("earns the dinosaur's one star and stand at Explorer, as at Hatchling, the collection counting it", async () => {
    const storage = memoryStorage();
    const { user, pictures } = openAt(picked("explorer"), { storage });
    await user.click(button("TRICERATOPS"));
    act(() => finishLoading(pictures));
    layOutPuzzle();

    fitAll(skeletonOf("triceratops"));

    expect(savedSkeletons(storage)).toEqual({ earned: ["triceratops"], bestScore: 1, rebuilding: [], badges: { triceratops: ["explorer"] } });
  });
});

describe("the choice on the level switch", () => {
  it("is kept with the age level it was made under, and wins until a parent picks a different level", async () => {
    const storage = memoryStorage();
    const ageLevels = settingOf(picked("explorer", "2"));
    const first = openSkeletonsApp({ storage, ageLevels });
    await first.user.click(button("HATCHLING"));
    expect(savedSkeletons(storage)).toEqual({ earned: [], bestScore: null, rebuilding: [], levelChoice: { level: "hatchling", revision: "2" } });
    first.unmount();

    const reopened = openSkeletonsApp({ storage, ageLevels });
    expect(chosen()).toEqual(["HATCHLING"]);
    await reopened.user.click(button("HOME"));
    const menu = await openMenu(reopened.user, "Age level");
    await reopened.user.click(within(menu).getByRole("menuitemradio", { name: /PALEONTOLOGIST/ }));
    fireEvent.click(gameDoor("SKELETONS"));

    expect(chosen()).toEqual(["PALEONTOLOGIST"]);
  });

  it("holds while the app is open when it cannot be saved, the age level back after a reload", async () => {
    const storage = memoryStorage({}, { save: false });
    const ageLevels = settingOf(picked("explorer", "2"));
    const { user, unmount } = openSkeletonsApp({ storage, ageLevels });

    await user.click(button("PALEONTOLOGIST"));
    await user.click(button("HOME"));
    fireEvent.click(gameDoor("SKELETONS"));

    expect(chosen()).toEqual(["PALEONTOLOGIST"]);
    unmount();
    openSkeletonsApp({ storage, ageLevels });
    expect(chosen()).toEqual(["EXPLORER"]);
  });

  it("reads progress saved before the levels, its stars and best kept, the switch at the age level", () => {
    openAt(picked("paleontologist"), { storage: keptSkeletons({ earned: ["tyrannosaurus"], bestScore: 1, rebuilding: [] }) });

    expect(chosen()).toEqual(["PALEONTOLOGIST"]);
    expect(within(button("TYRANNOSAURUS")).queryByRole("img", { name: TEXTS.en.star })).not.toBeNull();
    expect(screen.getByLabelText(TEXTS.en.bestScore).textContent).toBe("1/5");
  });
});
