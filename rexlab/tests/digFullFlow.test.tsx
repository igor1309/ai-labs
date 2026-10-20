import { act, fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AgeLevel } from "../src/ageLevel.ts";
import digTile from "../src/assets/dig/tile.webp";
import { GUST, STAR_LANDS } from "../src/digGame.tsx";
import { TEXTS } from "../src/language/texts.ts";
import { AGE_LEVEL_KEY } from "../src/localAgeLevel.ts";
import { PROGRESS_KEY } from "../src/localProgress.ts";
import { PICTURE_LIMIT } from "../src/Picture.tsx";
import { finishBoard, board, digUp, clearCells, drag, openDigApp, placeBoard } from "./digApp.tsx";
import { badgeOf } from "./homePage.tsx";
import { fakeBodyPicture, featuredCard, gameDoor, homeTile, manualPictures, memoryStorage, SHIPPED_DIG, symbolOf } from "./support.ts";
import { filterTaps, tapAt } from "./taps.ts";

const record = (dig: object, featured = "dig") => ({ [PROGRESS_KEY]: JSON.stringify({ schemaVersion: 1, games: {
  dig, "home-featured": { starts: {}, featured: { day: "2026-10-18", game: featured } }
} }) });
const button = (name: string) => screen.getByRole("button", { name });
const level = () => board().getAttribute("data-level");
const finish = (app: ReturnType<typeof openDigApp>) => {
  placeBoard(800); digUp();
  finishBoard(app.timers);
  act(() => app.timers.fire(STAR_LANDS.motion));
};

it("offers committed sand art with the brush, and brightens and presses the tile before opening", async () => {
  const app = openDigApp();
  const tile = homeTile("DIG");
  expect(tile.querySelector("img")?.getAttribute("src")).toBe(digTile);
  expect(symbolOf(tile)).toBe("brush");
  expect(tile.nextElementSibling?.className).toBe("more-coming");
  expect(tile.previousElementSibling).toBe(homeTile("SKELETONS"));
  expect(badgeOf(tile)).toBeNull();
  await app.user.hover(tile);
  expect(Number(/brightness\(([^)]+)\)/.exec(getComputedStyle(tile).filter)?.[1])).toBeGreaterThan(1);
  await app.user.pointer({ keys: "[TouchA>]", target: tile });
  expect(getComputedStyle(tile).transform).toMatch(/^scale\(0\.\d+\)$/);
  expect(document.querySelector(".dig-board")).toBeNull();
  await app.user.pointer({ keys: "[/TouchA]", target: tile });
  expect(level()).toBe("explorer");
});

it.each(["compare", "dig"])("shows the stored count on DIG's door with %s featured, ignores retired ids and updates it after a round", (featured) => {
  const dug = SHIPPED_DIG.filter(({ id }) => id !== "tyrannosaurus").slice(0, 7).map(({ id }) => id);
  const app = openDigApp({ storage: memoryStorage(record({ dug: [...dug, "retired"], badges: [] }, featured)) });
  // On DIG's day the large card is its only door.
  const door = () => gameDoor("DIG");
  expect(door() === featuredCard()).toBe(featured === "dig");
  expect([badgeOf(door())?.textContent, symbolOf(badgeOf(door())!)]).toEqual(["7", "star"]);
  fireEvent.click(door()); finish(app); fireEvent.click(button("HOME"));
  expect(badgeOf(door())?.textContent).toBe("8");
});

it.each(["tile", "featured", "DIG AGAIN"])("a quick double tap from %s counts one start and brushes no sand", (door) => {
  const app = openDigApp({ storage: memoryStorage(record({ dug: [], badges: [] }, door === "featured" ? "dig" : "compare")), ageLevel: { level: "hatchling", revision: "parent" } });
  if (door === "DIG AGAIN") { fireEvent.click(homeTile("DIG")); finish(app); }
  const before = app.featured.history().timesStarted.get("dig") ?? 0;
  const target = door === "tile" ? homeTile("DIG") : door === "featured" ? featuredCard() : button("DIG AGAIN");
  filterTaps(); tapAt(target, 0, { x: 400, y: 300 });
  placeBoard(800); tapAt(board(), 200, { x: 400, y: 300 });
  expect(clearCells()).toEqual([]);
  expect(app.featured.history().timesStarted.get("dig")).toBe(before + 1);
  expect(JSON.parse(app.storage.items.get(PROGRESS_KEY)!).games["home-featured"].starts.dig).toBe(before + 1);
  tapAt(board(), 900, { x: 400, y: 300 });
  expect(clearCells().length).toBeGreaterThan(0);
});

it("starts from the tile with no count when stored progress cannot be read", () => {
  openDigApp({ storage: memoryStorage({}, { read: false }) });
  expect(badgeOf(homeTile("DIG"))).toBeNull();
  fireEvent.click(homeTile("DIG"));
  expect(level()).toBe("explorer");
  expect(screen.queryByLabelText("DUG UP")).toBeNull();
  expect(screen.getByRole("button", { name: "HOME" })).toBeDefined();
});

