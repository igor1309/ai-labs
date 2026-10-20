import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AgeLevel } from "../src/ageLevel.ts";
import { AGE_LEVEL_KEY } from "../src/localAgeLevel.ts";
import { shuffled } from "../src/skeletons/shuffled.ts";
import { finishLoading, hints, layOutPuzzle, moveTo, openSkeletonsApp, press, skeletonOf, slotOf, spotOf, spotPieces, tray } from "./skeletonsApp.tsx";
import { memoryStorage, type ManualPictures } from "./support.ts";

// skeleton-assembly-tray.feature: the tray's order at each level, the
// held piece's home outlined at Hatchling alone, and a long press that
// keeps its piece.

const levelOf = (level: AgeLevel) => memoryStorage({ [AGE_LEVEL_KEY]: JSON.stringify({ level, revision: `picked-${level}` }) });

// Opens `name`'s puzzle at `level`, the game drawing from `draws`, every
// draw after them 0.
async function openDrawn(name: string, level: AgeLevel, draws: readonly number[] = []) {
  const left: number[] = [];
  const opened = openSkeletonsApp({ ageLevels: levelOf(level), random: () => left.shift() ?? 0 });
  left.push(...draws);
  await opened.user.click(screen.getByRole("button", { name }));
  act(() => finishLoading(opened.pictures));
  layOutPuzzle();
  return opened;
}

function spend(pictures: ManualPictures, seconds: number) {
  for (let second = 0; second < seconds; second++) act(() => pictures.fire(1000));
}

// A piece picked up from its spot in the tray and moved off it, still
// held.
function pickUp(piece: string) {
  const { left, top } = spotOf(piece).getBoundingClientRect();
  press(spotOf(piece), { clientX: left + 40, clientY: top + 40 });
  moveTo({ clientX: 500, clientY: 300 });
}

const APP_CSS = readFileSync(join(import.meta.dirname, "../src/app.css"), "utf8");

const cutOf = (id: string, level: AgeLevel) => (skeletonOf(id).cuts[level] ?? []).map(({ id: piece }) => piece);

describe("the tray's order", () => {
  it("is shuffled at Explorer as drawn, and help points at the first piece in it", async () => {
    // The first draw swaps the head with the tail, the second the neck
    // with the left leg.
    const { pictures } = await openDrawn("TYRANNOSAURUS", "explorer", [0.99, 0.5]);

    expect(spotPieces()).toEqual(["tail-bones", "left-leg", "back", "hips", "neck", "right-leg", "head"]);
    spend(pictures, 10);
    expect(hints()).toEqual(["spot tail-bones"]);
  });

  it("is shuffled at Paleontologist after each piece's turn is drawn, other dinosaurs' bones still spread among the pieces", async () => {
    // Ten draws turn the beak a quarter and nothing else; the next swaps
    // the beak with the tail.
    await openDrawn("TRICERATOPS", "paleontologist", [0.7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.99]);

    expect(spotPieces()).toEqual([
      "tail-bones",
      "horns",
      "frill",
      "tyrannosaurus/head",
      "ribs",
      "backbone",
      "stegosaurus/back-plates",
      "left-front-leg",
      "right-front-leg",
      "left-hind-leg",
      "spinosaurus/back-sail",
      "right-hind-leg",
      "beak"
    ]);
    expect(spotOf("beak").querySelector<HTMLElement>(".skeleton-piece")?.style.rotate).toBe("90deg");
  });

  it("keeps Hatchling's cut order, whatever the draw", async () => {
    await openDrawn("STEGOSAURUS", "hatchling", Array.from({ length: 12 }, () => 0.99));

    expect(spotPieces()).toEqual(cutOf("stegosaurus", "hatchling"));
  });

  it("reaches every order of three, each piece once, by its draws", () => {
    const drawing = (draws: number[]) => () => draws.shift() ?? 0;
    const orders = [0, 0.4, 0.8].flatMap((first) => [0, 0.9].map((second) => shuffled(["a", "b", "c"], drawing([first, second])).join("")));
    expect(orders.sort()).toEqual(["abc", "acb", "bac", "bca", "cab", "cba"]);
  });
});

describe("a held piece's home", () => {
  it("is outlined at Hatchling", async () => {
    await openDrawn("TYRANNOSAURUS", "hatchling");

    pickUp("spine");

    expect(slotOf("spine").hasAttribute("data-target")).toBe(true);
  });

  it.each<[AgeLevel, string]>([
    ["explorer", "neck"],
    ["paleontologist", "arms"]
  ])("is not outlined at %s, the child finding it alone", async (level, piece) => {
    await openDrawn("TYRANNOSAURUS", level);

    pickUp(piece);

    expect(document.querySelector(".skeleton-lifted")).not.toBeNull();
    expect(tray().querySelector("[data-held]")?.closest("[data-piece]")?.getAttribute("data-piece")).toBe(piece);
    expect(document.querySelectorAll("[data-target]")).toHaveLength(0);
  });
});

// A rule of app.css as written: jsdom's parser drops properties it does
// not know, as Safari's -webkit-touch-callout.
const ruleOf = (selector: string) => APP_CSS.match(new RegExp(`^${selector.replace(".", "\\.")} \\{([^}]*)\\}`, "m"))?.[1] ?? "";

describe("a long press on the puzzle", () => {
  it("opens no menu, selects nothing and offers no picture to share, so the touch keeps its piece", async () => {
    await openDrawn("TYRANNOSAURUS", "paleontologist");
    const screenOf = document.querySelector(".skeleton-screen") ?? document.body;
    const picture = spotOf("head").querySelector("img") ?? document.body;

    expect(fireEvent.contextMenu(picture)).toBe(false);
    expect([screenOf, picture].map((element) => getComputedStyle(element).getPropertyValue("-webkit-user-select"))).toEqual(["none", "none"]);
    expect(["img", ".skeleton-screen"].map((selector) => ruleOf(selector).includes("-webkit-touch-callout: none;"))).toEqual([true, true]);
  });
});
