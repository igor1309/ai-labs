import { act, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AgeLevel } from "../src/ageLevel.ts";
import { TEXTS } from "../src/language/texts.ts";
import { PICTURE_LIMIT } from "../src/Picture.tsx";
import { AGE_LEVEL_KEY } from "../src/localAgeLevel.ts";
import type { Theme } from "../src/theme.ts";
import {
  AWAY,
  board,
  dragTo,
  fit,
  fittedPieces,
  hints,
  homeOf,
  openPuzzle,
  openSkeletonsApp,
  press,
  release,
  reveal,
  revealNow,
  savedSkeletons,
  skeletonOf,
  slots,
  spotOf,
  spotPieces,
  tray,
  trayPieces
} from "./skeletonsApp.tsx";
import { fakeSkeletonPicture, PALETTE, memoryStorage, sameColour, type ManualPictures } from "./support.ts";

// skeleton-assembly-paleontologist.feature: Paleontologist's own cut on a
// partial outline, with other dinosaurs' bones in the tray.

const levelOf = (level: AgeLevel) => memoryStorage({ [AGE_LEVEL_KEY]: JSON.stringify({ level, revision: `picked-${level}` }) });

const openPaleontologist = (name: string, appearance: Theme = "light", storage = memoryStorage()) => openPuzzle(name, { ageLevels: levelOf("paleontologist"), appearance, storage });

const counter = () => screen.getByLabelText(TEXTS.en.fitted).textContent;

// The tray's other dinosaurs' bones, by their id there.
const strays = () => spotPieces().filter((piece) => piece.includes("/"));

const told = () => screen.queryByRole("status")?.textContent;

const silhouette = () => board().querySelector<HTMLElement>(".skeleton-outline-silhouette");

// How the silhouette shows: its picture's look, and the picture it is
// masked from, none until loaded.
const silhouetteLook = () => [silhouette()?.getAttribute("data-picture"), silhouette()?.style.getPropertyValue("--outline-picture")];

function spend(pictures: ManualPictures, seconds: number) {
  for (let second = 0; second < seconds; second++) act(() => pictures.fire(1000));
}

