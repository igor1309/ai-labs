import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App, type AppProps } from "../src/App.tsx";
import { isLanguage } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { AGE_LEVEL_KEY, localAgeLevel } from "../src/localAgeLevel.ts";
import { localLanguage } from "../src/localLanguage.ts";
import { localCareProgress, localPairsProgress, localProgress, localSkeletonProgress, localSortingProgress, PROGRESS_KEY } from "../src/localProgress.ts";
import { localTheme } from "../src/localTheme.ts";
import { REVEAL } from "../src/skeletonGame.tsx";
import {
  SHIPPED_CATALOGUE,
  SHIPPED_DINOSAURS,
  SHIPPED_PALS,
  SHIPPED_SKELETONS,
  SHIPPED_SORTABLES,
  SHIPPED_VISITORS,
  emptyDig,
  fakeBodyPicture,
  fakeItemPicture,
  fakeSkeletonPicture,
  featuring,
  manualAppearance,
  manualViewport,
  manualPictures,
  manualVisibility,
  memoryStorage,
  pageAtRest,
  unreadVersion,
  type ManualViewport,
  type ManualPictures,
  type ManualVisibility,
  type MemoryStorage,
  loadShownPictures
} from "./support.ts";
import type { Place, Skeleton } from "../src/skeletons/index.ts";
import type { Theme } from "../src/theme.ts";

export type SkeletonsAppOptions = {
  // Where progress, the language and the theme are kept: one storage, as
  // in a browser.
  storage?: MemoryStorage;
  pictures?: ManualPictures;
  viewport?: ManualViewport;
  portraitLayouts?: AppProps["portraitLayouts"];
  visibility?: ManualVisibility;
  deviceLanguage?: string;
  // Whether the device asks for reduced motion.
  reducedMotion?: boolean;
  // The theme the device shows.
  appearance?: Theme;
  // Told each game whose start the app counts.
  startCounter?: AppProps["startCounter"];
  // Where the parent's age level is kept, apart from progress, so a test
  // that blocks progress still has the level it gives; none picked by
  // default.
  ageLevels?: MemoryStorage;
  // The skeletons to build, the shipped ones by default.
  skeletons?: readonly Skeleton[];
  // The app's random source, always 0 by default: nothing drawn turns a
  // piece.
  random?: () => number;
  // Whether the home page's pictures load as it opens; if not, they load
  // only when the test finishes them.
  loadHome?: boolean;
};

// The app opened on the home page, its own pictures loaded and those
// asked for after loading only when the test finishes them.
export function openHomeApp({
  storage = memoryStorage(),
  pictures = manualPictures(),
  viewport = manualViewport("landscape"),
  portraitLayouts = {},
  visibility = manualVisibility("visible"),
  deviceLanguage = "en-GB",
  reducedMotion = false,
  appearance = "light",
  startCounter,
  ageLevels = memoryStorage(),
  skeletons = SHIPPED_SKELETONS,
  loadHome = true,
  random = () => 0
}: SkeletonsAppOptions = {}) {
  const props: AppProps = {
    portraitLayouts,
    dinosaurs: SHIPPED_DINOSAURS,
    catalogue: SHIPPED_CATALOGUE,
    bodyPicture: fakeBodyPicture,
    random,
    viewport,
    pageVisibility: visibility,
    progress: localProgress(() => storage),
    deviceLanguage,
    languageStore: localLanguage(() => storage),
    nameVersion: unreadVersion,
    appearance: manualAppearance(appearance),
    themeStore: localTheme(() => storage),
    ageLevelStore: localAgeLevel(() => ageLevels),
    visitors: SHIPPED_VISITORS,
    careProgress: localCareProgress(() => storage),
    itemPicture: fakeItemPicture,
    pals: SHIPPED_PALS,
    pairsProgress: localPairsProgress(() => storage),
    sortables: SHIPPED_SORTABLES,
    sortingProgress: localSortingProgress(() => storage),
    skeletons,
    skeletonPicture: fakeSkeletonPicture,
    ...emptyDig(),
    ...pageAtRest(),
    skeletonProgress: localSkeletonProgress(() => storage),
    reducedMotion: () => reducedMotion,
    ...featuring(),
    ...(startCounter && { startCounter }),
    ...pictures
  };
  const view = render(<App {...props} />);
  if (loadHome) loadShownPictures(pictures);
  return { user: userEvent.setup(), storage, pictures, viewport, visibility, ageLevels, unmount: view.unmount };
}

