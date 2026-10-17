import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import records from "../src/data/dinosaurs.json";
import skeletonPlaces from "../src/data/skeletons.json";
import { skeletonPictures } from "../src/dinosaurPictures.ts";
import { readSkeletons, type SkeletonsFile } from "../src/dinosaurs.ts";
import { presentPuzzle, presentSkeletonChoices } from "../src/presentation.ts";
import { appProps } from "../src/root.ts";
import { HELP_AFTER, PIECES, startPuzzle, type Skeleton } from "../src/skeletons/index.ts";
import { SHIPPED_SKELETONS, browserDocument, browserQueries, fakeBodyPicture, fakeSkeletonPicture, memoryStorage, pictureBrowser, readWebp } from "./support.ts";

const ROOT = resolve(import.meta.dirname, "..");

const NAMES = [
  { id: "tyrannosaurus", name: { en: "Tyrannosaurus", ru: "Тираннозавр" } },
  { id: "triceratops", name: { en: "Triceratops", ru: "Трицератопс" } }
];

const place = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

const PLACES = { skull: place(0, 0, 100, 80), spine: place(80, 10, 300, 200), legs: place(90, 150, 300, 250), tail: place(380, 120, 20, 60) };

const file = (dinosaurs: SkeletonsFile["dinosaurs"]): SkeletonsFile => ({ frame: { width: 400, height: 400 }, dinosaurs });

describe("readSkeletons", () => {
  it("names each skeleton as its dinosaur is named, in the file's order, with its frame and pieces' places", () => {
    expect(readSkeletons(NAMES, file({ triceratops: PLACES, tyrannosaurus: { ...PLACES, tail: place(0, 300, 400, 100) } }))).toEqual([
      { id: "triceratops", name: { en: "Triceratops", ru: "Трицератопс" }, frame: { width: 400, height: 400 }, places: PLACES },
      {
        id: "tyrannosaurus",
        name: { en: "Tyrannosaurus", ru: "Тираннозавр" },
        frame: { width: 400, height: 400 },
        places: { ...PLACES, tail: place(0, 300, 400, 100) }
      }
    ]);
  });

  it("fails when it is made on a skeleton of no dinosaur in the list", () => {
    expect(() => readSkeletons(NAMES, file({ stegosaurus: PLACES }))).toThrow("The skeleton stegosaurus is of no dinosaur in the list");
  });

  it.each<[string, unknown, string]>([
    ["missing", undefined, "triceratops has no legs in its 400×400 frame: undefined"],
    ["not a place", "under the spine", 'triceratops has no legs in its 400×400 frame: "under the spine"'],
    ["of no size", place(10, 10, 0, 50), "triceratops has no legs in its 400×400 frame"],
    ["before the frame", place(-1, 10, 50, 50), "triceratops has no legs in its 400×400 frame"],
    ["past its right edge", place(351, 10, 50, 50), "triceratops has no legs in its 400×400 frame"],
    ["past its bottom edge", place(10, 351, 50, 50), "triceratops has no legs in its 400×400 frame"],
    ["of a size in words", { x: 0, y: 0, width: "wide", height: 50 }, "triceratops has no legs in its 400×400 frame"]
  ])("fails when it is made on a piece %s", (_, legs, message) => {
    expect(() => readSkeletons(NAMES, file({ triceratops: { ...PLACES, legs } }))).toThrow(message);
  });

  it("reads every shipped skeleton, Tyrannosaurus, Triceratops and Stegosaurus, each with all four pieces in its frame", () => {
    const shipped = readSkeletons(records, skeletonPlaces);

    expect(shipped.map(({ id, name }) => [id, name.en])).toEqual([
      ["tyrannosaurus", "Tyrannosaurus"],
      ["triceratops", "Triceratops"],
      ["stegosaurus", "Stegosaurus"]
    ]);
    expect(shipped.map(({ frame, places }) => [frame, Object.keys(places)])).toEqual(shipped.map(() => [{ width: 800, height: 600 }, [...PIECES]]));
  });
});

describe("skeletonPictures", () => {
  const PARTS = ["skeleton", "skull"] as const;

  it("finds each part's picture by the folder named for its dinosaur's id and the file named for the part", () => {
    const pictureOf = skeletonPictures(
      {
        "./assets/skeletons/triceratops/skeleton.webp": "/assets/skeleton-a1.webp",
        "./assets/skeletons/triceratops/skull.webp": "/assets/skull-b2.webp"
      },
      ["triceratops"],
      PARTS
    );

    expect([pictureOf("triceratops", "skeleton"), pictureOf("triceratops", "skull")]).toEqual(["/assets/skeleton-a1.webp", "/assets/skull-b2.webp"]);
    expect(() => pictureOf("stegosaurus", "skull")).toThrow("No skeleton picture for stegosaurus/skull");
  });

  it("fails when it is made, naming every part with no picture", () => {
    const files = {
      "./assets/skeletons/triceratops/skeleton.webp": "/assets/skeleton-a1.webp",
      "./assets/skeletons/triceratops/skull.png": "/assets/skull-b2.png",
      "./assets/dinos/stegosaurus/skull.webp": "/assets/skull-c3.webp"
    };

    expect(() => skeletonPictures(files, ["triceratops", "stegosaurus"], PARTS)).toThrow(
      "No skeleton picture for triceratops/skull, stegosaurus/skeleton, stegosaurus/skull"
    );
  });
});

