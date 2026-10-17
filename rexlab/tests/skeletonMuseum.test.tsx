import { act, cleanup, screen, within } from "@testing-library/react";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { LANGUAGES } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import {
  BOARD_AT,
  board,
  choices,
  finishLoading,
  fit,
  fitAll,
  keptSkeletons,
  layOutPuzzle,
  openPuzzle,
  openSkeletonsApp,
  puzzlePictures,
  reveal,
  revealNow,
  savedSkeletons,
  skeletonOf,
  slots,
  tray,
  type SkeletonsAppOptions
} from "./skeletonsApp.tsx";
import { fakeSkeletonPicture, memoryStorage, symbolOf, SHIPPED_SKELETONS } from "./support.ts";
import { PIECES, type Skeleton } from "../src/skeletons/index.ts";

// skeleton-assembly-museum.feature

const NAMES = ["TYRANNOSAURUS", "TRICERATOPS", "STEGOSAURUS"];

const button = (name: string) => screen.getByRole("button", { name });

const museum = () => screen.queryByRole("group", { name: "STANDS" });

const stand = (name: string) => {
  const shown = within(museum() ?? document.body).queryByRole("region", { name });
  if (!shown) throw new Error(`The museum has no ${name} stand`);
  return shown;
};

// What each stand shows, in the hall's order: its name, its state, its
// picture as a skeleton or a silhouette, whether it has a star, and its
// button with the symbol beside its words.
const stands = () =>
  within(museum() ?? document.body)
    .getAllByRole("region")
    .map((each) => {
      const picture = each.querySelector(".skeleton-exhibit-picture");
      const action = within(each).getByRole("button");
      return {
        name: each.querySelector(".skeleton-stand-name")?.textContent,
        state: each.getAttribute("data-state"),
        picture: [picture?.getAttribute("src"), picture?.classList.contains("skeleton-silhouette") ? "silhouette" : "skeleton"],
        star: within(each).queryByRole("img", { name: "STAR" }) !== null,
        action: [action.textContent, symbolOf(action)]
      };
    });

const starsChip = () => screen.getByLabelText("STARS");
const bestScore = () => screen.queryByLabelText("BEST SCORE")?.textContent;

const EMPTY = (id: string, name: string) => ({
  name,
  state: "empty",
  picture: [fakeSkeletonPicture(id, "skeleton"), "silhouette"],
  star: false,
  action: ["BUILD", "bone"]
});

const BUILT = (id: string, name: string) => ({
  name,
  state: "built",
  picture: [fakeSkeletonPicture(id, "skeleton"), "skeleton"],
  star: true,
  action: ["REBUILD", "rotate-ccw"]
});

const REBUILDING = (id: string, name: string) => ({
  name,
  state: "rebuilding",
  picture: [fakeSkeletonPicture(id, "skeleton"), "silhouette"],
  star: true,
  action: ["CONTINUE", "hammer"]
});

// The pieces in the tray scattering from the outline, in its order.
const scattering = () => [...tray().querySelectorAll(".skeleton-piece[data-scattering]")].map((piece) => piece.getAttribute("alt"));

// The app opened on the museum, from the choice of dinosaurs.
async function openMuseum(options: SkeletonsAppOptions = {}) {
  const opened = openSkeletonsApp(options);
  await opened.user.click(button("MUSEUM"));
  return opened;
}

// The museum opened on storage where `earned` have their stars, and the
// puzzle of `name` started from its REBUILD, its pictures loaded and its
// board laid out.
async function rebuild(name: string, earned: string[]) {
  const storage = keptSkeletons({ earned, bestScore: earned.length, rebuilding: [] });
  const opened = await openMuseum({ storage });
  await opened.user.click(within(stand(name)).getByRole("button"));
  act(() => finishLoading(opened.pictures));
  layOutPuzzle();
  return opened;
}

