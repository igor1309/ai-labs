import { act, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PIECES, type Piece } from "../src/skeletons/index.ts";
import { SNAP } from "../src/SkeletonPuzzleScreen.tsx";
import {
  AWAY,
  BOARD_AT,
  board,
  cancel,
  dragTo,
  fit,
  fittedPieces,
  homeOf,
  layOutPuzzle,
  lifted,
  moveTo,
  openPuzzle,
  press,
  release,
  skeletonOf,
  slotOf,
  slots,
  spotOf,
  spots,
  trayPieces
} from "./skeletonsApp.tsx";
import { symbolOf, words } from "./support.ts";

const TYRANNOSAURUS = skeletonOf("tyrannosaurus");

const ALL = ["SKULL", "SPINE", "LEGS", "TAIL"];

const fittedChip = () => screen.getByLabelText("BONES IN PLACE").textContent;

// A touch target's least side, as app.css gives it: jsdom lays nothing
// out, so it is read from the sizes and least sizes the stylesheet sets.
const leastSide = (element: Element) => {
  const style = getComputedStyle(element);
  const side = (size: string, least: string) => Math.max(parseFloat(size) || 0, parseFloat(least) || 0);
  return Math.min(side(style.width, style.minWidth), side(style.height, style.minHeight));
};

// A piece picked up from its spot in the tray, still held.
function pickUp(piece: Piece, pointerId = 1) {
  const { left, top } = spotOf(piece).getBoundingClientRect();
  press(spotOf(piece), { clientX: left + 40, clientY: top + 40 }, pointerId);
}

describe("picking up a bone", () => {
  it("gives every piece in the tray a touch target of at least 48 by 48 CSS pixels, which never scrolls the page", async () => {
    await openPuzzle("TYRANNOSAURUS");

    expect(spots().map((spot) => [leastSide(spot) >= 48, getComputedStyle(spot).getPropertyValue("touch-action")])).toEqual(PIECES.map(() => [true, "none"]));
  });

  it("draws the piece pressed under the finger at its size on the board, the right way up, and moves it with the finger alone", async () => {
    await openPuzzle("TYRANNOSAURUS");
    const { width, height } = TYRANNOSAURUS.places.spine;
    const scale = BOARD_AT.width / TYRANNOSAURUS.frame.width;

    pickUp("spine");
    moveTo({ clientX: 500, clientY: 300 });

    const piece = lifted();
    expect([piece?.querySelector("img")?.getAttribute("src"), piece?.getAttribute("data-piece")]).toEqual(["/skeletons/tyrannosaurus/spine.webp", "spine"]);
    expect([piece?.style.width, piece?.style.height, piece?.style.translate]).toEqual([
      `${width * scale}px`,
      `${height * scale}px`,
      `${500 - (width * scale) / 2}px ${300 - (height * scale) / 2}px`
    ]);
    expect([getComputedStyle(piece ?? document.body).rotate, getComputedStyle(piece ?? document.body).position]).toEqual(["none", "fixed"]);

    moveTo({ clientX: 640, clientY: 420 });

    expect(lifted()?.style.translate).toBe(`${640 - (width * scale) / 2}px ${420 - (height * scale) / 2}px`);
    // The other pieces keep their spots; the one held leaves its own empty
    // to the eye, in place.
    expect(trayPieces()).toEqual(ALL);
    expect(spots().map((spot) => spot.querySelector(".skeleton-piece")?.hasAttribute("data-held"))).toEqual([false, true, false, false]);
    expect(getComputedStyle(spotOf("spine").querySelector(".skeleton-piece") ?? document.body).opacity).toBe("0");
    expect(slotOf("spine").hasAttribute("data-target")).toBe(true);
    expect(fittedPieces()).toEqual([]);
  });
});