const skeletonOf = (id: string): Skeleton => {
  const found = SHIPPED_SKELETONS.find((each) => each.id === id);
  if (!found) throw new Error(`No ${id} skeleton is shipped`);
  return found;
};

describe("presenting the skeleton game", () => {
  it("shows each dinosaur to build by its body picture and name in the language, in the given order", () => {
    expect(presentSkeletonChoices(SHIPPED_SKELETONS, "ru", fakeBodyPicture)).toEqual([
      { id: "tyrannosaurus", name: "Тираннозавр", picture: fakeBodyPicture("tyrannosaurus") },
      { id: "triceratops", name: "Трицератопс", picture: fakeBodyPicture("triceratops") },
      { id: "stegosaurus", name: "Стегозавр", picture: fakeBodyPicture("stegosaurus") }
    ]);
  });

  it("shows a new puzzle as its outline and four empty slots, each placed as a fraction of the frame", () => {
    const { frame, places } = skeletonOf("triceratops");

    expect(presentPuzzle(startPuzzle(skeletonOf("triceratops")), "en", fakeSkeletonPicture)).toEqual({
      name: "Triceratops",
      outline: fakeSkeletonPicture("triceratops", "skeleton"),
      frame,
      slots: PIECES.map((piece) => ({
        piece,
        picture: fakeSkeletonPicture("triceratops", piece),
        left: places[piece].x / frame.width,
        top: places[piece].y / frame.height,
        width: places[piece].width / frame.width,
        height: places[piece].height / frame.height,
        fitted: false
      })),
      hint: undefined,
      complete: false
    });
  });

  it("points help at the first piece in the tray still to fit, once help is due, and at none before", () => {
    const due = { ...startPuzzle(skeletonOf("tyrannosaurus")), fitted: ["skull", "legs"] as const, waited: HELP_AFTER };

    expect([presentPuzzle(due, "en", fakeSkeletonPicture).hint, presentPuzzle({ ...due, waited: HELP_AFTER - 1 }, "en", fakeSkeletonPicture).hint]).toEqual([
      "spine",
      undefined
    ]);
  });

  it("reports the skeleton complete once every piece is fitted, and not before", () => {
    const puzzle = { ...startPuzzle(skeletonOf("stegosaurus")), fitted: ["tail", "skull", "legs"] as const };

    expect([presentPuzzle(puzzle, "en", fakeSkeletonPicture).complete, presentPuzzle({ ...puzzle, fitted: [...puzzle.fitted, "spine"] }, "en", fakeSkeletonPicture).complete]).toEqual([
      false,
      true
    ]);
  });

  it("marks the slots of fitted pieces, and only those", () => {
    const puzzle = { ...startPuzzle(skeletonOf("stegosaurus")), fitted: ["tail", "skull"] as const };

    expect(presentPuzzle(puzzle, "en", fakeSkeletonPicture).slots.map(({ piece, fitted }) => [piece, fitted])).toEqual([
      ["skull", true],
      ["spine", false],
      ["legs", false],
      ["tail", true]
    ]);
  });
});

// The shipped pictures as the app is given them in a browser.
function shippedApp() {
  return appProps({ localStorage: memoryStorage(), matchMedia: browserQueries().matchMedia, navigator: { language: "en-GB" }, document: browserDocument().document, ...pictureBrowser() });
}

// The file under rexlab/ a picture URL is served from while testing.
const fileOf = (url: string) => join(ROOT, url.replace(/\?.*$/, ""));

describe("every shipped skeleton", () => {
  const { skeletons, skeletonPicture } = shippedApp();

  it("is given to the app, each with its outline and pieces from its own folder", () => {
    expect(skeletons).toEqual(SHIPPED_SKELETONS);
    for (const { id } of skeletons) {
      for (const part of ["skeleton", ...PIECES] as const) {
        expect(fileOf(skeletonPicture(id, part))).toBe(join(ROOT, "src/assets/skeletons", id, `${part}.webp`));
      }
    }
  });

  it("has an outline as big as its frame and each piece as big as its place, all with alpha", () => {
    const sizes = skeletons.map(({ id }) => [
      readWebp(readFileSync(fileOf(skeletonPicture(id, "skeleton")))),
      ...PIECES.map((piece) => readWebp(readFileSync(fileOf(skeletonPicture(id, piece)))))
    ]);

    expect(sizes).toEqual(
      skeletons.map(({ frame, places }) => [
        { ...frame, alpha: true },
        ...PIECES.map((piece) => ({ width: places[piece].width, height: places[piece].height, alpha: true }))
      ])
    );
  });
});