it("starts and brushes while its body picture loads, then fades it in under the same brushed sand over 200ms", () => {
  const pictures = manualPictures();
  openDigApp({ timers: pictures, ageLevel: { level: "hatchling", revision: "parent" } });
  fireEvent.click(homeTile("DIG")); placeBoard(800);
  const picture = board().querySelector<HTMLImageElement>(".dig-picture")!;
  expect([picture.dataset.picture, picture.getAttribute("src"), clearCells()]).toEqual(["loading", null, []]);
  expect(getComputedStyle(picture).animation).toContain("shimmer");
  expect(picture.parentElement?.querySelector(":scope > .dig-picture ~ .dig-sand")).not.toBeNull();
  drag([[100, 310], [700, 310]]);
  const clear = clearCells();
  expect(clear.length).toBeGreaterThan(0);
  act(() => pictures.finish(fakeBodyPicture("tyrannosaurus")));
  expect([picture.dataset.picture, picture.getAttribute("src"), clearCells()]).toEqual(["appearing", fakeBodyPicture("tyrannosaurus"), clear]);
  expect(getComputedStyle(picture).animation).toBe("fade-in var(--motion-picture) var(--ease-out) both");
  expect(getComputedStyle(document.documentElement).getPropertyValue("--motion-picture").trim()).toBe("200ms");
});

it.each(["failed", "timed out"])("finishes Hatchling with a %s body picture, preserving the failure look, name and star on the reveal", (failure) => {
  const pictures = manualPictures();
  const app = openDigApp({ timers: pictures, ageLevel: { level: "hatchling", revision: "parent" } });
  fireEvent.click(homeTile("DIG")); placeBoard(800);
  act(() => failure === "failed" ? pictures.fail(fakeBodyPicture("tyrannosaurus")) : pictures.fire(PICTURE_LIMIT));
  expect(board().querySelector(".dig-picture")?.getAttribute("data-picture")).toBe("failed");
  drag([[100, 310], [700, 310]]);
  expect(clearCells().length).toBeGreaterThan(0);
  digUp();
  expect(board().getAttribute("data-blown")).toBe("true");
  expect(Number(board().getAttribute("data-cleared"))).toBeGreaterThanOrEqual(0.95);
  finishBoard(pictures);
  expect(document.querySelector(".dig-reveal-picture")?.getAttribute("data-picture")).toBe("failed");
  expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("TYRANNOSAURUS");
  expect(screen.getByRole("region", { name: "DUG UP" }).textContent).toContain(`1/${SHIPPED_DIG.length}`);
  expect(JSON.parse(app.storage.items.get(PROGRESS_KEY)!).games.dig.dug).toEqual(["tyrannosaurus"]);
});

// Compare the catalogue and page themselves: no dig progress is passed
// into either, and their rendered contract stays identical across saves.
it("shows no trace of digging or a first-pick badge in the catalogue or a dinosaur's page", () => {
  const snapshots = [[], ["triceratops"]].map((dug) => {
    const app = openDigApp({ storage: memoryStorage(record({ dug, badges: dug })) });
    fireEvent.click(homeTile("ALL DINOSAURS"));
    const catalogue = screen.getByRole("main").outerHTML;
    fireEvent.click(screen.getByRole("button", { name: /Triceratops/i }));
    const page = screen.getByRole("main").outerHTML;
    app.unmount();
    return [catalogue, page];
  });
  expect(snapshots[1]).toEqual(snapshots[0]);
});

const choiceRecord = (choice: AgeLevel, revision = "parent") => record({ dug: [], badges: [], levelChoice: { level: choice, revision } }, "compare");
const settings = (level: AgeLevel) => memoryStorage({ [AGE_LEVEL_KEY]: JSON.stringify({ level, revision: "parent" }) });
function parentChooses(chosen: AgeLevel) {
  fireEvent.click(button("Age level"));
  fireEvent.click(within(screen.getByRole("menu", { name: "Age level" })).getByRole("menuitemradio", { name: new RegExp(TEXTS.en.ageLevels[chosen].name) }));
}

it.each([
  ["explorer", "hatchling", "paleontologist"], ["hatchling", "paleontologist", "explorer"]
] as const)("keeps the child's %s setting's %s choice across reopen until a parent picks %s, then never revives it", (setting, choice, next) => {
  const storage = memoryStorage(choiceRecord(choice));
  const age = settings(setting);
  let app = openDigApp({ storage, settingsStorage: age });
  fireEvent.click(homeTile("DIG")); expect(level()).toBe(choice); app.unmount();
  app = openDigApp({ storage, settingsStorage: age });
  parentChooses(next); app.unmount();
  app = openDigApp({ storage, settingsStorage: age });
  fireEvent.click(homeTile("DIG")); expect(level()).toBe(next);
  fireEvent.click(button("HOME")); parentChooses(setting);
  fireEvent.click(homeTile("DIG")); expect(level()).toBe(setting);
});

it("drops a child's choice when the parent setting changes and changes back before play", () => {
  openDigApp({ storage: memoryStorage(choiceRecord("hatchling")), settingsStorage: settings("explorer") });
  parentChooses("paleontologist"); parentChooses("explorer");
  fireEvent.click(homeTile("DIG")); expect(level()).toBe("explorer");
});

it.each(["deleted", "not readable"])("never revives a child's choice after the saved setting is %s", (lost) => {
  const storage = memoryStorage(choiceRecord("hatchling"));
  const age = memoryStorage(lost === "deleted" ? {} : { [AGE_LEVEL_KEY]: "{" });
  const app = openDigApp({ storage, settingsStorage: age });
  parentChooses("paleontologist"); parentChooses("explorer"); app.unmount();
  openDigApp({ storage, settingsStorage: age });
  fireEvent.click(homeTile("DIG")); expect(level()).toBe("explorer");
});

it("keeps the child's choice after choosing the parent level already set and reopening", () => {
  const storage = memoryStorage(choiceRecord("hatchling"));
  const age = settings("explorer");
  const app = openDigApp({ storage, settingsStorage: age });
  parentChooses("explorer"); app.unmount();
  openDigApp({ storage, settingsStorage: age });
  fireEvent.click(homeTile("DIG")); expect(level()).toBe("hatchling");
});
