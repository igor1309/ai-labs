import { act, render, screen, within } from "@testing-library/react";
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
  manualVisibility,
  memoryStorage,
  type ManualOrientation,
  type ManualPictures,
  type ManualVisibility,
  type MemoryStorage
} from "./support.ts";
import type { Piece, Skeleton } from "../src/skeletons/index.ts";

export type SkeletonsAppOptions = {
  // Where progress, the language and the theme are kept: one storage, as
  // in a browser.
  storage?: MemoryStorage;
  pictures?: ManualPictures;
  orientation?: ManualOrientation;
  visibility?: ManualVisibility;
  deviceLanguage?: string;
};

// The app opened on the skeleton game's choice of dinosaurs, its pictures
// loading only when the test finishes them.
export function openSkeletonsApp({
  storage = memoryStorage(),
  pictures = manualPictures(),
  orientation = manualOrientation("landscape"),
  visibility = manualVisibility("visible"),
  deviceLanguage = "en-GB"
}: SkeletonsAppOptions = {}) {
  const props: AppProps = {
    dinosaurs: SHIPPED_DINOSAURS,
    catalogue: SHIPPED_CATALOGUE,
    bodyPicture: fakeBodyPicture,
    random: () => 0,
    orientation,
    pageVisibility: visibility,
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
  return { user: userEvent.setup(), storage, pictures, orientation, visibility };
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

// Where on the screen a piece's centre sits in its home, moved by `dx`
// and `dy` CSS pixels.
export function homeOf(skeleton: Skeleton, piece: Piece, dx = 0, dy = 0): At {
  const { x, y, width, height } = skeleton.places[piece];
  const scale = BOARD_AT.width / skeleton.frame.width;
  return { clientX: BOARD_AT.left + (x + width / 2) * scale + dx, clientY: BOARD_AT.top + (y + height / 2) * scale + dy };
}

// Far from every home, beside the board.
export const AWAY: At = { clientX: 1000, clientY: 860 };

// Each spot in the tray, in order.
export const spots = () => [...tray().querySelectorAll<HTMLElement>(".skeleton-tray-spot")];

export const spotOf = (piece: Piece) => {
  const spot = tray().querySelector<HTMLElement>(`.skeleton-tray-spot[data-piece="${piece}"]`);
  if (!spot) throw new Error(`The tray has no spot for the ${piece}`);
  return spot;
};

export const slotOf = (piece: Piece) => {
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
export function dragTo(piece: Piece, at: At, pointerId = 1) {
  const spot = spotOf(piece);
  const { left, top } = spot.getBoundingClientRect();
  press(spot, { clientX: left + 40, clientY: top + 40 }, pointerId);
  moveTo(at, pointerId);
  release(at, pointerId);
}

// Fits a piece in its home, dropped right on it.
export const fit = (skeleton: Skeleton, piece: Piece) => dragTo(piece, homeOf(skeleton, piece));