// The age level a parent picked as Hatchling, whose puzzle of four pieces
// the skeleton tests not about the levels play.
export const hatchlingLevel = () => memoryStorage({ [AGE_LEVEL_KEY]: JSON.stringify({ level: "hatchling", revision: "hatchling" }) });

// The app opened on the skeleton game's choice of dinosaurs by its home
// tile, its pictures loading only when the test finishes them, at
// Hatchling unless the test gives its own age level.
export function openSkeletonsApp(options: SkeletonsAppOptions = {}) {
  const opened = openHomeApp({ ageLevels: hatchlingLevel(), ...options });
  fireEvent.click(screen.getByRole("button", { name: shownTexts().skeletons }));
  return opened;
}

// Every picture of a skeleton's puzzle: the whole skeleton, then each of
// its pieces in the tray's order.
export const puzzlePictures = (id: string) => ["skeleton", "skull", "spine", "legs", "tail"].map((part) => fakeSkeletonPicture(id, part));

// Ends the loading of every picture asked for so far.
export function finishLoading(pictures: ManualPictures) {
  for (const url of new Set(pictures.loading())) pictures.finish(url);
}

// The texts of the language the app is in, as it sets on the document.
const shownTexts = () => {
  const { lang } = document.documentElement;
  return TEXTS[isLanguage(lang) ? lang : "en"];
};

export const choices = (name = shownTexts().creatures) => within(screen.getByRole("group", { name })).getAllByRole("button");

export const board = (name = shownTexts().skeleton) => screen.getByRole("group", { name });

export const tray = (name = shownTexts().bones) => screen.getByRole("group", { name });

// Each slot on the outline, by its piece, and whether it is fitted.
export const slots = () => [...board().querySelectorAll(".skeleton-slot")].map((slot) => [slot.getAttribute("data-piece"), slot.getAttribute("data-state")]);

// The shipped skeleton of the dinosaur with this id.
export function skeletonOf(id: string): Skeleton {
  const skeleton = SHIPPED_SKELETONS.find((each) => each.id === id);
  if (!skeleton) throw new Error(`No ${id} skeleton is shipped`);
  return skeleton;
}

// The app opened on the puzzle of the dinosaur shown as `name`, its
// pictures loaded and its board laid out.
export async function openPuzzle(name: string, options: SkeletonsAppOptions = {}) {
  const opened = openSkeletonsApp(options);
  await opened.user.click(screen.getByRole("button", { name }));
  act(() => finishLoading(opened.pictures));
  layOutPuzzle();
  return opened;
}

// Where the board and the tray's spots are on the iPad's screen, in CSS
// pixels, as the design lays them out: jsdom lays nothing out. The board
// draws the 800×600 frame 920 pixels wide.
export const BOARD_AT = { left: 56, top: 124, width: 920, height: 690 };
const SPOTS_AT = { left: 1032, top: 152, width: 324, height: 140, gap: 24 };

const rectOf = ({ left, top, width, height }: { left: number; top: number; width: number; height: number }) => {
  const rect = { left, top, width, height, x: left, y: top, right: left + width, bottom: top + height };
  return () => ({ ...rect, toJSON: () => rect });
};

export function layOutPuzzle() {
  board().getBoundingClientRect = rectOf(BOARD_AT);
  spots().forEach((spot, at) => {
    spot.getBoundingClientRect = rectOf({ ...SPOTS_AT, top: SPOTS_AT.top + at * (SPOTS_AT.height + SPOTS_AT.gap) });
  });
}

export type At = { clientX: number; clientY: number };

// Hatchling's pieces, in their order in the tray.
export const PIECES = ["skull", "spine", "legs", "tail"] as const;
export type Piece = (typeof PIECES)[number];

// Where a piece of any of its skeleton's cuts fits in its frame: a piece
// two cuts share fits at one place.
export function placeOf(skeleton: Skeleton, piece: string): Place {
  const found = Object.values(skeleton.cuts)
    .flat()
    .find(({ id }) => id === piece);
  if (found === undefined) throw new Error(`${skeleton.id} has no ${piece}`);
  return found.place;
}

// Where on the screen a piece's centre sits in its home, moved by `dx`
// and `dy` CSS pixels.
export function homeOf(skeleton: Skeleton, piece: string, dx = 0, dy = 0): At {
  const { x, y, width, height } = placeOf(skeleton, piece);
  const scale = BOARD_AT.width / skeleton.frame.width;
  return { clientX: BOARD_AT.left + (x + width / 2) * scale + dx, clientY: BOARD_AT.top + (y + height / 2) * scale + dy };
}

