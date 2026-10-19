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
import { HELP_AFTER, startPuzzle, type Cuts, type Skeleton, type SkeletonResult } from "../src/skeletons/index.ts";
import { PIECES, placeOf } from "./skeletonsApp.tsx";
import { PALETTE, SHIPPED_SKELETONS, browserDocument, contrast, browserQueries, fakeBodyPicture, fakeSkeletonPicture, memoryStorage, pictureBrowser, readWebp } from "./support.ts";

const ROOT = resolve(import.meta.dirname, "..");

const NAMES = [
  { id: "tyrannosaurus", name: { en: "Tyrannosaurus", ru: "Тираннозавр" } },
  { id: "triceratops", name: { en: "Triceratops", ru: "Трицератопс" } }
];

const place = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

const NAMED = {
  skull: { en: "SKULL", ru: "ЧЕРЕП" },
  spine: { en: "SPINE", ru: "ПОЗВОНОЧНИК" },
  legs: { en: "LEGS", ru: "НОГИ" },
  tail: { en: "TAIL", ru: "ХВОСТ" }
};

const AREAS = { skull: "head", spine: "back", legs: "legs", tail: "tail" } as const;

const PLACES = { skull: place(0, 0, 100, 80), spine: place(80, 10, 300, 200), legs: place(90, 150, 300, 250), tail: place(380, 120, 20, 60) };

// Hatchling's cut as the file writes it: each piece's id, name and place.
const FILED = PIECES.map((id) => ({ id, name: NAMED[id], area: AREAS[id], ...PLACES[id] }));

// The same cut as it is read.
const CUT = PIECES.map((id) => ({ id, name: NAMED[id], area: AREAS[id], place: PLACES[id] }));

const FACT = { en: "TRICERATOPS HAD THREE HORNS.", ru: "У ТРИЦЕРАТОПСА БЫЛО ТРИ РОГА." };

const ENTRY = { fact: FACT, cuts: { hatchling: FILED } };

// The entry with its Hatchling piece at `at` replaced by `piece`.
const withPiece = (at: number, piece: unknown) => ({ ...ENTRY, cuts: { hatchling: FILED.map((each, index) => (index === at ? piece : each)) } });

const file = (dinosaurs: SkeletonsFile["dinosaurs"]): SkeletonsFile => ({ frame: { width: 400, height: 400 }, dinosaurs });

