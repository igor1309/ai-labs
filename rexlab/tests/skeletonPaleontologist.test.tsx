import { act, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AgeLevel } from "../src/ageLevel.ts";
import { TEXTS } from "../src/language/texts.ts";
import { AGE_LEVEL_KEY } from "../src/localAgeLevel.ts";
import type { Theme } from "../src/theme.ts";
import { AWAY, board, dragTo, fit, fittedPieces, hints, homeOf, openPuzzle, reveal, revealNow, savedSkeletons, skeletonOf, slots, spotOf, spotPieces, tray, trayPieces } from "./skeletonsApp.tsx";
import { PALETTE, memoryStorage, sameColour, type ManualPictures } from "./support.ts";

// skeleton-assembly-paleontologist.feature: Paleontologist's own cut on a
// partial outline, with other dinosaurs' bones in the tray.

const levelOf = (level: AgeLevel) => memoryStorage({ [AGE_LEVEL_KEY]: JSON.stringify({ level, revision: `picked-${level}` }) });

const openPaleontologist = (name: string, appearance: Theme = "light", storage = memoryStorage()) => openPuzzle(name, { ageLevels: levelOf("paleontologist"), appearance, storage });

const counter = () => screen.getByLabelText(TEXTS.en.fitted).textContent;

// The tray's other dinosaurs' bones, by their id there.
const strays = () => spotPieces().filter((piece) => piece.includes("/"));

const told = () => screen.queryByRole("status")?.textContent;

const silhouette = () => board().querySelector<HTMLElement>(".skeleton-silhouette");

function spend(pictures: ManualPictures, seconds: number) {
  for (let second = 0; second < seconds; second++) act(() => pictures.fire(1000));
}

describe("Paleontologist's puzzle", () => {
  it.each([
    ["TYRANNOSAURUS", "tyrannosaurus", 11, ["triceratops/frill", "stegosaurus/spikes", "stegosaurus/front-plates"]],
    ["TRICERATOPS", "triceratops", 10, ["tyrannosaurus/skull", "stegosaurus/back-plates"]],
    ["STEGOSAURUS", "stegosaurus", 10, ["tyrannosaurus/skull", "triceratops/frill", "tyrannosaurus/arms"]]
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

  it("floats another dinosaur's bone dropped on the outline back to its spot, saying whose it is, nothing fitted", async () => {
    await openPaleontologist("TYRANNOSAURUS");
    const tyrannosaurus = skeletonOf("tyrannosaurus");
    expect(told()).toBe("");

    dragTo("triceratops/frill", homeOf(tyrannosaurus, "skull"));

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

  it("clears the line with the next drop, a fit or a miss alike", async () => {
    await openPaleontologist("TYRANNOSAURUS");
    const tyrannosaurus = skeletonOf("tyrannosaurus");

    dragTo("triceratops/frill", AWAY);
    fit(tyrannosaurus, "skull");
    expect([told(), fittedPieces()]).toEqual(["", ["skull"]]);

    dragTo("stegosaurus/spikes", AWAY);
    dragTo("arms", AWAY);
    expect(told()).toBe("");
  });

  it("never puts help off with another dinosaur's bone", async () => {
    const { pictures } = await openPaleontologist("TYRANNOSAURUS");

    spend(pictures, 9);
    dragTo("triceratops/frill", homeOf(skeletonOf("tyrannosaurus"), "skull"));
    spend(pictures, 1);

    expect(hints()).toEqual(["spot skull"]);
    expect(board().querySelector(".skeleton-region")).not.toBeNull();
  });

  it("is complete once its own pieces fit, the other dinosaurs' bones leaving the tray, and earns the star", async () => {
    const storage = memoryStorage();
    const { pictures } = await openPaleontologist("TRICERATOPS", "light", storage);
    const triceratops = skeletonOf("triceratops");
    const [last = "", ...others] = [...(triceratops.cuts.paleontologist ?? [])].map(({ id }) => id).reverse();
    dragTo("tyrannosaurus/skull", AWAY);
    for (const piece of others.reverse()) fit(triceratops, piece);
    expect([counter(), strays()]).toEqual(["9/10", ["tyrannosaurus/skull", "stegosaurus/back-plates"]]);

    fit(triceratops, last);
    expect([counter(), strays()]).toEqual(["10/10", []]);
    revealNow(pictures, "triceratops");

    expect(reveal()).not.toBeNull();
    expect(savedSkeletons(storage)).toEqual({ earned: ["triceratops"], bestScore: 1, rebuilding: [] });
  });
});

describe("the other levels", () => {
  it.each<[AgeLevel, number]>([
    ["hatchling", 4],
    ["explorer", 6]
  ])("keep %s's faint outline of bones and a tray of its own %i pieces only", async (level, count) => {
    await openPuzzle("TRICERATOPS", { ageLevels: levelOf(level) });

    expect([silhouette(), board().querySelector(".skeleton-outline img")?.getAttribute("src")]).toEqual([null, "/skeletons/triceratops/skeleton.webp"]);
    expect([spotPieces().length, strays(), tray().hasAttribute("data-columns"), screen.queryByRole("status")]).toEqual([count, [], false, null]);
  });
});
