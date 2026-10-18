import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import records from "../src/data/dinosaurs.json";
import skeletonPlaces from "../src/data/skeletons.json";
import { skeletonPictures } from "../src/dinosaurPictures.ts";
import { readSkeletons, type SkeletonsFile } from "../src/dinosaurs.ts";
import { presentPuzzle, presentSkeletonChoices, presentSkeletonResult } from "../src/presentation.ts";
import { appProps } from "../src/root.ts";
import { HELP_AFTER, PIECES, startPuzzle, type Skeleton, type SkeletonResult } from "../src/skeletons/index.ts";
import { SHIPPED_SKELETONS, browserDocument, browserQueries, fakeBodyPicture, fakeSkeletonPicture, memoryStorage, pictureBrowser, readWebp } from "./support.ts";

const ROOT = resolve(import.meta.dirname, "..");

const NAMES = [
  { id: "tyrannosaurus", name: { en: "Tyrannosaurus", ru: "Тираннозавр" } },
  { id: "triceratops", name: { en: "Triceratops", ru: "Трицератопс" } }
];

const place = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

const PLACES = { skull: place(0, 0, 100, 80), spine: place(80, 10, 300, 200), legs: place(90, 150, 300, 250), tail: place(380, 120, 20, 60) };

const FACT = { en: "TRICERATOPS HAD THREE HORNS.", ru: "У ТРИЦЕРАТОПСА БЫЛО ТРИ РОГА." };

const ENTRY = { fact: FACT, ...PLACES };

const file = (dinosaurs: SkeletonsFile["dinosaurs"]): SkeletonsFile => ({ frame: { width: 400, height: 400 }, dinosaurs });

