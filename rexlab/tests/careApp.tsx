import { render, screen } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { App, type AppProps } from "../src/App.tsx";
import type { CareProgress, Item, Random, Visitor } from "../src/care/index.ts";
import { localLanguage } from "../src/localLanguage.ts";
import { PROGRESS_KEY, localCareProgress, localPairsProgress, localProgress, localSortingProgress } from "../src/localProgress.ts";
import { localTheme } from "../src/localTheme.ts";
import {
  SHIPPED_CATALOGUE,
  SHIPPED_DINOSAURS,
  SHIPPED_PALS,
  SHIPPED_SORTABLES,
  SHIPPED_VISITORS,
  emptyDig,
  emptySkeletons,
  fakeBodyPicture,
  fakeItemPicture,
  featuring,
  manualAppearance,
  manualViewport,
  manualTimers,
  memoryStorage,
  pageAtRest,
  unreadVersion,
  type ManualViewport,
  type MemoryStorage,
  unsetAgeLevel,
  loadShownPictures,
  type PictureClock
} from "./support.ts";

type Clock = PictureClock;

export type CareAppOptions<C extends Clock> = {
  // Where progress, the language and the theme are kept: one storage, as
  // in a browser, so reopening the app on it is a reload.
  storage?: MemoryStorage;
  visitors?: readonly Visitor[];
  random?: Random;
  clock?: C;
  reducedMotion?: boolean;
  viewport?: ManualViewport;
  deviceLanguage?: string;
};

// The app as a child opens it for care. Its visitors come in the order
// given, as `random` picks them: the first by default.
export function openCareApp<C extends Clock = ReturnType<typeof manualTimers>>({
  storage = memoryStorage(),
  visitors = SHIPPED_VISITORS,
  random = () => 0,
  clock = manualTimers() as unknown as C,
  reducedMotion = false,
  viewport = manualViewport("landscape"),
  deviceLanguage = "en-GB"
}: CareAppOptions<C> = {}) {
  const view = render(
    <App
      {...featuring()}
      dinosaurs={SHIPPED_DINOSAURS}
      catalogue={SHIPPED_CATALOGUE}
      bodyPicture={fakeBodyPicture}
      random={random}
      portraitLayouts={{}}
      viewport={viewport}
      progress={localProgress(() => storage)}
      deviceLanguage={deviceLanguage}
      languageStore={localLanguage(() => storage)}
      nameVersion={unreadVersion}
      appearance={manualAppearance("light")}
      themeStore={localTheme(() => storage)}
      {...unsetAgeLevel()}
      visitors={visitors}
      careProgress={localCareProgress(() => storage)}
      itemPicture={fakeItemPicture}
      pals={SHIPPED_PALS}
      pairsProgress={localPairsProgress(() => storage)}
      {...emptySkeletons()}
      {...emptyDig()}
      {...pageAtRest()}
      reducedMotion={() => reducedMotion}
      sortables={SHIPPED_SORTABLES}
      sortingProgress={localSortingProgress(() => storage)}
      {...clock}
    />
  );
  loadShownPictures(clock);
  return { user: userEvent.setup(), clock, storage, unmount: view.unmount };
}

export function shipped(id: string): Visitor {
  const visitor = SHIPPED_VISITORS.find((each) => each.id === id);
  if (!visitor) throw new Error(`No ${id} in the shipped list`);
  return visitor;
}

// The visitors `ids` first, in that order, then every other shipped one.
export const visitorsFrom = (...ids: string[]) => [...ids.map(shipped), ...SHIPPED_VISITORS.filter(({ id }) => !ids.includes(id))];

// A stored record with care's entry, and the other games' entries given.
export const careRecord = (care: Partial<CareProgress> | unknown, games: Record<string, unknown> = {}) =>
  JSON.stringify({ schemaVersion: 1, games: { ...games, "dinosaur-care": care } });

// Care's entry as stored now, undefined while none is.
export function storedCare(storage: MemoryStorage): unknown {
  const raw = storage.items.get(PROGRESS_KEY);
  return raw === undefined ? undefined : (JSON.parse(raw) as { games?: Record<string, unknown> }).games?.["dinosaur-care"];
}

export const button = (name: string) => screen.getByRole("button", { name });

export async function openCare(user: UserEvent) {
  await user.click(button("CARE"));
}

export async function welcomeVisitor(user: UserEvent) {
  await user.click(button("CARE"));
  await user.click(button("NEW VISITOR"));
}

export const heartsShown = () => screen.getByLabelText("HEARTS").textContent;

export const needStates = () => [...document.querySelectorAll(".need")].map((need) => need.getAttribute("data-state"));

// What the need's bubble pictures, by its loaded pictures' names.
export const bubbleShows = () => [...document.querySelectorAll(".need-bubble .bubble-picture")].map((picture) => /^\/care\/(.+)\.webp$/.exec(picture.getAttribute("src") ?? "")?.[1] ?? null);

export const scoreShown = () => screen.getByLabelText("SCORE").textContent;

export const celebrations = () => screen.queryAllByRole("status").map((status) => status.getAttribute("aria-label"));

export const trayItems = (): Item[] => [...document.querySelectorAll(".tray-item")].map((item) => item.getAttribute("data-item") as Item);