describe("readSkeletons", () => {
  it("names each skeleton as its dinosaur is named, in the file's order, with its fact, frame and Hatchling's cut", () => {
    const tyrannosaurus = { en: "T. REX HAD TINY ARMS.", ru: "У ТИРАННОЗАВРА БЫЛИ КРОШЕЧНЫЕ ЛАПЫ." };
    const three = [FILED[0], FILED[1], { id: "tail", name: NAMED.tail, area: "tail", ...place(0, 300, 400, 100) }];

    expect(readSkeletons(NAMES, file({ triceratops: ENTRY, tyrannosaurus: { fact: tyrannosaurus, cuts: { hatchling: three } } }))).toEqual([
      { id: "triceratops", name: { en: "Triceratops", ru: "Трицератопс" }, fact: FACT, frame: { width: 400, height: 400 }, cuts: { hatchling: CUT } },
      {
        id: "tyrannosaurus",
        name: { en: "Tyrannosaurus", ru: "Тираннозавр" },
        fact: tyrannosaurus,
        frame: { width: 400, height: 400 },
        cuts: { hatchling: [CUT[0], CUT[1], { id: "tail", name: NAMED.tail, area: "tail", place: place(0, 300, 400, 100) }] }
      }
    ]);
  });

  it("reads a cut of Explorer's and Paleontologist's own beside Hatchling's, and none where the file has none", () => {
    const two = [FILED[0], { id: "body", name: { en: "BODY", ru: "ТЕЛО" }, area: "back", ...place(80, 10, 320, 390) }];
    const [read] = readSkeletons(NAMES, file({ triceratops: { fact: FACT, cuts: { hatchling: FILED, paleontologist: two } } }));

    expect(read?.cuts).toEqual({ hatchling: CUT, paleontologist: [CUT[0], { id: "body", name: { en: "BODY", ru: "ТЕЛО" }, area: "back", place: place(80, 10, 320, 390) }] });
  });

  it("reads each distractor as the piece of another skeleton's Paleontologist cut, named with its dinosaur, and none where the file has none", () => {
    const frill = { id: "frill", name: { en: "FRILL", ru: "ВОРОТНИК" }, area: "head", ...place(0, 0, 120, 90) };
    const named = { en: "TRICERATOPS FRILL", ru: "ВОРОТНИК ТРИЦЕРАТОПСА" };
    const read = readSkeletons(
      NAMES,
      file({
        triceratops: { fact: FACT, cuts: { hatchling: FILED, paleontologist: [...FILED, frill] } },
        tyrannosaurus: { ...ENTRY, distractors: [{ skeleton: "triceratops", piece: "frill", name: named }] }
      })
    );

    expect(read.map((skeleton) => skeleton.distractors)).toEqual([undefined, [{ id: "frill", name: named, area: "head", place: place(0, 0, 120, 90), skeleton: "triceratops" }]]);
  });

  it.each<[string, unknown, string]>([
    ["not a list", "frill", 'tyrannosaurus has no distractors: "frill"'],
    ["of none", [], "tyrannosaurus has no distractors: []"],
    ["of its own skeleton", [{ skeleton: "tyrannosaurus", piece: "skull", name: NAMED.skull }], "tyrannosaurus's distractor 1 is no piece of another skeleton's paleontologist cut"],
    ["of no skeleton in the file", [{ skeleton: "stegosaurus", piece: "skull", name: NAMED.skull }], "tyrannosaurus's distractor 1 is no piece of another skeleton's paleontologist cut"],
    ["of a piece only another level's cut has", [{ skeleton: "triceratops", piece: "legs", name: NAMED.legs }], "tyrannosaurus's distractor 1 is no piece of another skeleton's paleontologist cut"],
    [
      "of the same piece twice",
      [
        { skeleton: "triceratops", piece: "skull", name: NAMED.skull },
        { skeleton: "triceratops", piece: "skull", name: NAMED.skull }
      ],
      "tyrannosaurus's distractor 2 is no piece of another skeleton's paleontologist cut"
    ],
    ["not a piece", ["skull"], 'tyrannosaurus\'s distractor 1 is no piece of another skeleton\'s paleontologist cut: "skull"'],
    ["named in one language only", [{ skeleton: "triceratops", piece: "skull", name: { en: "SKULL" } }], 'tyrannosaurus\'s distractor triceratops/skull has no name in every language: {"en":"SKULL"}']
  ])("fails when it is made on distractors %s", (_, distractors, message) => {
    const triceratops = { fact: FACT, cuts: { hatchling: FILED, paleontologist: [FILED[0]] } };

    expect(() => readSkeletons(NAMES, file({ triceratops, tyrannosaurus: { ...ENTRY, distractors } }))).toThrow(message);
  });

  it.each<[string, unknown, string]>([
    ["of no pieces", { hatchling: FILED, explorer: [] }, "triceratops has no explorer cut: []"],
    ["with a piece past the frame", { hatchling: FILED, paleontologist: [{ id: "skull", name: NAMED.skull, area: "head", ...place(350, 0, 100, 80) }] }, "triceratops has no skull in its 400×400 frame"]
  ])("fails when it is made on another level's cut %s", (_, cuts, message) => {
    expect(() => readSkeletons(NAMES, file({ triceratops: { fact: FACT, cuts } }))).toThrow(message);
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
    ["with no cuts", undefined, "triceratops has no hatchling cut: undefined"],
    ["with no Hatchling cut", {}, "triceratops has no hatchling cut: undefined"],
    ["with a Hatchling cut of no pieces", { hatchling: [] }, "triceratops has no hatchling cut: []"],
    ["with a Hatchling cut that is not a list", { hatchling: "four bones" }, 'triceratops has no hatchling cut: "four bones"'],
    ["with a cut of no level", { hatchling: FILED, champion: FILED }, "triceratops has a cut of no level: champion"]
  ])("fails when it is made on a skeleton %s", (_, cuts, message) => {
    expect(() => readSkeletons(NAMES, file({ triceratops: { fact: FACT, cuts } }))).toThrow(message);
  });

  it.each<[string, unknown, string]>([
    ["of no id", { name: NAMED.legs, ...PLACES.legs }, "triceratops's hatchling piece 3 has no id of its own: undefined"],
    ["of an empty id", { id: " ", name: NAMED.legs, ...PLACES.legs }, 'triceratops\'s hatchling piece 3 has no id of its own: " "'],
    ["of another piece's id", { id: "skull", name: NAMED.legs, ...PLACES.legs }, 'triceratops\'s hatchling piece 3 has no id of its own: "skull"'],
    ["named for the whole skeleton's picture", { id: "skeleton", name: NAMED.legs, ...PLACES.legs }, 'triceratops\'s hatchling piece 3 has no id of its own: "skeleton"'],
    ["not a piece", "legs", "triceratops's hatchling piece 3 has no id of its own: undefined"],
    ["with no name", { id: "legs", ...PLACES.legs }, "triceratops's legs has no name in every language: undefined"],
    ["named in one language only", { id: "legs", name: { en: "LEGS" }, ...PLACES.legs }, 'triceratops\'s legs has no name in every language: {"en":"LEGS"}'],
    ["of no body area", { id: "legs", name: NAMED.legs, ...PLACES.legs }, "triceratops's legs has no body area: undefined"],
    ["of a body area not in the list", { id: "legs", name: NAMED.legs, area: "wings", ...PLACES.legs }, 'triceratops\'s legs has no body area: "wings"']
  ])("fails when it is made on a piece %s", (_, piece, message) => {
    expect(() => readSkeletons(NAMES, file({ triceratops: withPiece(2, piece) }))).toThrow(message);
  });

  it.each<[string, unknown, string]>([
    ["missing", {}, "triceratops has no legs in its 400×400 frame: {}"],
    ["of no size", place(10, 10, 0, 50), "triceratops has no legs in its 400×400 frame"],
    ["before the frame", place(-1, 10, 50, 50), "triceratops has no legs in its 400×400 frame"],
    ["past its right edge", place(351, 10, 50, 50), "triceratops has no legs in its 400×400 frame"],
    ["past its bottom edge", place(10, 351, 50, 50), "triceratops has no legs in its 400×400 frame"],
    ["of a size in words", { x: 0, y: 0, width: "wide", height: 50 }, "triceratops has no legs in its 400×400 frame"]
  ])("fails when it is made on a piece's place %s", (_, at, message) => {
    expect(() => readSkeletons(NAMES, file({ triceratops: withPiece(2, { id: "legs", name: NAMED.legs, area: "legs", ...(at as object) }) }))).toThrow(message);
  });

  it("reads every shipped skeleton, Tyrannosaurus, Triceratops and Stegosaurus, each with Hatchling's four pieces in its frame", () => {
    const shipped = readSkeletons(records, skeletonPlaces);

    expect(shipped.map(({ id, name }) => [id, name.en])).toEqual([
      ["tyrannosaurus", "Tyrannosaurus"],
      ["triceratops", "Triceratops"],
      ["stegosaurus", "Stegosaurus"]
    ]);
    expect(shipped.map(({ frame, cuts }) => [frame, cuts.hatchling.map(({ id, name }) => [id, name])])).toEqual(
      shipped.map(() => [{ width: 800, height: 600 }, PIECES.map((id) => [id, NAMED[id]])])
    );
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
      { triceratops: PARTS }
    );

    expect([pictureOf("triceratops", "skeleton"), pictureOf("triceratops", "skull")]).toEqual(["/assets/skeleton-a1.webp", "/assets/skull-b2.webp"]);
    expect(() => pictureOf("stegosaurus", "skull")).toThrow("No skeleton picture for stegosaurus/skull");
  });

  it("fails when it is made, naming every part with no picture, each dinosaur with parts of its own", () => {
    const files = {
      "./assets/skeletons/triceratops/skeleton.webp": "/assets/skeleton-a1.webp",
      "./assets/skeletons/triceratops/skull.png": "/assets/skull-b2.png",
      "./assets/dinos/stegosaurus/skull.webp": "/assets/skull-c3.webp"
    };

    expect(() => skeletonPictures(files, { triceratops: PARTS, stegosaurus: ["skeleton", "skull", "plates"] })).toThrow(
      "No skeleton picture for triceratops/skull, stegosaurus/skeleton, stegosaurus/skull, stegosaurus/plates"
    );
  });
});