describe("opening the museum", () => {
  it("shows a hall of three empty stands, each with its silhouette, its name and BUILD with a bone, a 0/3 collection by a star, and BUILD ANOTHER and HOME", async () => {
    await openMuseum();

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("MUSEUM");
    expect(stands()).toEqual(SHIPPED_SKELETONS.map(({ id }, at) => EMPTY(id, NAMES[at] ?? "")));
    expect([starsChip().textContent, symbolOf(starsChip()), bestScore()]).toEqual(["0/3", "star", undefined]);
    expect([symbolOf(button("BUILD ANOTHER")), symbolOf(button("HOME"))]).toEqual(["bone", "house"]);
  });

  it("stands a finished skeleton on its stand, with its name, its star and REBUILD, the others still silhouettes", async () => {
    await openMuseum({ storage: keptSkeletons({ earned: ["triceratops"], bestScore: 1, rebuilding: [] }) });

    expect(stands()).toEqual([EMPTY("tyrannosaurus", "TYRANNOSAURUS"), BUILT("triceratops", "TRICERATOPS"), EMPTY("stegosaurus", "STEGOSAURUS")]);
    expect([starsChip().textContent, bestScore()]).toEqual(["1/3", "1/3"]);
  });

  it("opens from a puzzle, dropping it unfinished without a star", async () => {
    const tyrannosaurus = skeletonOf("tyrannosaurus");
    const storage = keptSkeletons({ earned: ["triceratops"], bestScore: 1, rebuilding: [] });
    const { user } = await openPuzzle("TYRANNOSAURUS", { storage });
    fit(tyrannosaurus, "skull");
    fit(tyrannosaurus, "tail");

    await user.click(button("MUSEUM"));

    expect(stands().map(({ state }) => state)).toEqual(["empty", "built", "empty"]);
    expect(savedSkeletons(storage)).toEqual({ earned: ["triceratops"], bestScore: 1, rebuilding: [] });
  });

  it("opens from the reveal, the skeleton just built on its stand", async () => {
    const { user, pictures } = await openPuzzle("STEGOSAURUS");
    fitAll(skeletonOf("stegosaurus"));
    revealNow(pictures, "stegosaurus");

    await user.click(within(reveal() ?? document.body).getByRole("button", { name: "MUSEUM" }));

    expect(stands().map(({ state }) => state)).toEqual(["empty", "empty", "built"]);
    expect([starsChip().textContent, bestScore()]).toEqual(["1/3", "1/3"]);
  });

  it("opens from a finished skeleton before its reveal, which then never shows", async () => {
    const { user, pictures } = await openPuzzle("STEGOSAURUS");
    fitAll(skeletonOf("stegosaurus"));

    await user.click(button("MUSEUM"));
    revealNow(pictures, "stegosaurus");

    expect(reveal()).toBeNull();
    expect(stands().map(({ state }) => state)).toEqual(["empty", "empty", "built"]);
  });

  it("starts no puzzle still loading as it opens", async () => {
    const { user, pictures } = openSkeletonsApp();
    await user.click(button("TRICERATOPS"));

    await user.click(button("MUSEUM"));
    act(() => finishLoading(pictures));

    expect(museum()).not.toBeNull();
    expect(screen.queryByRole("group", { name: "BONES" })).toBeNull();
  });

  it("goes back to the choice of dinosaurs on BUILD ANOTHER, and home on HOME", async () => {
    const { user } = await openMuseum();

    await user.dblClick(button("BUILD ANOTHER"));
    expect(choices().map((choice) => choice.getAttribute("aria-label"))).toEqual(NAMES);

    await user.click(button("MUSEUM"));
    await user.click(button("HOME"));
    expect(button("COMPARE")).toBeDefined();
  });

  it.each(LANGUAGES)("reads in %s, its names in capitals", async (language) => {
    const text = TEXTS[language];
    const { user } = openSkeletonsApp({ deviceLanguage: language === "ru" ? "ru-RU" : "en-GB", storage: keptSkeletons({ earned: ["tyrannosaurus"], bestScore: 1, rebuilding: [] }) });
    await user.click(button(text.museum));

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(text.museum);
    const shown = within(screen.getByRole("group", { name: text.stands })).getAllByRole("region");
    expect(shown.map((each) => [each.getAttribute("aria-label"), within(each).getByRole("button").textContent])).toEqual([
      [SHIPPED_SKELETONS[0]?.name[language].toLocaleUpperCase(language), text.rebuild],
      [SHIPPED_SKELETONS[1]?.name[language].toLocaleUpperCase(language), text.build],
      [SHIPPED_SKELETONS[2]?.name[language].toLocaleUpperCase(language), text.build]
    ]);
    expect([button(text.buildAnother), button(text.home)]).toHaveLength(2);
    expect(screen.getByLabelText(text.starsEarned).textContent).toBe("1/3");
  });
});

