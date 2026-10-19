import { act, fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LANGUAGES } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { NAME_EMS } from "./nameWidths.ts";
import { board, choices, finishLoading, openSkeletonsApp, puzzlePictures, slots, tray } from "./skeletonsApp.tsx";
import { SHIPPED_SKELETONS, countedStarts, fakeBodyPicture, fakeSkeletonPicture, symbolOf, gameDoor } from "./support.ts";

// The names of Hatchling's four pieces, in the tray's order.
const HATCHLING_NAMES = { en: ["SKULL", "SPINE", "LEGS", "TAIL"], ru: ["ЧЕРЕП", "ПОЗВОНОЧНИК", "НОГИ", "ХВОСТ"] };

const button = (name: string) => screen.getByRole("button", { name });

const NAMES = ["TYRANNOSAURUS", "TRICERATOPS", "STEGOSAURUS", "BRACHIOSAURUS", "SPINOSAURUS"];

// The look of the outline's picture, then of each bone's in the tray.
const looks = () => [board().querySelector(".skeleton-outline img"), ...within(tray()).getAllByRole("img")].map((picture) => (picture as HTMLElement | null)?.dataset.picture);

// A touch target's least side, as app.css gives it: jsdom lays nothing
// out, so it is read from the sizes and least sizes the stylesheet sets.
const leastSide = (element: Element) => {
  const style = getComputedStyle(element);
  const side = (size: string, least: string) => Math.max(parseFloat(size) || 0, parseFloat(least) || 0);
  return Math.min(side(style.width, style.minWidth), side(style.height, style.minHeight));
};

describe("the skeleton game's choice of dinosaurs", () => {
  it("offers five dinosaurs from the start, each its own picture and name in capitals, none locked", () => {
    const { pictures } = openSkeletonsApp();
    act(() => finishLoading(pictures));

    expect(screen.getByRole("heading").textContent).toBe("BUILD A SKELETON");
    expect(choices().map((choice) => choice.getAttribute("aria-label"))).toEqual(NAMES);
    expect(choices().map((choice) => choice.querySelector(".skeleton-choice-name")?.textContent)).toEqual(NAMES);
    expect(choices().map((choice) => choice.querySelector("img")?.getAttribute("src"))).toEqual(
      ["tyrannosaurus", "triceratops", "stegosaurus", "brachiosaurus", "spinosaurus"].map(fakeBodyPicture)
    );
    expect(choices().filter((choice) => choice.hasAttribute("disabled") || symbolOf(choice) !== undefined)).toEqual([]);
  });

  it("shows MUSEUM with a museum symbol and HOME with a house symbol", () => {
    openSkeletonsApp();

    expect([symbolOf(button("MUSEUM")), symbolOf(button("HOME"))]).toEqual(["landmark", "house"]);
  });

  it("gives every card and button a touch target of at least 48 by 48 CSS pixels", () => {
    openSkeletonsApp();

    const targets = [...choices(), button("MUSEUM"), button("HOME")];
    expect(targets.filter((target) => leastSide(target) < 48).map((target) => target.textContent)).toEqual([]);
  });

  it("names each dinosaur large, in a size its card's width keeps every name in, in every language", () => {
    openSkeletonsApp();

    // jsdom works out no size from a card's width, so the size is read as
    // app.css gives it: at most a cap, otherwise the card's width, less the
    // name's sides, over a width in ems no name is wider than, which jsdom
    // keeps as a multiplication by its inverse.
    const name = choices()[0]?.querySelector(".skeleton-choice-name") ?? document.body;
    const style = getComputedStyle(name);
    const size = /^min\((\d+)px, ([\d.]+) \* \(100cqi - (\d+)px\)\)$/.exec(style.fontSize);
    expect([size?.[1], size?.[3]].map(Number)).toEqual([30, parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)]);
    expect(style.whiteSpace).toBe("nowrap");
    const ems = 1 / Number(size?.[2]);
    const names = SHIPPED_SKELETONS.flatMap(({ name: { en, ru } }) => [en.toLocaleUpperCase("en"), ru.toLocaleUpperCase("ru")]);
    expect(names.filter((each) => !((NAME_EMS[each] ?? Infinity) <= ems))).toEqual([]);
  });

  it("lays the dinosaurs in rows of three, a card a third of the row however many there are, the last row centred", () => {
    openSkeletonsApp();

    const row = getComputedStyle(choices()[0]?.parentElement ?? document.body);
    const gap = parseFloat(row.gap.split(" ").at(-1) ?? "");
    expect([row.flexWrap, row.justifyContent]).toEqual(["wrap", "center"]);
    expect(choices().map((choice) => [getComputedStyle(choice).flexBasis, getComputedStyle(choice).flexGrow])).toEqual(
      choices().map(() => [`calc(${1 / 3}*(100% - ${2 * gap}px))`, "0"])
    );
  });

  it("goes home on HOME", async () => {
    const { user } = openSkeletonsApp();

    await user.click(button("HOME"));

    expect(gameDoor("COMPARE")).toBeDefined();
  });

  it.each(LANGUAGES)("reads in the device's language, %s, its names in capitals", (language) => {
    openSkeletonsApp({ deviceLanguage: language === "ru" ? "ru-RU" : "en-GB" });
    const text = TEXTS[language];

    expect(screen.getByRole("heading").textContent).toBe(text.skeletonTitle);
    expect([button(text.museum), button(text.home)].map((each) => each.textContent)).toEqual([text.museum, text.home]);
    expect(choices(text.dinosaurs).map((choice) => choice.textContent)).toEqual(SHIPPED_SKELETONS.map(({ name }) => name[language].toLocaleUpperCase(language)));
  });
});

