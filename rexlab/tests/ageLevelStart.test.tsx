import { render, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AGE_LEVELS, type AgeLevel } from "../src/ageLevel.ts";
import { App } from "../src/App.tsx";
import { HOME_GAMES } from "../src/HomePage.tsx";
import { AGE_LEVEL_KEY, localAgeLevel } from "../src/localAgeLevel.ts";
import { localLanguage } from "../src/localLanguage.ts";
import { PROGRESS_KEY, localCareProgress, localFeatured, localPairsProgress, localProgress, localSkeletonProgress, localSortingProgress } from "../src/localProgress.ts";
import { localTheme } from "../src/localTheme.ts";
import { largerOf, type Question } from "../src/quiz/round.ts";
import { badgeOf } from "./homePage.tsx";
import {
  SHIPPED_CATALOGUE,
  SHIPPED_DINOSAURS,
  SHIPPED_PALS,
  SHIPPED_SKELETONS,
  SHIPPED_SORTABLES,
  SHIPPED_VISITORS,
  fakeBodyPicture,
  fakeItemPicture,
  fakeSkeletonPicture,
  gameDoor,
  manualAppearance,
  manualOrientation,
  manualTimers,
  manualVisibility,
  memoryStorage,
  seededRandom,
  unreadVersion,
  type MemoryStorage
} from "./support.ts";

// age-level-start.feature

const TODAY = new Date(2026, 9, 18, 9, 30);

// Progress kept before the age level, a quiz best of 6 among it.
const KEPT = JSON.stringify({
  schemaVersion: 1,
  games: {
    "compare-dinosaurs": { bestScore: 6, roundsPlayed: 3 },
    "dinosaur-care": { bestScore: 4, visitsFinished: 2, friends: ["triceratops"] },
    "sort-dinosaurs": { bestScore: 5, roundsPlayed: 2 },
    "find-the-pair": { stars: 40, level: 2, boardsOnLevel: 1, best: {}, found: ["stegosaurus"] },
    "skeleton-assembly": { bestScore: 2, earned: ["triceratops"], rebuilding: [] },
    "home-featured": { starts: { compare: 4, care: 2, sort: 1 }, featured: { day: "2026-10-18", game: "care" } }
  }
});

// Storage holding the kept progress and, unless `level` is undefined, the
// age level a parent picked.
const iPadAt = (level: AgeLevel | undefined) =>
  memoryStorage({ [PROGRESS_KEY]: KEPT, ...(level === undefined ? {} : { [AGE_LEVEL_KEY]: JSON.stringify({ level, revision: `picked-${level}` }) }) });

// The app as a browser composes it, every store on the one `storage`, and
// the same random draws on every opening.
function openApp(storage: MemoryStorage) {
  const local = () => storage;
  const featured = localFeatured(local, HOME_GAMES);
  const view = render(
    <App
      dinosaurs={SHIPPED_DINOSAURS}
      catalogue={SHIPPED_CATALOGUE}
      bodyPicture={fakeBodyPicture}
      random={seededRandom(29)}
      orientation={manualOrientation("landscape")}
      pageVisibility={manualVisibility("visible")}
      progress={localProgress(local)}
      deviceLanguage="en-GB"
      languageStore={localLanguage(local)}
      nameVersion={unreadVersion}
      appearance={manualAppearance("light")}
      themeStore={localTheme(local)}
      ageLevelStore={localAgeLevel(local)}
      visitors={SHIPPED_VISITORS}
      careProgress={localCareProgress(local)}
      itemPicture={fakeItemPicture}
      reducedMotion={() => false}
      sortables={SHIPPED_SORTABLES}
      sortingProgress={localSortingProgress(local)}
      pals={SHIPPED_PALS}
      pairsProgress={localPairsProgress(local)}
      skeletons={SHIPPED_SKELETONS}
      skeletonPicture={fakeSkeletonPicture}
      skeletonProgress={localSkeletonProgress(local)}
      now={() => TODAY}
      featuredStore={featured}
      startCounter={featured}
      {...manualTimers()}
    />
  );
  return { user: userEvent.setup(), container: view.container, unmount: view.unmount };
}

const button = (name: string) => screen.getByRole("button", { name });
const group = () => screen.getByRole("group", { name: "DINOSAURS" });

// Games with only Hatchling retain their play at every age level
// (age-level-start.feature). Sorting and the skeleton game have their own
// levels and flow tests. Each game, by its tile, and the taps that take
// it from its
// first screen into play.
const GAMES: Array<[game: string, tile: string, into: Array<() => HTMLElement>]> = [
  ["the compare quiz", "COMPARE", []],
  ["the catalogue", "ALL DINOSAURS", []],
  ["the care game", "CARE", [() => button("NEW VISITOR")]]
];

// What the app shows at each step from its tile into play, and what it
// keeps once there, beside the age level.
async function start(storage: MemoryStorage, tile: string, into: Array<() => HTMLElement>) {
  const { user, container, unmount } = openApp(storage);
  await user.click(gameDoor(tile));
  const shown = [container.innerHTML];
  for (const tap of into) {
    await user.click(tap());
    shown.push(container.innerHTML);
  }
  unmount();
  return { shown, kept: [...storage.items].filter(([key]) => key !== AGE_LEVEL_KEY) };
}

describe("today's games", () => {
  it.each(GAMES)("start %s exactly as it does with no age level set, at each age level in turn", async (_, tile, into) => {
    const today = await start(iPadAt(undefined), tile, into);

    for (const level of AGE_LEVELS) expect([level, await start(iPadAt(level), tile, into)]).toEqual([level, today]);
  });
});

function shownQuestion(): Question {
  const attribute = screen.getByRole("heading").textContent?.includes("HEAVIER") ? "mass" : "height";
  const [left, right] = within(group())
    .getAllByRole("button")
    .map((card) => {
      const found = SHIPPED_DINOSAURS.find((dinosaur) => dinosaur.name.en === card.getAttribute("aria-label"));
      if (!found) throw new Error(`No ${card.getAttribute("aria-label")} in the shipped list`);
      return found;
    });
  if (!left || !right) throw new Error("Expected two dinosaur cards");
  return { attribute, left, right };
}

// Plays a compare quiz round from the home page, every question answered
// right, and sees its result.
async function answerEveryQuestionRight(user: UserEvent) {
  await user.click(gameDoor("COMPARE"));
  for (let number = 1; number <= 10; number++) {
    await user.click(within(group()).getByRole("button", { name: largerOf(shownQuestion()).name.en }));
    if (number < 10) await user.click(button("NEXT"));
  }
  await user.click(button("SEE RESULT"));
}

describe("the same play", () => {
  it.each(AGE_LEVELS)("earns the same reward at %s, and the COMPARE tile shows the best of the level the quiz plays", async (level) => {
    const storage = iPadAt(level);
    const { user } = openApp(storage);

    await answerEveryQuestionRight(user);

    expect(screen.getByLabelText("SCORE").textContent).toBe("10/10");
    expect(screen.queryAllByRole("status").map((status) => status.getAttribute("aria-label"))).toEqual(["NEW BEST SCORE"]);
    await user.click(button("HOME"));
    expect(badgeOf(gameDoor("COMPARE"))?.textContent).toBe("10");
    expect(JSON.parse(storage.items.get(PROGRESS_KEY) ?? "").games["compare-dinosaurs"]).toEqual({ bestScore: 10, roundsPlayed: 4 });
  });
});
