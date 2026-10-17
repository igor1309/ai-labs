import type { AppProps } from "./App.tsx";
import records from "./data/dinosaurs.json";
import { decodedPictures, type DecodingImage } from "./decodedPictures.ts";
import { bodyPictures } from "./dinosaurPictures.ts";
import { readCatalogue, readDinosaurs, readVisitors } from "./dinosaurs.ts";
import { itemPictures } from "./itemPictures.ts";
import { localLanguage } from "./localLanguage.ts";
import { localCareProgress, localProgress } from "./localProgress.ts";
import { localTheme } from "./localTheme.ts";
import { mediaAppearance } from "./mediaAppearance.ts";
import { mediaReducedMotion } from "./mediaMotion.ts";
import { mediaOrientation } from "./mediaOrientation.ts";

// Every body picture, loaded through Vite so its URL carries a content
// hash. Never inlined, so a picture is cached as a file of its own.
const BODY_PICTURES = import.meta.glob<string>("./assets/dinos/*/body.webp", { eager: true, query: "?url&no-inline", import: "default" });

// Every care picture, loaded the same way.
const CARE_PICTURES = import.meta.glob<string>("./assets/care/*.webp", { eager: true, query: "?url&no-inline", import: "default" });

// The pictures care shows: each item, and the empty bowl of hunger.
const CARE_PICTURE_NAMES = ["plants", "meat", "water", "bath", "nest", "bowl"];

// What the app takes from the browser it runs in.
export type Browser = {
  localStorage: Pick<Storage, "getItem" | "setItem">;
  matchMedia(query: string): MediaQueryList;
  navigator: { language: string };
  Image: new () => DecodingImage;
  setTimeout(fire: () => void, ms: number): number;
  clearTimeout(id: number): void;
};

// The app's collaborators in a browser. Progress, the chosen language and
// the chosen theme outlive the visit, so all of them are kept in local
// storage.
export function appProps(browser: Browser): AppProps {
  const storage = () => browser.localStorage;
  const media = mediaOrientation((query) => browser.matchMedia(query));
  const appearance = mediaAppearance((query) => browser.matchMedia(query));
  const dinosaurs = readDinosaurs(records);
  return {
    dinosaurs,
    catalogue: readCatalogue(records),
    bodyPicture: bodyPictures(BODY_PICTURES, dinosaurs.map(({ id }) => id)),
    random: Math.random,
    orientation: { isPortrait: media.portrait, subscribe: media.watch },
    progress: localProgress(storage),
    deviceLanguage: browser.navigator.language,
    languageStore: localLanguage(storage),
    appearance: { isDark: appearance.dark, subscribe: appearance.watch },
    themeStore: localTheme(storage),
    visitors: readVisitors(records),
    careProgress: localCareProgress(storage),
    itemPicture: itemPictures(CARE_PICTURES, CARE_PICTURE_NAMES),
    reducedMotion: mediaReducedMotion((query) => browser.matchMedia(query)),
    loadPicture: decodedPictures(() => new browser.Image()),
    startTimer: (ms, fire) => {
      const id = browser.setTimeout(fire, ms);
      return () => browser.clearTimeout(id);
    }
  };
}
