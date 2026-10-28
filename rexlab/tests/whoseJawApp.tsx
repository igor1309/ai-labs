import { jawGameParts } from "./whoseJaw.ts";
import { render } from "@testing-library/react";
import { App } from "../src/App.tsx";
import type { AgeLevelSetting } from "../src/ageLevel.ts";
import jaws from "../src/data/jaws.json";
import { HOME_GAMES } from "../src/HomePage.tsx";
import { AGE_LEVEL_KEY, localAgeLevel } from "../src/localAgeLevel.ts";
import { localLanguage } from "../src/localLanguage.ts";
import { localFeatured, localLabyrinthProgress, localProgress, localWhoseJawProgress } from "../src/localProgress.ts";
import { localTheme } from "../src/localTheme.ts";
import { emptyCare, emptyDig, emptyPairs, emptySkeletons, emptySorting, fakeBodyPicture, manualAppearance, manualTimers, manualViewport, memoryStorage, pageAtRest, SHIPPED_CATALOGUE, SHIPPED_DINOSAURS, unreadVersion, type MemoryStorage } from "./support.ts";

// Integrates welcome navigation, parent settings and browser storage adapters.
export function openWhoseJawApp({ storage = memoryStorage(), setting = { level: "explorer", revision: null }, language = "en", reduced = false }:
  { storage?: MemoryStorage; setting?: AgeLevelSetting; language?: "en" | "ru"; reduced?: boolean } = {}) {
  const local = () => storage;
  const settings = memoryStorage({ [AGE_LEVEL_KEY]: JSON.stringify(setting) });
  const featured = localFeatured(local, HOME_GAMES);
  const timers = manualTimers();
  const parts = jawGameParts();
  const view = render(<App
    now={() => new Date(2026, 9, 28, 12)} featuredStore={featured} startCounter={featured}
    dinosaurs={SHIPPED_DINOSAURS} catalogue={SHIPPED_CATALOGUE} bodyPicture={fakeBodyPicture}
    random={() => 0} portraitLayouts={{ home: ["tall"], "whoseJaw-welcome": ["tall", "tall-narrow"] }} viewport={manualViewport("landscape")}
    progress={localProgress(local)} labyrinthProgress={localLabyrinthProgress(local)}
    whoseJaw={{ ...parts, progress: localWhoseJawProgress(local, jaws.map(({ id }) => id)), total: jaws.length, jawPicture: "jaw.webp", gummyPicture: "gummy.webp" }}
    deviceLanguage={language} languageStore={localLanguage(local)} appearance={manualAppearance("light")}
    themeStore={localTheme(local)} ageLevelStore={localAgeLevel(() => settings)} nameVersion={unreadVersion}
    {...emptyCare()} {...emptyPairs()} {...emptySkeletons()} {...emptySorting()} {...emptyDig()} {...pageAtRest()} {...timers} reducedMotion={() => reduced}
  />);
  return { ...view, storage, settings, featured, timers, parts };
}