describe("choosing a dinosaur", () => {
  it.each(SHIPPED_SKELETONS.map(({ id, name }, at) => [name.en, id, NAMES[at] ?? ""] as const))(
    "starts the %s puzzle at once, its outline and pieces shimmering until they have loaded",
    async (_, id, shown) => {
      const { user, pictures } = openSkeletonsApp();

      await user.click(button(shown));

      // A picture the home page showed has loaded already.
      const loading = puzzlePictures(id).map((url) => pictures.loading().includes(url));
      expect([screen.getByRole("heading").textContent, looks()]).toEqual([shown, loading.map((still) => (still ? "loading" : "shown"))]);
      act(() => finishLoading(pictures));
      expect(looks()).toEqual(loading.map((still) => (still ? "appearing" : "shown")));
    }
  );

  it("shows the faint full outline, the four pieces in a tray beside it, the right way up, none placed, MUSEUM and HOME", async () => {
    const { user, pictures } = openSkeletonsApp();

    await user.click(button("TRICERATOPS"));
    act(() => finishLoading(pictures));

    const outline = board().querySelector(".skeleton-outline img");
    expect(outline?.getAttribute("src")).toBe(fakeSkeletonPicture("triceratops", "skeleton"));
    expect(Number(getComputedStyle(outline?.parentElement ?? document.body).opacity)).toBeLessThan(0.5);
    const pieces = within(tray()).getAllByRole("img");
    expect(pieces.map((piece) => [piece.getAttribute("alt"), piece.getAttribute("src")])).toEqual(
      ["SKULL", "SPINE", "LEGS", "TAIL"].map((name) => [name, fakeSkeletonPicture("triceratops", name.toLowerCase())])
    );
    expect(pieces.flatMap((piece) => [piece, piece.parentElement ?? piece]).map((each) => [getComputedStyle(each).rotate, getComputedStyle(each).transform])).toEqual(
      Array.from({ length: 8 }, () => ["none", "none"])
    );
    expect(slots()).toEqual([
      ["skull", "empty"],
      ["spine", "empty"],
      ["legs", "empty"],
      ["tail", "empty"]
    ]);
    expect(board().querySelectorAll("img")).toHaveLength(1);
    const fitted = screen.getByLabelText("BONES IN PLACE");
    expect([symbolOf(fitted), fitted.textContent]).toEqual(["bone", "0/4"]);
    expect([symbolOf(button("MUSEUM")), symbolOf(button("HOME"))]).toEqual(["landmark", "house"]);
  });

  it("places each slot where its piece goes in the skeleton's frame, so the four make the whole skeleton", async () => {
    const { user, pictures } = openSkeletonsApp();
    await user.click(button("STEGOSAURUS"));
    act(() => finishLoading(pictures));

    const stegosaurus = SHIPPED_SKELETONS.find(({ id }) => id === "stegosaurus");
    if (!stegosaurus) throw new Error("No stegosaurus skeleton is shipped");
    const { frame, cuts } = stegosaurus;
    const percent = (part: number, whole: number) => `${(part / whole) * 100}%`;
    const shown = [...board().querySelectorAll<HTMLElement>(".skeleton-slot")].map(({ style }) => [style.left, style.top, style.width, style.height]);
    expect(shown).toEqual(
      cuts.hatchling.map(({ place: { x, y, width, height } }) => [
        percent(x, frame.width),
        percent(y, frame.height),
        percent(width, frame.width),
        percent(height, frame.height)
      ])
    );
  });

  it("starts one puzzle at once on a quick double tap, counted once, earning no star or exhibit", async () => {
    const { counted, startCounter } = countedStarts();
    const { user, storage } = openSkeletonsApp({ startCounter });

    await user.dblClick(button("TYRANNOSAURUS"));

    expect([screen.getByRole("heading").textContent, counted]).toEqual(["TYRANNOSAURUS", ["skeletons"]]);
    expect(slots().map(([, state]) => state)).toEqual(["empty", "empty", "empty", "empty"]);
    expect(within(tray()).getAllByRole("img")).toHaveLength(4);
    expect([...storage.items.keys()]).toEqual([]);
  });

  // In a browser the puzzle shows after its transition, so a second choice
  // can land on the choice screen still shown: here both land in one act,
  // before React renders. A key's click has no pointer's detail, so the
  // double-tap filter lets both through to the game.
  it("starts one puzzle, the first tapped's, counted once, for two choices landing before the puzzle shows", () => {
    const { counted, startCounter } = countedStarts();
    openSkeletonsApp({ startCounter });
    const tapped = [button("TYRANNOSAURUS"), button("TRICERATOPS")];

    act(() => tapped.forEach((each) => fireEvent.click(each, { detail: 0 })));

    expect([screen.getByRole("heading").textContent, counted]).toEqual(["TYRANNOSAURUS", ["skeletons"]]);
  });

  it("goes home from the puzzle on HOME", async () => {
    const { user, pictures } = openSkeletonsApp();
    await user.click(button("TRICERATOPS"));
    act(() => finishLoading(pictures));

    await user.click(button("HOME"));

    expect(gameDoor("COMPARE")).toBeDefined();
  });

  it.each(LANGUAGES)("reads in %s, its title the dinosaur's name in capitals", async (language) => {
    const { user, pictures } = openSkeletonsApp({ deviceLanguage: language === "ru" ? "ru-RU" : "en-GB" });
    const text = TEXTS[language];
    const triceratops = SHIPPED_SKELETONS.find(({ id }) => id === "triceratops")?.name[language].toLocaleUpperCase(language) ?? "";

    await user.click(button(triceratops));
    act(() => finishLoading(pictures));

    expect(screen.getByRole("heading").textContent).toBe(triceratops);
    expect(within(tray(text.bones)).getAllByRole("img").map((piece) => piece.getAttribute("alt"))).toEqual(HATCHLING_NAMES[language]);
    expect(screen.getByLabelText(text.fitted).textContent).toBe("0/4");
    expect([button(text.museum), button(text.home)]).toHaveLength(2);
    expect(board(text.skeleton)).toBeDefined();
  });
});