describe("Paleontologist's puzzle", () => {
  it.each([
    ["TYRANNOSAURUS", "tyrannosaurus", 11, ["triceratops/frill", "stegosaurus/spikes", "stegosaurus/front-plates"]],
    ["TRICERATOPS", "triceratops", 10, ["tyrannosaurus/head", "stegosaurus/back-plates", "spinosaurus/back-sail"]],
    ["STEGOSAURUS", "stegosaurus", 10, ["tyrannosaurus/head", "triceratops/frill", "tyrannosaurus/arms"]],
    ["BRACHIOSAURUS", "brachiosaurus", 10, ["tyrannosaurus/head", "spinosaurus/front-sail", "stegosaurus/spikes"]],
    ["SPINOSAURUS", "spinosaurus", 10, ["triceratops/frill", "brachiosaurus/upper-neck", "stegosaurus/spikes"]]
  ] as const)("is %s's own cut, with other dinosaurs' bones spread among its pieces in the tray", async (name, id, count, others) => {
    await openPaleontologist(name);

    const cut = (skeletonOf(id).cuts.paleontologist ?? []).map((piece) => piece.id);
    expect(cut).toHaveLength(count);
    expect(slots().map(([piece]) => piece)).toEqual(cut);
    expect(spotPieces().filter((piece) => !piece.includes("/"))).toEqual(cut);
    expect(strays()).toEqual(others);
    expect([spotPieces()[0], spotPieces().at(-1)]).toEqual([cut[0], cut.at(-1)]);
    expect(tray().getAttribute("data-columns")).toBe("2");
    expect(counter()).toBe(`0/${count}`);
  });

  it("names each other dinosaur's bone in the tray with its dinosaur", async () => {
    await openPaleontologist("TYRANNOSAURUS");

    expect(trayPieces().filter((name) => name?.includes(" "))).toEqual(expect.arrayContaining(["TRICERATOPS FRILL", "STEGOSAURUS TAIL SPIKES", "STEGOSAURUS PLATES"]));
  });

  it.each<Theme>(["light", "dark"])("draws its outline as the skeleton's silhouette alone, in the %s theme's outline colour, no bone in it", async (theme) => {
    await openPaleontologist("STEGOSAURUS", theme);

    expect(silhouette()?.style.getPropertyValue("--outline-picture")).toBe('url("/skeletons/stegosaurus/skeleton.webp")');
    expect(sameColour(getComputedStyle(silhouette() ?? board()).backgroundColor, PALETTE[theme]["ink-soft"] ?? "")).toBe(true);
    expect(board().querySelector(".skeleton-outline")?.getAttribute("data-silhouette")).toBe("true");
    expect(board().querySelectorAll(".skeleton-outline img")).toHaveLength(0);
  });

  it("shimmers its silhouette while its picture loads, then fades it in, however late", async () => {
    const { user, pictures } = openSkeletonsApp({ ageLevels: levelOf("paleontologist") });
    await user.click(screen.getByRole("button", { name: "STEGOSAURUS" }));
    const outline = fakeSkeletonPicture("stegosaurus", "skeleton");

    expect([...silhouetteLook(), silhouette()?.classList.contains("picture")]).toEqual(["loading", "", true]);
    act(() => pictures.fire(PICTURE_LIMIT));
    expect(silhouetteLook()).toEqual(["failed", ""]);

    act(() => pictures.finish(outline));
    expect(silhouetteLook()).toEqual(["appearing", `url("${outline}")`]);
  });

  it("shows the failure look on its silhouette when its picture fails", async () => {
    const { user, pictures } = openSkeletonsApp({ ageLevels: levelOf("paleontologist") });
    await user.click(screen.getByRole("button", { name: "STEGOSAURUS" }));

    act(() => pictures.fail(fakeSkeletonPicture("stegosaurus", "skeleton")));

    expect(silhouetteLook()).toEqual(["failed", ""]);
  });

  it("floats another dinosaur's bone dropped on the outline back to its spot, saying whose it is, nothing fitted", async () => {
    await openPaleontologist("TYRANNOSAURUS");
    const tyrannosaurus = skeletonOf("tyrannosaurus");
    expect(told()).toBe("");

    dragTo("triceratops/frill", homeOf(tyrannosaurus, "head"));

    expect(told()).toBe("THAT'S THE TRICERATOPS FRILL!");
    expect(fittedPieces()).toEqual([]);
    expect(spotOf("triceratops/frill").querySelector(".skeleton-piece[data-returning]")).not.toBeNull();
    expect(counter()).toBe("0/11");
  });

  it("says whose bone it is in Russian too", async () => {
    await openPuzzle("ТИРАННОЗАВР", { ageLevels: levelOf("paleontologist"), deviceLanguage: "ru-RU" });

    dragTo("stegosaurus/spikes", AWAY);

    expect(told()).toBe("ЭТО ШИПЫ СТЕГОЗАВРА!");
  });

  it("clears the line the moment another piece is touched, still held, and keeps it while the same bone is touched again", async () => {
    await openPaleontologist("TYRANNOSAURUS");
    const pressOn = (piece: string) => {
      const { left, top } = spotOf(piece).getBoundingClientRect();
      press(spotOf(piece), { clientX: left + 40, clientY: top + 40 });
    };

    dragTo("triceratops/frill", AWAY);
    pressOn("triceratops/frill");
    expect(told()).toBe("THAT'S THE TRICERATOPS FRILL!");
    release(AWAY);

    pressOn("arms");
    expect([told(), fittedPieces()]).toEqual(["", []]);
  });

  it("clears the line with the next drop, a fit or a miss alike", async () => {
    await openPaleontologist("TYRANNOSAURUS");
    const tyrannosaurus = skeletonOf("tyrannosaurus");

    dragTo("triceratops/frill", AWAY);
    fit(tyrannosaurus, "head");
    expect([told(), fittedPieces()]).toEqual(["", ["head"]]);

    dragTo("stegosaurus/spikes", AWAY);
    dragTo("arms", AWAY);
    expect(told()).toBe("");
  });

  it("counts help again from nothing as another dinosaur's bone is touched, then helps the first piece in the tray", async () => {
    const { pictures } = await openPaleontologist("TYRANNOSAURUS");

    spend(pictures, 9);
    dragTo("triceratops/frill", homeOf(skeletonOf("tyrannosaurus"), "head"));
    spend(pictures, 1);
    expect(hints()).toEqual([]);
    spend(pictures, 9);

    expect(hints()).toEqual(["spot head"]);
    expect(board().querySelector(".skeleton-region")).not.toBeNull();
  });

  it("is complete once its own pieces fit, the other dinosaurs' bones leaving the tray, and earns the star", async () => {
    const storage = memoryStorage();
    const { pictures } = await openPaleontologist("TRICERATOPS", "light", storage);
    const triceratops = skeletonOf("triceratops");
    const [last = "", ...others] = [...(triceratops.cuts.paleontologist ?? [])].map(({ id }) => id).reverse();
    dragTo("tyrannosaurus/head", AWAY);
    for (const piece of others.reverse()) fit(triceratops, piece);
    expect([counter(), strays()]).toEqual(["9/10", ["tyrannosaurus/head", "stegosaurus/back-plates", "spinosaurus/back-sail"]]);

    fit(triceratops, last);
    expect([counter(), strays()]).toEqual(["10/10", []]);
    revealNow(pictures, "triceratops");

    expect(reveal()).not.toBeNull();
    expect(savedSkeletons(storage)).toEqual({ earned: ["triceratops"], bestScore: 1, rebuilding: [], badges: { triceratops: ["paleontologist"] } });
  });
});

describe("the other levels", () => {
  it.each<[AgeLevel, number, string | null]>([
    ["hatchling", 4, null],
    ["explorer", 6, "2"]
  ])("keep %s's faint outline of bones and a tray of its own %i pieces only, in two columns from five", async (level, count, columns) => {
    await openPuzzle("TRICERATOPS", { ageLevels: levelOf(level) });

    expect([silhouette(), board().querySelector(".skeleton-outline img")?.getAttribute("src")]).toEqual([null, "/skeletons/triceratops/skeleton.webp"]);
    expect([spotPieces().length, strays(), tray().getAttribute("data-columns"), screen.queryByRole("status")]).toEqual([count, [], columns, null]);
  });
});