describe("an empty stand", () => {
  it("starts a fresh puzzle of its dinosaur once on a double tap, its four pieces in the tray, the stars and other stands as they were", async () => {
    const storage = keptSkeletons({ earned: ["tyrannosaurus"], bestScore: 1, rebuilding: [] });
    const { user, pictures } = await openMuseum({ storage });

    await user.dblClick(within(stand("STEGOSAURUS")).getByRole("button", { name: "BUILD" }));

    expect(pictures.loading()).toEqual(puzzlePictures("stegosaurus"));
    act(() => finishLoading(pictures));
    expect(screen.getByRole("heading").textContent).toBe("STEGOSAURUS");
    expect(slots().map(([, state]) => state)).toEqual(["empty", "empty", "empty", "empty"]);
    expect(within(tray()).getAllByRole("img")).toHaveLength(4);
    expect(scattering()).toEqual([]);
    expect(savedSkeletons(storage)).toEqual({ earned: ["tyrannosaurus"], bestScore: 1, rebuilding: [] });

    await user.click(button("MUSEUM"));
    expect(stands().map(({ state }) => state)).toEqual(["built", "empty", "empty"]);
  });
});

describe("rebuilding", () => {
  it("scatters the bones of a skeleton knocked down into a fresh puzzle, dropping the unfinished one, with nothing lost and nothing asked", async () => {
    const tyrannosaurus = skeletonOf("tyrannosaurus");
    const storage = keptSkeletons({ earned: ["triceratops"], bestScore: 1, rebuilding: [] });
    const { user, pictures } = await openPuzzle("TYRANNOSAURUS", { storage });
    fit(tyrannosaurus, "skull");
    fit(tyrannosaurus, "legs");

    await user.click(button("MUSEUM"));
    await user.click(within(stand("TRICERATOPS")).getByRole("button", { name: "REBUILD" }));
    act(() => finishLoading(pictures));

    expect(screen.getByRole("heading").textContent).toBe("TRICERATOPS");
    expect(board().querySelector(".skeleton-outline")?.getAttribute("src")).toBe(fakeSkeletonPicture("triceratops", "skeleton"));
    expect(slots().map(([, state]) => state)).toEqual(["empty", "empty", "empty", "empty"]);
    expect(scattering()).toEqual(["SKULL", "SPINE", "LEGS", "TAIL"]);
    expect(tray().hasAttribute("data-scatter")).toBe(true);
    expect(screen.getByLabelText("BONES IN PLACE").textContent).toBe("0/4");
    expect(screen.queryAllByRole("dialog")).toEqual([]);
    expect(screen.queryAllByRole("alertdialog")).toEqual([]);
    expect(screen.queryAllByRole("status")).toEqual([]);
    expect(savedSkeletons(storage)).toEqual({ earned: ["triceratops"], bestScore: 1, rebuilding: ["triceratops"] });

    cleanup();
    openSkeletonsApp({ storage });

    expect(screen.getByRole("heading").textContent).toBe("BUILD A SKELETON");
    expect(choices().map((choice) => within(choice).queryByRole("img", { name: "STAR" }) !== null)).toEqual([false, true, false]);
  });

  // The layout stands in for jsdom's, which lays nothing out, until the
  // test ends.
  it("starts each bone whole in its home on the outline, at its size there, and flies it to its spot in the tray", async () => {
    const triceratops = skeletonOf("triceratops");
    const pictureAt = layOutScatter();
    const { user, pictures } = await openMuseum({ storage: keptSkeletons({ earned: ["triceratops"], bestScore: 1, rebuilding: [] }) });
    await user.click(within(stand("TRICERATOPS")).getByRole("button"));

    act(() => finishLoading(pictures));

    const flown = [...tray().querySelectorAll<HTMLElement>(".skeleton-piece")].map(({ style }) =>
      ["--from-x", "--from-y", "--from-scale"].map((property) => Number.parseFloat(style.getPropertyValue(property)))
    );
    expect(flown).toEqual(
      PIECES.map((piece, at) => {
        const home = homeRect(triceratops, piece);
        const picture = pictureAt(at);
        const drawn = Math.min(picture.width, (picture.height * home.width) / home.height);
        return [
          home.left + home.width / 2 - (picture.left + picture.width / 2),
          home.top + home.height / 2 - (picture.top + picture.height / 2),
          home.width / drawn
        ].map((value) => expect.closeTo(value, 6));
      })
    );
  });

  it("rebuilds once on a quick double tap, its star and stand earned exactly once", async () => {
    const storage = keptSkeletons({ earned: ["tyrannosaurus"], bestScore: 1, rebuilding: [] });
    const { user, pictures } = await openMuseum({ storage });

    await user.dblClick(within(stand("TYRANNOSAURUS")).getByRole("button", { name: "REBUILD" }));

    expect(pictures.loading()).toEqual(puzzlePictures("tyrannosaurus"));
    expect(pictures.timers()).toEqual([1000]);
    act(() => finishLoading(pictures));
    expect(scattering()).toHaveLength(4);

    await user.click(button("MUSEUM"));
    expect(stands()[0]).toEqual(REBUILDING("tyrannosaurus", "TYRANNOSAURUS"));
    expect([starsChip().textContent, bestScore()]).toEqual(["1/3", "1/3"]);
    expect(savedSkeletons(storage)).toEqual({ earned: ["tyrannosaurus"], bestScore: 1, rebuilding: ["tyrannosaurus"] });
  });

  it("keeps a stand awaiting its skeleton earned, its silhouette with its star and CONTINUE, unlike one never earned, the rest as they were", async () => {
    const { user } = await rebuild("TRICERATOPS", ["tyrannosaurus", "triceratops"]);

    await user.click(button("MUSEUM"));

    expect(stands()).toEqual([BUILT("tyrannosaurus", "TYRANNOSAURUS"), REBUILDING("triceratops", "TRICERATOPS"), EMPTY("stegosaurus", "STEGOSAURUS")]);
    expect([starsChip().textContent, bestScore()]).toEqual(["2/3", "2/3"]);
  });

  it("starts a fresh puzzle, without a scatter, from a stand awaiting its skeleton", async () => {
    const tyrannosaurus = skeletonOf("tyrannosaurus");
    const { user, pictures } = await rebuild("TYRANNOSAURUS", ["tyrannosaurus"]);
    fit(tyrannosaurus, "spine");
    await user.click(button("MUSEUM"));

    await user.click(within(stand("TYRANNOSAURUS")).getByRole("button", { name: "CONTINUE" }));
    act(() => finishLoading(pictures));

    expect(screen.getByRole("heading").textContent).toBe("TYRANNOSAURUS");
    expect(slots().map(([, state]) => state)).toEqual(["empty", "empty", "empty", "empty"]);
    expect(within(tray()).getAllByRole("img")).toHaveLength(4);
    expect(scattering()).toEqual([]);
  });

  it("stands the skeleton rebuilt back on its stand, revealing it with the star it had, no second star and no new best", async () => {
    const { user, pictures, storage } = await rebuild("TRICERATOPS", ["tyrannosaurus", "triceratops"]);

    fitAll(skeletonOf("triceratops"));
    revealNow(pictures, "triceratops");

    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("TRICERATOPS");
    expect(reveal()?.querySelectorAll(".skeleton-fact")).toHaveLength(1);
    expect(screen.getByRole("img", { name: "STAR" }).hasAttribute("data-new")).toBe(false);
    expect([starsChip().textContent, bestScore(), screen.queryByRole("status")]).toEqual(["2/3", "BEST2/3", null]);
    expect(savedSkeletons(storage)).toEqual({ earned: ["tyrannosaurus", "triceratops"], bestScore: 2, rebuilding: [] });

    await user.click(within(reveal() ?? document.body).getByRole("button", { name: "MUSEUM" }));

    expect(stands()).toEqual([BUILT("tyrannosaurus", "TYRANNOSAURUS"), BUILT("triceratops", "TRICERATOPS"), EMPTY("stegosaurus", "STEGOSAURUS")]);
    expect([starsChip().textContent, bestScore()]).toEqual(["2/3", "2/3"]);
  });

  it("keeps the stars when a skeleton is rebuilt on a browser that cannot read progress", async () => {
    const storage = memoryStorage({}, { read: false });
    const { user, pictures } = await openPuzzle("STEGOSAURUS", { storage });
    fitAll(skeletonOf("stegosaurus"));
    revealNow(pictures, "stegosaurus");
    await user.click(within(reveal() ?? document.body).getByRole("button", { name: "MUSEUM" }));

    await user.click(within(stand("STEGOSAURUS")).getByRole("button", { name: "REBUILD" }));
    act(() => finishLoading(pictures));
    await user.click(button("MUSEUM"));

    expect(stands()[2]).toEqual(REBUILDING("stegosaurus", "STEGOSAURUS"));
    expect([starsChip().textContent, bestScore()]).toEqual(["1/3", undefined]);
  });
});