// Far from every home, beside the board.
export const AWAY: At = { clientX: 1000, clientY: 860 };

// Each spot in the tray, in order.
export const spots = () => [...tray().querySelectorAll<HTMLElement>(".skeleton-tray-spot")];

export const spotOf = (piece: string) => {
  const spot = tray().querySelector<HTMLElement>(`.skeleton-tray-spot[data-piece="${piece}"]`);
  if (!spot) throw new Error(`The tray has no spot for the ${piece}`);
  return spot;
};

export const slotOf = (piece: string) => {
  const slot = board().querySelector<HTMLElement>(`.skeleton-slot[data-piece="${piece}"]`);
  if (!slot) throw new Error(`The board has no slot for the ${piece}`);
  return slot;
};

// The pieces fitted on the board, in the tray's order.
export const fittedPieces = () => slots().flatMap(([piece, state]) => (state === "fitted" ? [piece] : []));

// The pieces still in the tray, in its order.
export const trayPieces = () => within(tray()).queryAllByRole("img").map((piece) => piece.getAttribute("alt"));

export const lifted = () => document.querySelector<HTMLElement>(".skeleton-lifted");

// The pieces and slots help points at.
export const hints = () =>
  [...document.querySelectorAll("[data-hint]")].map((element) => `${element.classList.contains("skeleton-slot") ? "slot" : "spot"} ${element.getAttribute("data-piece")}`);

// One pointer's steps, each dispatched as a browser does: a press on what
// is under it, then moves and its release or cancel on the window.
function point(type: string, target: EventTarget, at: At, pointerId: number) {
  act(() => {
    target.dispatchEvent(new PointerEvent(type, { ...at, pointerId, button: 0, pointerType: "touch", bubbles: true }));
  });
}

export const press = (target: Element, at: At, pointerId = 1) => point("pointerdown", target, at, pointerId);
export const moveTo = (at: At, pointerId = 1) => point("pointermove", document.body, at, pointerId);
export const release = (at: At, pointerId = 1) => point("pointerup", document.body, at, pointerId);
export const cancel = (at: At, pointerId = 1) => point("pointercancel", document.body, at, pointerId);

// Picks a piece up from its spot in the tray and lets it go at `at`.
export function dragTo(piece: string, at: At, pointerId = 1) {
  const spot = spotOf(piece);
  const { left, top } = spot.getBoundingClientRect();
  press(spot, { clientX: left + 40, clientY: top + 40 }, pointerId);
  moveTo(at, pointerId);
  release(at, pointerId);
}

// Taps a piece in its spot in the tray: a press let go where it pressed.
export function tap(piece: string) {
  const spot = spotOf(piece);
  const { left, top } = spot.getBoundingClientRect();
  const at = { clientX: left + 40, clientY: top + 40 };
  press(spot, at);
  release(at);
}

// Fits a piece in its home, dropped right on it.
export const fit = (skeleton: Skeleton, piece: string) => dragTo(piece, homeOf(skeleton, piece));

// The pieces in the tray's spots, in its order, whatever the cut.
export const spotPieces = () => spots().map((spot) => spot.getAttribute("data-piece") ?? "");

// Fits every piece in the tray, `last` the last of them when the cut has
// it.
export function fitAll(skeleton: Skeleton, last: string = "tail") {
  const pieces = spotPieces();
  for (const piece of pieces.filter((each) => each !== last)) fit(skeleton, piece);
  if (pieces.includes(last)) fit(skeleton, last);
}

// The reveal of a finished skeleton, or null while it is not shown.
export const reveal = () => document.querySelector<HTMLElement>(".skeleton-result");

// Storage holding the skeleton game's entry, beside a quiz entry of its
// own.
export const keptSkeletons = (entry: unknown) =>
  memoryStorage({ [PROGRESS_KEY]: JSON.stringify({ schemaVersion: 1, games: { "compare-dinosaurs": { bestScore: 7, roundsPlayed: 3 }, "skeleton-assembly": entry } }) });

// The skeleton game's entry as saved, or undefined.
export const savedSkeletons = (storage: MemoryStorage) => {
  const raw = storage.items.get(PROGRESS_KEY);
  return raw === undefined ? undefined : JSON.parse(raw).games["skeleton-assembly"];
};

// The finished skeleton's pause, and its body picture, both over.
export function revealNow(pictures: ManualPictures, id: string, pause = REVEAL.motion) {
  act(() => {
    pictures.fire(pause);
    pictures.finish(fakeBodyPicture(id));
  });
}