const skeletonOf = (id: string): Skeleton => {
  const found = SHIPPED_SKELETONS.find((each) => each.id === id);
  if (!found) throw new Error(`No ${id} skeleton is shipped`);
  return found;
};

// A new puzzle of the shipped skeleton of `id`, at Hatchling.
const hatchlingPuzzle = (id: string) => startPuzzle(skeletonOf(id), skeletonOf(id).cuts.hatchling);

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
    const triceratops = skeletonOf("triceratops");
    const { frame } = triceratops;

    expect(presentPuzzle(startPuzzle(triceratops, triceratops.cuts.hatchling), "en", fakeSkeletonPicture)).toEqual({
      name: "Triceratops",
      outline: fakeSkeletonPicture("triceratops", "skeleton"),
      frame,
      slots: PIECES.map((piece) => ({
        piece,
        name: NAMED[piece].en,
        picture: fakeSkeletonPicture("triceratops", piece),
        left: placeOf(triceratops, piece).x / frame.width,
        top: placeOf(triceratops, piece).y / frame.height,
        width: placeOf(triceratops, piece).width / frame.width,
        height: placeOf(triceratops, piece).height / frame.height,
        fitted: false
      })),
      hint: undefined,
      complete: false
    });
  });

  it("points help at the first piece in the tray still to fit, once help is due, and at none before", () => {
    const due = { ...hatchlingPuzzle("tyrannosaurus"), fitted: ["skull", "legs"] as const, waited: HELP_AFTER };

    expect([presentPuzzle(due, "en", fakeSkeletonPicture).hint, presentPuzzle({ ...due, waited: HELP_AFTER - 1 }, "en", fakeSkeletonPicture).hint]).toEqual([
      { piece: "spine", step: "glow", region: undefined },
      undefined
    ]);
  });

  it("shows the ladder's help with the body region of its piece, around every piece of that area in the cut", () => {
    const tyrannosaurus = skeletonOf("tyrannosaurus");
    const explorer = tyrannosaurus.cuts.explorer ?? [];
    const legs = explorer.filter(({ area }) => area === "legs").map(({ place }) => place);
    const due = { ...startPuzzle(tyrannosaurus, explorer, { ladder: true }), fitted: ["skull", "neck", "back", "hips"], waited: 2 * HELP_AFTER };
    const left = Math.min(...legs.map(({ x }) => x));
    const top = Math.min(...legs.map(({ y }) => y));
    const { width, height } = tyrannosaurus.frame;

    expect(legs).toHaveLength(2);
    expect(presentPuzzle(due, "en", fakeSkeletonPicture).hint).toEqual({
      piece: "left-leg",
      step: "ghost",
      region: {
        left: left / width,
        top: top / height,
        width: (Math.max(...legs.map(({ x, width: w }) => x + w)) - left) / width,
        height: (Math.max(...legs.map(({ y, height: h }) => y + h)) - top) / height
      }
    });
  });

  it("reports the skeleton complete once every piece is fitted, and not before", () => {
    const puzzle = { ...hatchlingPuzzle("stegosaurus"), fitted: ["tail", "skull", "legs"] as const };

    expect([presentPuzzle(puzzle, "en", fakeSkeletonPicture).complete, presentPuzzle({ ...puzzle, fitted: [...puzzle.fitted, "spine"] }, "en", fakeSkeletonPicture).complete]).toEqual([
      false,
      true
    ]);
  });

  it("marks the slots of fitted pieces, and only those", () => {
    const puzzle = { ...hatchlingPuzzle("stegosaurus"), fitted: ["tail", "skull"] as const };

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

  // Every level's cut, Hatchling's four pieces and the other levels' own.
  const piecesOf = (cuts: Cuts) => Object.values(cuts).flat();

  it("is given to the app, each with its outline and every cut's pieces from its own folder", () => {
    expect(skeletons).toEqual(SHIPPED_SKELETONS);
    for (const { id, cuts } of skeletons) {
      for (const part of ["skeleton", ...piecesOf(cuts).map((piece) => piece.id)]) {
        expect(fileOf(skeletonPicture(id, part))).toBe(join(ROOT, "src/assets/skeletons", id, `${part}.webp`));
      }
    }
  });

  it("has an outline as big as its frame and each piece as big as its place, all with alpha", () => {
    const sizes = skeletons.map(({ id, cuts }) => [
      readWebp(readFileSync(fileOf(skeletonPicture(id, "skeleton")))),
      ...piecesOf(cuts).map((piece) => readWebp(readFileSync(fileOf(skeletonPicture(id, piece.id)))))
    ]);

    expect(sizes).toEqual(
      skeletons.map(({ frame, cuts }) => [
        { ...frame, alpha: true },
        ...piecesOf(cuts).map(({ place }) => ({ width: place.width, height: place.height, alpha: true }))
      ])
    );
  });

  // The places are checked against the pictures themselves, not the file
  // the app reads them from: a piece a pixel off in x or y already strays
  // past the tolerance.
  it("is rebuilt by each cut's pieces drawn at their places, each a pixel off showing", async () => {
    const SHIFTS = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ] as const;
    const measured = await Promise.all(
      skeletons.flatMap(({ id, cuts }) => Object.entries(cuts).map(async ([level, cut]) => {
        const whole = await alphaOf(fileOf(skeletonPicture(id, "skeleton")));
        const pieces = await Promise.all(cut.map(async (piece) => ({ ...piece.place, ...(await alphaOf(fileOf(skeletonPicture(id, piece.id)))) })));
        return {
          id,
          level,
          rebuilt: unmatched(whole, pieces) <= TOLERANCE,
          inPlace: pieces.map((piece) => stray(whole, piece) <= TOLERANCE),
          offByAPixel: pieces.map((piece) => SHIFTS.every(([dx, dy]) => stray(whole, { ...piece, x: piece.x + dx, y: piece.y + dy }) > TOLERANCE))
        };
      }))
    );

    expect(measured).toEqual(
      skeletons.flatMap(({ id, cuts }) => Object.entries(cuts).map(([level, cut]) => ({ id, level, rebuilt: true, inPlace: cut.map(() => true), offByAPixel: cut.map(() => true) })))
    );
  });

  // A piece in two cuts is one picture, so it lies at one place in both.
  it("is cut for Explorer into six to eight pieces and for Paleontologist into ten to twelve, a piece two cuts share at the same place", () => {
    const sizes = skeletons.map(({ id, cuts }) => ({
      id,
      explorer: (cuts.explorer?.length ?? 0) >= 6 && (cuts.explorer?.length ?? 0) <= 8,
      paleontologist: (cuts.paleontologist?.length ?? 0) >= 10 && (cuts.paleontologist?.length ?? 0) <= 12,
      samePlaces: piecesOf(cuts).every((piece) => piecesOf(cuts).every((same) => same.id !== piece.id || JSON.stringify(same.place) === JSON.stringify(piece.place)))
    }));

    expect(sizes).toEqual(skeletons.map(({ id }) => ({ id, explorer: true, paleontologist: true, samePlaces: true })));
  });

  // skeleton-assembly-paleontologist.feature: two or three bones of the
  // other skeletons, each named with its dinosaur, a picture already
  // shipped in their folder.
  it("mixes two or three bones of other skeletons into Paleontologist's tray, each named with its dinosaur", () => {
    const seen = skeletons.map(({ id, distractors = [] }) => ({
      id,
      twoOrThree: distractors.length >= 2 && distractors.length <= 3,
      others: distractors.every((distractor) => distractor.skeleton !== id),
      named: distractors.every(({ skeleton, name }) => {
        const dinosaur = skeletons.find((each) => each.id === skeleton)?.name;
        // In Russian the dinosaur follows, in the genitive, which each
        // shipped name forms with "А".
        return name.en.startsWith(`${dinosaur?.en.toUpperCase()} `) && name.ru.endsWith(` ${dinosaur?.ru.toUpperCase()}А`);
      }),
      pictures: distractors.every((distractor) => fileOf(skeletonPicture(distractor.skeleton, distractor.id)) === join(ROOT, "src/assets/skeletons", distractor.skeleton, `${distractor.id}.webp`))
    }));

    expect(seen).toEqual(skeletons.map(({ id }) => ({ id, twoOrThree: true, others: true, named: true, pictures: true })));
  });

  // skeleton-assembly-explorer.feature: a bone shows on its tinted spot by
  // its dark outline in light, the darkest twentieth of it, and by its
  // pale bone in dark, its median.
  it("shows each Explorer bone at least 3:1 on its body area's tint, by its outline in light and its bone in dark", async () => {
    const seen = await Promise.all(
      skeletons.flatMap(({ id, cuts }) =>
        (cuts.explorer ?? []).map(async (piece) => {
          const shades = await shadesOf(fileOf(skeletonPicture(id, piece.id)));
          const at = (share: number) => shades[Math.floor(shades.length * share)] ?? "#000000";
          return {
            piece: `${id}/${piece.id}`,
            light: contrast(at(0.05), PALETTE.light[`area-${piece.area}-tint`] ?? "") >= 3,
            dark: contrast(at(0.5), PALETTE.dark[`area-${piece.area}-tint`] ?? "") >= 3
          };
        })
      )
    );

    expect(seen).toEqual(seen.map(({ piece }) => ({ piece, light: true, dark: true })));
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
// The colours of a picture's opaque pixels, darkest first.
async function shadesOf(file: string): Promise<string[]> {
  const { data } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const shades: Array<{ colour: string; light: number }> = [];
  for (let at = 0; at < data.length; at += 4) {
    if ((data[at + 3] ?? 0) < 200) continue;
    const [r = 0, g = 0, b = 0] = [data[at], data[at + 1], data[at + 2]];
    shades.push({ colour: `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`, light: 0.2126 * r + 0.7152 * g + 0.0722 * b });
  }
  return shades.sort((a, b) => a.light - b.light).map(({ colour }) => colour);
}

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