describe("dropping a bone", () => {
  it.each(["TYRANNOSAURUS", "TRICERATOPS", "STEGOSAURUS"])(
    "has %s's four pieces in the tray and four home slots, each piece fitting its own within 24 CSS pixels and no other",
    async (name) => {
      await openPuzzle(name);
      const skeleton = skeletonOf(name.toLowerCase());

      expect(trayPieces()).toEqual(ALL);
      expect(slots().map(([piece]) => piece)).toEqual([...PIECES]);

      for (const piece of PIECES) {
        for (const other of PIECES.filter((each) => each !== piece)) dragTo(piece, homeOf(skeleton, other));
      }
      expect(fittedPieces()).toEqual([]);

      const offsets = [
        [24, 0],
        [0, -24],
        [-24, 0],
        [17, 17]
      ] as const;
      PIECES.forEach((piece, at) => {
        const [dx, dy] = offsets[at] ?? [0, 0];
        dragTo(piece, homeOf(skeleton, piece, dx, dy));
      });
      expect(fittedPieces()).toEqual([...PIECES]);
    }
  );

  it("snaps a near miss into exact alignment with its slot, sliding it there from where it was let go", async () => {
    await openPuzzle("TYRANNOSAURUS");

    dragTo("skull", homeOf(TYRANNOSAURUS, "skull", 36, 24));

    // The bone moves on its picture's wrapper.
    const skull = slotOf("skull").querySelector<HTMLElement>(".skeleton-fitted");
    const from = (axis: string) => parseFloat(skull?.style.getPropertyValue(`--from-${axis}`) ?? "");
    expect([skull?.querySelector("img")?.getAttribute("alt"), skull?.hasAttribute("data-snapped"), from("x"), from("y")]).toEqual(["SKULL", true, expect.closeTo(36, 6), expect.closeTo(24, 6)]);
    // The fitted piece fills its slot exactly.
    expect([getComputedStyle(skull ?? document.body).width, getComputedStyle(skull ?? document.body).height]).toEqual(["100%", "100%"]);
    expect(trayPieces()).toEqual(["SPINE", "LEGS", "TAIL"]);
    expect(spotOf("skull").children).toHaveLength(0);
    expect(fittedChip()).toBe("1/4");
    expect(lifted()).toBeNull();
  });

  it("fits within its snap radius and not beyond it", async () => {
    await openPuzzle("TYRANNOSAURUS");

    dragTo("tail", homeOf(TYRANNOSAURUS, "tail", SNAP + 1, 0));
    dragTo("legs", homeOf(TYRANNOSAURUS, "legs", 0, SNAP - 1));

    expect(fittedPieces()).toEqual(["legs"]);
  });

  it("floats a piece dropped in another bone's snap area back to its spot in the tray, without a cross or a word, and lets the child try again", async () => {
    await openPuzzle("TYRANNOSAURUS");
    const legs = homeOf(TYRANNOSAURUS, "legs");
    const before = document.body.textContent;

    dragTo("skull", legs);

    const skull = spotOf("skull").querySelector<HTMLElement>(".skeleton-piece");
    const { left, top, width, height } = spotOf("skull").getBoundingClientRect();
    expect([skull?.hasAttribute("data-returning"), skull?.style.getPropertyValue("--from-x"), skull?.style.getPropertyValue("--from-y")]).toEqual([
      true,
      `${legs.clientX - (left + width / 2)}px`,
      `${legs.clientY - (top + height / 2)}px`
    ]);
    expect(fittedPieces()).toEqual([]);
    expect(trayPieces()).toEqual(ALL);
    expect(document.body.textContent).toBe(before);
    expect([...document.querySelectorAll("svg.lucide")].map((symbol) => symbolOf(symbol.parentElement ?? symbol))).not.toContain("x");

    fit(TYRANNOSAURUS, "skull");

    expect(fittedPieces()).toEqual(["skull"]);
  });

  it("floats a piece dropped away from every slot back to the tray, keeping the pieces already fitted", async () => {
    await openPuzzle("TRICERATOPS");
    const triceratops = skeletonOf("triceratops");
    fit(triceratops, "skull");
    fit(triceratops, "legs");

    dragTo("tail", AWAY);

    expect(fittedPieces()).toEqual(["skull", "legs"]);
    expect(trayPieces()).toEqual(["SPINE", "TAIL"]);
    expect(spotOf("tail").querySelector(".skeleton-piece")?.hasAttribute("data-returning")).toBe(true);
    expect(fittedChip()).toBe("2/4");
  });

  it("fits the pieces in any order, each only in its own slot, until the skeleton is complete", async () => {
    await openPuzzle("STEGOSAURUS");
    const stegosaurus = skeletonOf("stegosaurus");

    const seen = (["tail", "skull", "spine", "legs"] as const).map((piece) => {
      dragTo(piece, homeOf(stegosaurus, piece === "skull" ? "spine" : "skull"));
      fit(stegosaurus, piece);
      return [fittedPieces(), board().hasAttribute("data-complete")];
    });

    expect(seen).toEqual([
      [["tail"], false],
      [["skull", "tail"], false],
      [["skull", "spine", "tail"], false],
      [["skull", "spine", "legs", "tail"], true]
    ]);
    expect(trayPieces()).toEqual([]);
    expect(fittedChip()).toBe("4/4");
  });

  it("never lets a fitted piece be pulled out: only pieces in the tray can be picked up", async () => {
    await openPuzzle("TYRANNOSAURUS");
    fit(TYRANNOSAURUS, "skull");
    const skull = slotOf("skull").querySelector("img") ?? document.body;

    press(skull, homeOf(TYRANNOSAURUS, "skull"));
    moveTo(AWAY);
    press(spotOf("skull"), homeOf(TYRANNOSAURUS, "skull"));
    moveTo(AWAY);
    release(AWAY);

    expect(lifted()).toBeNull();
    expect(fittedPieces()).toEqual(["skull"]);
    expect(fittedChip()).toBe("1/4");
  });
});