describe("readSkeletons", () => {
  it("names each skeleton as its dinosaur is named, in the file's order, with its fact, frame and pieces' places", () => {
    const tyrannosaurus = { en: "T. REX HAD TINY ARMS.", ru: "У ТИРАННОЗАВРА БЫЛИ КРОШЕЧНЫЕ ЛАПЫ." };

    expect(readSkeletons(NAMES, file({ triceratops: ENTRY, tyrannosaurus: { ...ENTRY, fact: tyrannosaurus, tail: place(0, 300, 400, 100) } }))).toEqual([
      { id: "triceratops", name: { en: "Triceratops", ru: "Трицератопс" }, fact: FACT, frame: { width: 400, height: 400 }, places: PLACES },
      {
        id: "tyrannosaurus",
        name: { en: "Tyrannosaurus", ru: "Тираннозавр" },
        fact: tyrannosaurus,
        frame: { width: 400, height: 400 },
        places: { ...PLACES, tail: place(0, 300, 400, 100) }
      }
    ]);
  });

  it("fails when it is made on a skeleton of no dinosaur in the list", () => {
    expect(() => readSkeletons(NAMES, file({ stegosaurus: ENTRY }))).toThrow("The skeleton stegosaurus is of no dinosaur in the list");
  });

  it.each<[string, unknown]>([
    ["missing", undefined],
    ["in one language only", { en: FACT.en }],
    ["empty in a language", { ...FACT, ru: " " }],
    ["not words in a language", { ...FACT, en: 3 }],
    ["not a fact in each language", FACT.en]
  ])("fails when it is made on a fact %s", (_, fact) => {
    expect(() => readSkeletons(NAMES, file({ triceratops: { ...ENTRY, fact } }))).toThrow(`triceratops has no fact in every language: ${JSON.stringify(fact)}`);
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
    expect(() => readSkeletons(NAMES, file({ triceratops: { ...ENTRY, legs } }))).toThrow(message);
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

  // skeleton-assembly-fact.feature
  it("gives each shipped skeleton its one short fact, in capitals in both languages", () => {
    const shipped = readSkeletons(records, skeletonPlaces);

    expect(shipped.map(({ fact }) => fact.en)).toEqual([
      "T. REX HAD TINY ARMS BUT HUGE LEGS.",
      "TRICERATOPS HAD THREE HORNS AND A BONY FRILL.",
      "STEGOSAURUS HAD LARGE PLATES ALONG ITS BACK."
    ]);
    expect(shipped.flatMap(({ fact }) => [fact.en, fact.ru]).filter((each) => each !== each.toLocaleUpperCase() || !each.endsWith("."))).toEqual([]);
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
  it("shows each dinosaur to build by its body picture and name in the language, in the given order, starred once earned", () => {
    expect(presentSkeletonChoices(SHIPPED_SKELETONS, "ru", fakeBodyPicture, ["allosaurus", "stegosaurus"])).toEqual([
      { id: "tyrannosaurus", name: "Тираннозавр", picture: fakeBodyPicture("tyrannosaurus"), earned: false },
      { id: "triceratops", name: "Трицератопс", picture: fakeBodyPicture("triceratops"), earned: false },
      { id: "stegosaurus", name: "Стегозавр", picture: fakeBodyPicture("stegosaurus"), earned: true }
    ]);
  });

  const result = (overrides: Partial<SkeletonResult> = {}): SkeletonResult => ({
    skeleton: skeletonOf("triceratops"),
    score: 2,
    total: 3,
    best: 2,
    previousBest: 1,
    celebration: "new-best",
    newStar: true,
    ...overrides
  });

  it("reveals a finished skeleton as its dinosaur's body over the whole skeleton in their frame, with its name, fact and collection", () => {
    expect(presentSkeletonResult(result(), "ru", fakeSkeletonPicture, fakeBodyPicture)).toEqual({
      name: "Трицератопс",
      fact: skeletonOf("triceratops").fact.ru,
      skeleton: fakeSkeletonPicture("triceratops", "skeleton"),
      body: fakeBodyPicture("triceratops"),
      frame: { width: 800, height: 600 },
      score: 2,
      total: 3,
      best: 2,
      beaten: 1,
      celebration: "new-best",
      newStar: true
    });
  });

  it.each<[string, Partial<SkeletonResult>, unknown]>([
    ["a first best, which beat none", { score: 1, best: 1, previousBest: undefined, celebration: "first-best" }, { best: 1, beaten: undefined, celebration: "first-best" }],
    ["a rebuild, which beats nothing", { previousBest: 2, celebration: null, newStar: false }, { best: 2, beaten: undefined, celebration: null }],
    ["progress that cannot be read", { best: undefined, previousBest: undefined, celebration: null }, { best: undefined, beaten: undefined, celebration: null }]
  ])("shows the best it beat only for a new best: %s", (_, overrides, shown) => {
    const { best, beaten, celebration } = presentSkeletonResult(result(overrides), "en", fakeSkeletonPicture, fakeBodyPicture);

    expect({ best, beaten, celebration }).toEqual(shown);
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

  // The places are checked against the pictures themselves, not the file
  // the app reads them from: a piece a pixel off in x or y already strays
  // past the tolerance.
  it("is rebuilt by its four pieces drawn at their places, each a pixel off showing", async () => {
    const SHIFTS = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ] as const;
    const measured = await Promise.all(
      skeletons.map(async ({ id, places }) => {
        const whole = await alphaOf(fileOf(skeletonPicture(id, "skeleton")));
        const pieces = await Promise.all(PIECES.map(async (piece) => ({ ...places[piece], ...(await alphaOf(fileOf(skeletonPicture(id, piece)))) })));
        return {
          id,
          rebuilt: unmatched(whole, pieces) <= TOLERANCE,
          inPlace: pieces.map((piece) => stray(whole, piece) <= TOLERANCE),
          offByAPixel: pieces.map((piece) => SHIFTS.every(([dx, dy]) => stray(whole, { ...piece, x: piece.x + dx, y: piece.y + dy }) > TOLERANCE))
        };
      })
    );

    expect(measured).toEqual(skeletons.map(({ id }) => ({ id, rebuilt: true, inPlace: PIECES.map(() => true), offByAPixel: PIECES.map(() => true) })));
  });

  it("shares its frame with its dinosaur's body picture, so the body fades in exactly over its bones", () => {
    const { bodyPicture } = shippedApp();
    const sizes = skeletons.map(({ id }) => {
      const { width, height } = readWebp(readFileSync(fileOf(bodyPicture(id))));
      return { width, height };
    });

    expect(sizes).toEqual(skeletons.map(({ frame }) => frame));
  });
});

// How much of a picture's alpha may differ from where it belongs, as a
// share of it, for the edges of pictures cut and encoded apart.
const TOLERANCE = 0.005;

type Alpha = { alpha: Uint8Array; width: number; height: number };

// A picture's alpha channel, row by row, from 0 to 255.
async function alphaOf(file: string): Promise<Alpha> {
  const { data, info } = await sharp(file).extractChannel("alpha").raw().toBuffer({ resolveWithObject: true });
  return { alpha: data, width: info.width, height: info.height };
}

// The alpha of `whole` at a point, none outside it.
const alphaAt = ({ alpha, width, height }: Alpha, x: number, y: number) => (x < 0 || y < 0 || x >= width || y >= height ? 0 : (alpha[y * width + x] ?? 0));

// The share of a piece's alpha, drawn at x and y, that falls where the
// whole skeleton has none.
function stray(whole: Alpha, piece: Alpha & { x: number; y: number }) {
  let outside = 0;
  let total = 0;
  for (let row = 0; row < piece.height; row++) {
    for (let column = 0; column < piece.width; column++) {
      const own = piece.alpha[row * piece.width + column] ?? 0;
      total += own;
      outside += Math.max(0, own - alphaAt(whole, piece.x + column, piece.y + row));
    }
  }
  return outside / total;
}

// The share of the whole skeleton's alpha that the pieces, each drawn
// over the others at its place, do not reproduce.
function unmatched(whole: Alpha, pieces: (Alpha & { x: number; y: number })[]) {
  const drawn = new Float64Array(whole.width * whole.height);
  for (const piece of pieces) {
    for (let row = 0; row < piece.height; row++) {
      for (let column = 0; column < piece.width; column++) {
        const [x, y] = [piece.x + column, piece.y + row];
        if (x < 0 || y < 0 || x >= whole.width || y >= whole.height) continue;
        const own = (piece.alpha[row * piece.width + column] ?? 0) / 255;
        const at = y * whole.width + x;
        drawn[at] = (drawn[at] ?? 0) + own * (1 - (drawn[at] ?? 0));
      }
    }
  }
  let differing = 0;
  let total = 0;
  for (let at = 0; at < drawn.length; at++) {
    const expected = (whole.alpha[at] ?? 0) / 255;
    differing += Math.abs((drawn[at] ?? 0) - expected);
    total += expected;
  }
  return differing / total;
}
