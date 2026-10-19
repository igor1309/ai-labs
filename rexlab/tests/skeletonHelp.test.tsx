import { act, fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { REVEAL } from "../src/skeletonGame.tsx";
import {
  AWAY,
  board,
  dragTo,
  finishLoading,
  fit,
  fittedPieces,
  hints,
  homeOf,
  keptSkeletons,
  layOutPuzzle,
  lifted,
  moveTo,
  openPuzzle,
  press,
  release,
  reveal,
  revealNow,
  savedSkeletons,
  skeletonOf,
  slotOf,
  spotOf,
  trayPieces
} from "./skeletonsApp.tsx";
import { words, type ManualPictures, homeTile } from "./support.ts";

const TYRANNOSAURUS = skeletonOf("tyrannosaurus");

// `seconds` seconds at the puzzle: the game counts its time towards help
// by a timer of a second, started anew each time it fires.
function spend(pictures: ManualPictures, seconds: number) {
  for (let second = 0; second < seconds; second++) {
    expect(pictures.timers()).toEqual([1000]);
    act(() => pictures.fire(1000));
  }
}

describe("help after waiting", () => {
  it("shows nothing for nine seconds without a fit, then glows one empty slot and its piece in the tray alike, placing nothing", async () => {
    const { pictures } = await openPuzzle("TYRANNOSAURUS");

    spend(pictures, 9);
    expect(hints()).toEqual([]);

    spend(pictures, 1);

    expect(hints()).toEqual(["slot skull", "spot skull"]);
    const glows = [slotOf("skull"), spotOf("skull")].map((element) => element.querySelector(".skeleton-glow"));
    expect(glows.map((glow) => [glow?.getAttribute("aria-hidden"), words(glow as HTMLElement)])).toEqual([
      ["true", ""],
      ["true", ""]
    ]);
    expect(getComputedStyle(glows[0] ?? document.body).outline).toBe(getComputedStyle(glows[1] ?? document.body).outline);
    expect(fittedPieces()).toEqual([]);
    expect(trayPieces()).toEqual(["SKULL", "SPINE", "LEGS", "TAIL"]);
    // Help due counts no more time.
    expect(pictures.timers()).toEqual([]);
  });

  it("is not put off by drops that miss", async () => {
    const { pictures } = await openPuzzle("TYRANNOSAURUS");
    spend(pictures, 8);

    dragTo("skull", homeOf(TYRANNOSAURUS, "legs"));
    spend(pictures, 1);
    dragTo("tail", AWAY);
    spend(pictures, 1);

    expect(hints()).toEqual(["slot skull", "spot skull"]);
    expect(fittedPieces()).toEqual([]);
  });

  it("waits for a held piece to be let go, then shows as it floats back to the tray", async () => {
    const { pictures } = await openPuzzle("TYRANNOSAURUS");
    const { left, top } = spotOf("spine").getBoundingClientRect();
    press(spotOf("spine"), { clientX: left + 40, clientY: top + 40 });
    moveTo({ clientX: 400, clientY: 300 });

    spend(pictures, 10);

    expect(hints()).toEqual([]);
    expect(lifted()?.getAttribute("data-piece")).toBe("spine");

    release(AWAY);

    expect(spotOf("spine").querySelector(".skeleton-piece")?.hasAttribute("data-returning")).toBe(true);
    expect(hints()).toEqual(["slot skull", "spot skull"]);
  });

  it("clears as a piece fits, waits ten more seconds, then points only at a piece still to fit", async () => {
    const { pictures } = await openPuzzle("TYRANNOSAURUS");
    spend(pictures, 10);

    fit(TYRANNOSAURUS, "skull");

    expect(hints()).toEqual([]);
    spend(pictures, 9);
    expect(hints()).toEqual([]);
    spend(pictures, 1);
    expect(hints()).toEqual(["slot spine", "spot spine"]);

    fit(TYRANNOSAURUS, "tail");

    expect(hints()).toEqual([]);
    spend(pictures, 10);
    expect(hints()).toEqual(["slot spine", "spot spine"]);
  });

  it("counts no time while the app is hidden", async () => {
    const { pictures, visibility } = await openPuzzle("TYRANNOSAURUS");
    spend(pictures, 4);

    act(() => visibility.switchTo("hidden"));

    expect(pictures.timers()).toEqual([]);
    act(() => visibility.switchTo("visible"));
    spend(pictures, 5);
    expect(hints()).toEqual([]);
    spend(pictures, 1);
    expect(hints()).toEqual(["slot skull", "spot skull"]);
    expect(fittedPieces()).toEqual([]);
  });

  it("counts no time while the iPad is in portrait, and keeps the pieces as they were", async () => {
    const { pictures, orientation } = await openPuzzle("TYRANNOSAURUS");
    fit(TYRANNOSAURUS, "legs");
    spend(pictures, 4);

    act(() => orientation.turn("portrait"));

    expect(pictures.timers()).toEqual([]);
    act(() => orientation.turn("landscape"));
    layOutPuzzle();
    expect(fittedPieces()).toEqual(["legs"]);
    spend(pictures, 5);
    expect(hints()).toEqual([]);
    spend(pictures, 1);
    expect(hints()).toEqual(["slot skull", "spot skull"]);
  });

  it("counts no time once the child has gone home", async () => {
    const { pictures, user } = await openPuzzle("TYRANNOSAURUS");
    spend(pictures, 3);

    await user.click(screen.getByRole("button", { name: "HOME" }));

    expect(homeTile("COMPARE")).toBeDefined();
    expect(pictures.timers()).toEqual([]);
  });

  // The tap and the timers read in one act, while the puzzle is still on
  // the screen: help's timer stops as the child leaves, not as the puzzle
  // is taken off the screen.
  it("stops as the child goes home, and the next puzzle's help is not moved on by the tick, delivered all the same", async () => {
    const { pictures, user } = await openPuzzle("TYRANNOSAURUS");
    spend(pictures, 9);

    let left: [number[], boolean] = [[], false];
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "HOME" }));
      left = [pictures.timers(), document.contains(board())];
    });
    fireEvent.click(homeTile("SKELETONS"));
    await user.click(screen.getByRole("button", { name: "TYRANNOSAURUS" }));
    act(() => finishLoading(pictures));
    layOutPuzzle();
    act(() => pictures.deliverStopped(1000));

    expect(left).toEqual([[], true]);
    expect(hints()).toEqual([]);
    spend(pictures, 9);
    expect(hints()).toEqual([]);
    spend(pictures, 1);
    expect(hints()).toEqual(["slot skull", "spot skull"]);
    fit(TYRANNOSAURUS, "skull");
    expect(fittedPieces()).toEqual(["skull"]);
  });

  it("needs ten more seconds after a fit just before a tick, the tick it stopped delivered all the same", async () => {
    const { pictures } = await openPuzzle("TYRANNOSAURUS");
    spend(pictures, 9);

    fit(TYRANNOSAURUS, "skull");
    act(() => pictures.deliverStopped(1000));

    expect(hints()).toEqual([]);
    spend(pictures, 9);
    expect(hints()).toEqual([]);
    spend(pictures, 1);
    expect(hints()).toEqual(["slot spine", "spot spine"]);
  });

  it("completes the skeleton after help, many missed drops and help again, with no time, count or failure shown, and rewards it in full", async () => {
    const { pictures, storage, user } = await openPuzzle("TYRANNOSAURUS", { storage: keptSkeletons({ earned: ["triceratops"], bestScore: 1, rebuilding: [] }) });
    const before = document.body.textContent;
    spend(pictures, 10);
    for (let tries = 0; tries < 20; tries++) dragTo("skull", homeOf(TYRANNOSAURUS, "tail"));

    for (const piece of ["skull", "spine", "legs", "tail"] as const) {
      fit(TYRANNOSAURUS, piece);
      if (piece !== "tail") spend(pictures, 10);
    }

    expect(board().hasAttribute("data-complete")).toBe(true);
    expect(fittedPieces()).toEqual(["skull", "spine", "legs", "tail"]);
    expect(hints()).toEqual([]);
    // Only the reveal's pause: help counts no more time.
    expect(pictures.timers()).toEqual([REVEAL.motion]);
    expect(document.body.textContent).toBe(before?.replace("0/4", "4/4"));
    expect(savedSkeletons(storage)).toEqual({ earned: ["tyrannosaurus", "triceratops"], bestScore: 2, rebuilding: [] });

    revealNow(pictures, "tyrannosaurus");

    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("TYRANNOSAURUS");
    expect(screen.getByRole("img", { name: "STAR" }).hasAttribute("data-new")).toBe(true);
    expect([screen.getByLabelText("STARS").textContent, screen.queryByLabelText("BEST SCORE")?.textContent, screen.queryByRole("status")?.getAttribute("aria-label")]).toEqual([
      "2/3",
      "BEST12/3",
      "NEW BEST SCORE"
    ]);

    await user.click(within(reveal() ?? document.body).getByRole("button", { name: "MUSEUM" }));

    expect(within(screen.getByRole("group", { name: "STANDS" })).getAllByRole("region").map((stand) => stand.getAttribute("data-state"))).toEqual(["built", "built", "empty"]);
    expect(savedSkeletons(storage)).toEqual({ earned: ["tyrannosaurus", "triceratops"], bestScore: 2, rebuilding: [] });
  });
});
