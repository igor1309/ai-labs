import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { AgeLevelSetting } from "../src/ageLevel.ts";
import { App, type PortraitLayouts, type Viewport } from "../src/App.tsx";
import type { Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { correctOf } from "../src/quiz/round.ts";
import type { ProgressStore } from "../src/quizGame.tsx";
import { NO_SAFE_AREA, type SafeArea } from "./stylesheet.ts";
import {
  SHIPPED_CATALOGUE, SHIPPED_DINOSAURS, emptyCare, emptyDig, emptyPairs, emptyLabyrinth,
  emptySkeletons, emptySorting, fakeBodyPicture, featuring, gameDoor,
  lightDevice, loadedPictures, manualViewport, pageAtRest, seededRandom,
  shownQuestion, unreadVersion, unsetAgeLevel
} from "./support.ts";
import { openWindow, type WindowSize } from "./windowSizes.ts";

const PORTRAIT_LAYOUTS: PortraitLayouts = { home: ["tall"], catalogue: ["tall"], dinosaur: ["tall"], "compare-question": ["tall"], "compare-result": ["tall"] };

const EARLIER_BEST: ProgressStore = {
  load: () => ({ progress: { best: { hatchling: 7, explorer: 7, paleontologist: 7 }, roundsPlayed: 3 }, levelChoice: undefined }),
  save: () => {}
};

const part = (selector: string, root: ParentNode = document) => {
  const found = root.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector}`);
  return found;
};
const gateShown = () => part(".orientation-gate").hasAttribute("data-shown");
const levelSwitch = (language: Language = "en") => screen.getByRole("group", { name: TEXTS[language].ageLevelSwitch });

async function openResult(size: WindowSize, {
  language = "en", insets = NO_SAFE_AREA, viewport = manualViewport("portrait", insets), ageLevel, layouts = PORTRAIT_LAYOUTS
}: { language?: Language; insets?: SafeArea; viewport?: Viewport; ageLevel?: AgeLevelSetting; layouts?: PortraitLayouts } = {}) {
  openWindow(...size);
  const user = userEvent.setup({ delay: null });
  render(<App {...emptyLabyrinth()}
    {...featuring()}
    dinosaurs={SHIPPED_DINOSAURS}
    catalogue={SHIPPED_CATALOGUE}
    bodyPicture={fakeBodyPicture}
    random={seededRandom(11)}
    portraitLayouts={layouts}
    viewport={viewport}
    progress={EARLIER_BEST}
    deviceLanguage={language === "ru" ? "ru-RU" : "en-GB"}
    languageStore={{ load: () => undefined, save: () => {} }}
    nameVersion={unreadVersion}
    {...lightDevice()} {...unsetAgeLevel()} {...loadedPictures()}
    {...(ageLevel ? { ageLevelStore: { load: () => ageLevel, save: () => {} } } : {})}
    {...emptyCare()} {...emptySorting()} {...emptyPairs()}
    {...emptySkeletons()} {...emptyDig()} {...pageAtRest()}
  />);
  const text = TEXTS[language];
  await user.click(gameDoor(text.quizCard));
  // Every question answered right, to the result.
  while (screen.queryByRole("group", { name: text.creatures })) {
    const right = correctOf(shownQuestion(language));
    await user.click(within(screen.getByRole("group", { name: text.creatures })).getByRole("button", { name: right.name[language] }));
    await user.click(screen.queryByRole("button", { name: text.next }) ?? screen.getByRole("button", { name: text.seeResult }));
  }
  return { user, viewport };
}

// Layout is checked on controlled results; these interactions keep the finished round in the app.
describe("the upright result keeps the finished round", () => {
  it("slides the mark to EXPLORER as in landscape, the round's stars and score staying", async () => {
    const { user } = await openResult([820, 1180], { ageLevel: { level: "hatchling", revision: "picked" } });
    const stars = screen.getByRole("img", { name: TEXTS.en.stars(10, 10) });
    const score = screen.getByLabelText(TEXTS.en.score);
    expect([within(levelSwitch()).getByRole("button", { pressed: true }).textContent, levelSwitch().style.getPropertyValue("--chosen")]).toEqual(["🥚HATCHLING", "0"]);
    await user.click(within(levelSwitch()).getByRole("button", { name: TEXTS.en.ageLevels.explorer.name }));
    expect([within(levelSwitch()).getByRole("button", { pressed: true }).textContent, levelSwitch().style.getPropertyValue("--chosen")]).toEqual(["🦖EXPLORER", "1"]);
    expect(getComputedStyle(part(".level-switch-mark")).transition).toBe("translate var(--motion-standard) var(--ease-out)");
    expect(getComputedStyle(part(".level-switch-mark")).translate).toBe("calc(var(--chosen) * (100% + 4px)) 0");
    expect([screen.getByRole("img", { name: TEXTS.en.stars(10, 10) }), screen.getByLabelText(TEXTS.en.score)]).toEqual([stars, score]);
    expect([score.textContent, stars.querySelectorAll(".star-won").length, gateShown()]).toEqual(["10/10", 10, false]);
  });

  it("fades the picture asking to turn over the result as a tall window narrows", async () => {
    const viewport = manualViewport("portrait");
    await openResult([820, 1180], { viewport });
    const result = part(".result");
    openWindow(393, 852);
    act(() => viewport.resize("tall-narrow", true));
    expect([gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual([true, true]);
    expect(screen.getByRole("img", { name: TEXTS.en.turnSideways })).toBeDefined();
    expect([part(".result"), screen.getByLabelText(TEXTS.en.score).textContent]).toEqual([result, "10/10"]);
  });
});
