import type { AppProps } from "./App.tsx";
import records from "./data/dinosaurs.json";
import skeletonPlaces from "./data/skeletons.json";
import { decodedPictures, type DecodingImage } from "./decodedPictures.ts";
import { documentVisibility } from "./documentVisibility.ts";
import { bodyPictures, skeletonPictures } from "./dinosaurPictures.ts";
import { readCatalogue, readDinosaurs, readPals, readSkeletons, readSortables, readVisitors } from "./dinosaurs.ts";
import { HOME_GAMES } from "./HomePage.tsx";
import { itemPictures } from "./itemPictures.ts";
import { localAgeLevel } from "./localAgeLevel.ts";
import { localLanguage } from "./localLanguage.ts";
import { localCareProgress, localFeatured, localPairsProgress, localProgress, localSkeletonProgress, localSortingProgress } from "./localProgress.ts";
import { localTheme } from "./localTheme.ts";
import { mediaAppearance } from "./mediaAppearance.ts";
import { mediaReducedMotion } from "./mediaMotion.ts";
import { mediaOrientation } from "./mediaOrientation.ts";
import { pictureStore } from "./Picture.tsx";
import { tapFilter, type TapInput } from "./tapFilter.ts";

// Every body picture, loaded through Vite so its URL carries a content
// hash. Never inlined, so a picture is cached as a file of its own.
const BODY_PICTURES = import.meta.glob<string>("./assets/dinos/*/body.webp", { eager: true, query: "?url&no-inline", import: "default" });

// Every care picture, loaded the same way.
const CARE_PICTURES = import.meta.glob<string>("./assets/care/*.webp", { eager: true, query: "?url&no-inline", import: "default" });

// Every skeleton picture, the whole skeleton and each of its pieces,
// loaded the same way.
const SKELETON_PICTURES = import.meta.glob<string>("./assets/skeletons/*/*.webp", { eager: true, query: "?url&no-inline", import: "default" });

// The pictures care shows: each item, and the empty bowl of hunger.
const CARE_PICTURE_NAMES = ["plants", "meat", "water", "bath", "nest", "bowl"];

// What the app takes from the browser it runs in.
export type Browser = {
  localStorage: Pick<Storage, "getItem" | "setItem">;
  matchMedia(query: string): MediaQueryList;
  navigator: { language: string };
  document: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener"> & {
    getElementById(id: string): Pick<Element, "setAttribute"> | null;
  };
  Image: new () => DecodingImage;
  setTimeout(fire: () => void, ms: number): number;
  clearTimeout(id: number): void;
  Date: { now(): number };
};

// Each pointer event the double-tap filter reads, and the step of a touch
// it is.
const TOUCH_STEPS = { pointerdown: "press", pointermove: "move", pointerup: "release", pointercancel: "cancel" } as const;

// Puts the double-tap filter before every handler of the app: it listens
// on `target`, the window in a browser, as events go down, so what it
// swallows reaches no handler. Each input is timed by its event's own
// time, never by when it is handled. A click with no detail was made by a
// key or assistive technology. Returns how to take the filter away.
export function filterDoubleTaps(target: Pick<EventTarget, "addEventListener" | "removeEventListener">, filter = tapFilter()): () => void {
  const listen = (type: string, input: (event: Event) => TapInput) => {
    const listener = (event: Event) => {
      if (filter(input(event))) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    target.addEventListener(type, listener, { capture: true });
    return () => target.removeEventListener(type, listener, { capture: true });
  };
  const stops = [
    ...Object.entries(TOUCH_STEPS).map(([type, kind]) =>
      listen(type, (event) => {
        const { pointerId, clientX, clientY, timeStamp } = event as PointerEvent;
        return { kind, pointer: pointerId, x: clientX, y: clientY, time: timeStamp };
      })
    ),
    listen("click", (event) => ({ kind: "tap", byKey: (event as MouseEvent).detail === 0 }))
  ];
  return () => stops.forEach((stop) => stop());
}

// Names index.html's version footer, which stands outside the app.
export function versionFooter(document: Browser["document"]): (label: string) => void {
  const footer = document.getElementById("version");
  if (!footer) {
    throw new Error("index.html has no #version element");
  }
  return (label) => footer.setAttribute("aria-label", label);
}

// The app's collaborators in a browser. Progress, start counts and the
// day's featured game, the chosen language, theme and age level outlive
// the visit, so all of them are kept in local storage.
export function appProps(browser: Browser): AppProps {
  const storage = () => browser.localStorage;
  const media = mediaOrientation((query) => browser.matchMedia(query));
  const appearance = mediaAppearance((query) => browser.matchMedia(query));
  const visibility = documentVisibility(browser.document);
  const dinosaurs = readDinosaurs(records);
  const skeletons = readSkeletons(records, skeletonPlaces);
  const featured = localFeatured(storage, HOME_GAMES);
  return {
    dinosaurs,
    catalogue: readCatalogue(records),
    bodyPicture: bodyPictures(BODY_PICTURES, dinosaurs.map(({ id }) => id)),
    random: Math.random,
    orientation: { isPortrait: media.portrait, subscribe: media.watch },
    pageVisibility: { isHidden: visibility.hidden, subscribe: visibility.watch },
    progress: localProgress(storage),
    deviceLanguage: browser.navigator.language,
    languageStore: localLanguage(storage),
    nameVersion: versionFooter(browser.document),
    appearance: { isDark: appearance.dark, subscribe: appearance.watch },
    themeStore: localTheme(storage),
    ageLevelStore: localAgeLevel(storage),
    visitors: readVisitors(records),
    careProgress: localCareProgress(storage),
    sortables: readSortables(records),
    sortingProgress: localSortingProgress(storage),
    pals: readPals(records),
    pairsProgress: localPairsProgress(storage),
    itemPicture: itemPictures(CARE_PICTURES, CARE_PICTURE_NAMES),
    skeletons,
    skeletonPicture: skeletonPictures(SKELETON_PICTURES, Object.fromEntries(skeletons.map(({ id, cuts }) => [id, ["skeleton", ...Object.values(cuts).flatMap((cut) => cut.map((piece) => piece.id))]]))),
    skeletonProgress: localSkeletonProgress(storage),
    reducedMotion: mediaReducedMotion((query) => browser.matchMedia(query)),
    now: () => new Date(browser.Date.now()),
    featuredStore: featured,
    startCounter: featured,
    pictures: pictureStore(decodedPictures(() => new browser.Image())),
    startTimer: (ms, fire) => {
      const id = browser.setTimeout(fire, ms);
      return () => browser.clearTimeout(id);
    }
  };
}