// Where the board, the tray's spots and their pictures are on the iPad's
// screen, in CSS pixels, as the design lays them out, from the moment
// each is drawn: jsdom lays nothing out. Returns where the tray draws
// each piece's picture, in its order.
function layOutScatter() {
  const spotAt = (at: number) => ({ left: 1032, top: 152 + at * 164, width: 324, height: 140 });
  const pictureAt = (at: number) => {
    const spot = spotAt(at);
    return { left: spot.left + 16, top: spot.top + 16, width: spot.width - 32, height: spot.height - 32 };
  };
  const original = Element.prototype.getBoundingClientRect;
  const spy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const piece = PIECES.indexOf(this.closest(".skeleton-tray-spot")?.getAttribute("data-piece") as (typeof PIECES)[number]);
    const rect = this.classList.contains("skeleton-board")
      ? BOARD_AT
      : this.classList.contains("skeleton-piece") && piece >= 0
        ? pictureAt(piece)
        : this.classList.contains("skeleton-tray-spot") && piece >= 0
          ? spotAt(piece)
          : undefined;
    if (rect === undefined) return original.call(this);
    const { left, top, width, height } = rect;
    return { left, top, width, height, x: left, y: top, right: left + width, bottom: top + height, toJSON: () => rect };
  });
  onTestFinished(() => spy.mockRestore());
  return pictureAt;
}

// A piece's home on the board, on the screen, in CSS pixels.
function homeRect(skeleton: Skeleton, piece: (typeof PIECES)[number]) {
  const { x, y, width, height } = skeleton.places[piece];
  const scale = BOARD_AT.width / skeleton.frame.width;
  return { left: BOARD_AT.left + x * scale, top: BOARD_AT.top + y * scale, width: width * scale, height: height * scale };
}
