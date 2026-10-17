import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App, type AppProps } from "../src/App.tsx";
import { localLanguage } from "../src/localLanguage.ts";
import { localCareProgress, localPairsProgress, localProgress, localSortingProgress } from "../src/localProgress.ts";
import { localTheme } from "../src/localTheme.ts";
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
  manualAppearance,
  manualOrientation,
  manualPictures,
  memoryStorage,
  type ManualOrientation,
  type ManualPictures,
  type MemoryStorage
} from "./support.ts";

export type SkeletonsAppOptions = {
  // Where progress, the language and the theme are kept: one storage, as
  // in a browser.
  storage?: MemoryStorage;
  pictures?: ManualPictures;
  orientation?: ManualOrientation;
  deviceLanguage?: string;
};

// The app opened on the skeleton game's choice of dinosaurs, its pictures
// loading only when the test finishes them.
export function openSkeletonsApp({
  storage = memoryStorage(),
  pictures = manualPictures(),
  orientation = manualOrientation("landscape"),
  deviceLanguage = "en-GB"
}: SkeletonsAppOptions = {}) {
  const props: AppProps = {
    dinosaurs: SHIPPED_DINOSAURS,
    catalogue: SHIPPED_CATALOGUE,
    bodyPicture: fakeBodyPicture,
    random: () => 0,
    orientation,
    progress: localProgress(() => storage),
    deviceLanguage,
    languageStore: localLanguage(() => storage),
    appearance: manualAppearance("light"),
    themeStore: localTheme(() => storage),
    visitors: SHIPPED_VISITORS,
    careProgress: localCareProgress(() => storage),
    itemPicture: fakeItemPicture,
    pals: SHIPPED_PALS,
    pairsProgress: localPairsProgress(() => storage),
    sortables: SHIPPED_SORTABLES,
    sortingProgress: localSortingProgress(() => storage),
    skeletons: SHIPPED_SKELETONS,
    skeletonPicture: fakeSkeletonPicture,
    reducedMotion: () => false,
    opening: "skeletons",
    ...pictures
  };
  render(<App {...props} />);
  return { user: userEvent.setup(), storage, pictures, orientation };
}

// Every picture of a skeleton's puzzle: the whole skeleton, then each of
// its pieces in the tray's order.
export const puzzlePictures = (id: string) => ["skeleton", "skull", "spine", "legs", "tail"].map((part) => fakeSkeletonPicture(id, part));

// Ends the loading of every picture asked for so far.
export function finishLoading(pictures: ManualPictures) {
  for (const url of new Set(pictures.loading())) pictures.finish(url);
}

export const choices = (name = "DINOSAURS") => within(screen.getByRole("group", { name })).getAllByRole("button");

export const board = (name = "SKELETON") => screen.getByRole("group", { name });

export const tray = (name = "BONES") => screen.getByRole("group", { name });

// Each slot on the outline, by its piece, and whether it is fitted.
export const slots = () => [...board().querySelectorAll(".skeleton-slot")].map((slot) => [slot.getAttribute("data-piece"), slot.getAttribute("data-state")]);