describe("a second finger", () => {
  it("neither picks up nor drops another piece while one is held, and the one held fits once", async () => {
    await openPuzzle("TYRANNOSAURUS");

    pickUp("skull", 1);
    moveTo({ clientX: 300, clientY: 300 }, 1);
    pickUp("spine", 2);
    moveTo(homeOf(TYRANNOSAURUS, "spine"), 2);
    release(homeOf(TYRANNOSAURUS, "spine"), 2);

    expect(lifted()?.getAttribute("data-piece")).toBe("skull");
    expect(fittedPieces()).toEqual([]);

    moveTo(homeOf(TYRANNOSAURUS, "skull"), 1);
    release(homeOf(TYRANNOSAURUS, "skull"), 1);
    release(homeOf(TYRANNOSAURUS, "skull"), 1);

    expect(fittedPieces()).toEqual(["skull"]);
    expect(trayPieces()).toEqual(["SPINE", "LEGS", "TAIL"]);
    expect(fittedChip()).toBe("1/4");
  });
});

describe("an interrupted drag", () => {
  it("returns the piece to the tray when its touch is cancelled, even over its slot, and the piece can be picked up again", async () => {
    await openPuzzle("TYRANNOSAURUS");
    fit(TYRANNOSAURUS, "skull");
    fit(TYRANNOSAURUS, "spine");

    pickUp("legs");
    moveTo(homeOf(TYRANNOSAURUS, "legs"));
    cancel(homeOf(TYRANNOSAURUS, "legs"));

    expect(lifted()).toBeNull();
    expect(fittedPieces()).toEqual(["skull", "spine"]);
    expect(trayPieces()).toEqual(["LEGS", "TAIL"]);

    fit(TYRANNOSAURUS, "legs");

    expect(fittedPieces()).toEqual(["skull", "spine", "legs"]);
  });

  it("pauses in portrait behind the picture asking to turn the iPad, cancelling the drag, and resumes as it was", async () => {
    const { orientation, storage } = await openPuzzle("TYRANNOSAURUS");
    fit(TYRANNOSAURUS, "skull");
    fit(TYRANNOSAURUS, "tail");
    pickUp("legs");
    moveTo(homeOf(TYRANNOSAURUS, "legs"));

    act(() => orientation.turn("portrait"));

    expect(screen.getByRole("img", { name: "TURN THE IPAD SIDEWAYS" })).toBeDefined();
    expect([screen.queryByRole("group", { name: "SKELETON" }), screen.queryAllByRole("button"), lifted()]).toEqual([null, [], null]);
    release(homeOf(TYRANNOSAURUS, "legs"));

    act(() => orientation.turn("landscape"));
    layOutPuzzle();

    expect(fittedPieces()).toEqual(["skull", "tail"]);
    expect(trayPieces()).toEqual(["SPINE", "LEGS"]);
    expect(board().hasAttribute("data-complete")).toBe(false);
    expect([...storage.items.keys()]).toEqual([]);
    expect(words(screen.getByLabelText("BONES IN PLACE"))).toBe("2/4");
  });
});
