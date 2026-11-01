import { act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AgeLevel } from "../src/ageLevel.ts";
import { AGE_LEVEL_KEY } from "../src/localAgeLevel.ts";
import { REVEAL } from "../src/skeletonGame.tsx";
import type { SkeletonSound } from "../src/skeletonSounds.ts";
import { AWAY, board, dragTo, fit, homeOf, openPuzzle, press, reveal, skeletonOf, slotOf, spotOf, type SkeletonsAppOptions } from "./skeletonsApp.tsx";
import { memoryStorage } from "./support.ts";

// skeleton-assembly-alive.feature: every pick-up, fit and miss is heard
// and moves, and the finished skeleton stomps and roars before its body
// shows.

const levelOf = (level: AgeLevel) => memoryStorage({ [AGE_LEVEL_KEY]: JSON.stringify({ level, revision: `picked-${level}` }) });

// The puzzle opened with a spy for its sounds, each sound in the order
// played.
async function openHeard(name: string, options: SkeletonsAppOptions = {}) {
  const heard: SkeletonSound[] = [];
  const opened = await openPuzzle(name, { ...options, skeletonSounds: { play: (sound) => heard.push(sound) } });
  return { ...opened, heard };
}

const settled = (piece: string) => slotOf(piece).querySelector(".skeleton-fitted[data-snapped]") !== null;

describe("the skeleton coming alive", () => {
  it("plays a pick-up sound as a bone is pressed in the tray", async () => {
    const { heard } = await openHeard("TYRANNOSAURUS");

    const spot = spotOf("spine");
    const { left, top } = spot.getBoundingClientRect();
    press(spot, { clientX: left + 40, clientY: top + 40 });

    expect(heard).toEqual(["lift"]);
  });

  it("snaps a fitted skull's jaw, swishes a fitted tail and clicks any other bone home", async () => {
    const { heard } = await openHeard("TYRANNOSAURUS");
    const tyrannosaurus = skeletonOf("tyrannosaurus");

    for (const piece of ["skull", "tail", "spine"]) fit(tyrannosaurus, piece);

    expect(heard).toEqual(["lift", "jaw", "lift", "click", "lift", "click"]);
    expect(["skull", "tail", "spine"].map((piece) => [slotOf(piece).getAttribute("data-area"), settled(piece)])).toEqual([
      ["head", true],
      ["tail", true],
      ["back", true]
    ]);
  });

  it("boings a bone dropped beside the board back to the tray, nothing lost", async () => {
    const { heard } = await openHeard("TYRANNOSAURUS");

    dragTo("legs", AWAY);

    expect(heard).toEqual(["lift", "boing"]);
    expect(spotOf("legs").querySelector(".skeleton-piece[data-returning]")).not.toBeNull();
  });

  it("boings another dinosaur's bone back the same way at Paleontologist", async () => {
    const { heard } = await openHeard("TRICERATOPS", { ageLevels: levelOf("paleontologist") });

    dragTo("tyrannosaurus/head", homeOf(skeletonOf("triceratops"), "frill"));

    expect(heard).toEqual(["lift", "boing"]);
  });

  it.each([
    [false, REVEAL.motion],
    [true, REVEAL.reduced]
  ])("roars as the last bone fits and shows the body only after the stomp, reduced motion %s", async (reducedMotion, pause) => {
    const { heard, pictures } = await openHeard("TYRANNOSAURUS", { reducedMotion });
    const tyrannosaurus = skeletonOf("tyrannosaurus");
    for (const piece of ["spine", "legs", "tail"]) fit(tyrannosaurus, piece);

    fit(tyrannosaurus, "skull");

    expect(heard.slice(-3)).toEqual(["lift", "jaw", "roar"]);
    expect([board().hasAttribute("data-complete"), reveal()]).toEqual([true, null]);
    expect(pictures.timers()).toEqual([pause]);
    act(() => pictures.fire(pause));
    expect(reveal()).not.toBeNull();
  });

  it("plays the same, silent, with no sounds to make", async () => {
    const { pictures } = await openPuzzle("TYRANNOSAURUS");
    const tyrannosaurus = skeletonOf("tyrannosaurus");
    dragTo("legs", AWAY);
    for (const piece of ["skull", "spine", "legs", "tail"]) fit(tyrannosaurus, piece);

    act(() => pictures.fire(REVEAL.motion));
    expect(reveal()).not.toBeNull();
  });
});
