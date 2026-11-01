import { act, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AgeLevel } from "../src/ageLevel.ts";
import { AGE_LEVEL_KEY } from "../src/localAgeLevel.ts";
import { REVEAL } from "../src/skeletonGame.tsx";
import type { SkeletonSound } from "../src/skeletonSounds.ts";
import { choices, finishLoading, shownTexts, fitAll, keptSkeletons, layOutPuzzle, openSkeletonsApp, reveal, savedSkeletons, skeletonOf, slots, type SkeletonsAppOptions } from "./skeletonsApp.tsx";
import { memoryStorage } from "./support.ts";

// skeleton-assembly-mystery.feature: once a skeleton has its star, a
// mystery skeleton is built with its name hidden, then guessed.

const levelOf = (level: AgeLevel) => memoryStorage({ [AGE_LEVEL_KEY]: JSON.stringify({ level, revision: `picked-${level}` }) });

const starred = (earned: string[]) => keptSkeletons({ earned, bestScore: earned.length, rebuilding: [] });

const MYSTERY = "MYSTERY SKELETON";
const WHOSE = "WHOSE SKELETON IS IT?";

// A draw that picks Triceratops, the second of two skeletons with a star.
const LATER = () => 0.6;

// The skeleton game opened with a spy for its sounds, Tyrannosaurus and
// Triceratops with their stars, its mystery's puzzle open.
async function openMystery(options: SkeletonsAppOptions = {}) {
  const heard: SkeletonSound[] = [];
  const opened = openSkeletonsApp({ storage: starred(["tyrannosaurus", "triceratops"]), random: LATER, skeletonSounds: { play: (sound) => heard.push(sound) }, ...options });
  await opened.user.click(screen.getByRole("button", { name: shownTexts().mystery }));
  act(() => finishLoading(opened.pictures));
  layOutPuzzle();
  return { ...opened, heard };
}

// The mystery Triceratops finished and its pause over, asking whose
// skeleton it is.
async function openGuess(options: SkeletonsAppOptions = {}) {
  const opened = await openMystery(options);
  fitAll(skeletonOf("triceratops"));
  act(() => opened.pictures.fire(REVEAL.motion));
  return opened;
}

const guesses = () => within(screen.getByRole("group", { name: shownTexts().whoseSkeleton })).getAllByRole("button");
const title = () => screen.getByRole("heading", { level: 1 }).textContent;

describe("the mystery skeleton", () => {
  it("is not offered until a skeleton has its star", () => {
    openSkeletonsApp();

    expect(screen.queryByRole("button", { name: MYSTERY })).toBeNull();
  });

  it("is offered after the dinosaurs once a skeleton has its star", () => {
    openSkeletonsApp({ storage: starred(["stegosaurus"]) });

    expect(choices().map((choice) => choice.getAttribute("aria-label"))).toEqual(["TYRANNOSAURUS", "TRICERATOPS", "STEGOSAURUS", "BRACHIOSAURUS", "SPINOSAURUS", MYSTERY]);
    expect(within(choices()[5] as HTMLElement).queryByRole("img")).toBeNull();
  });

  it("builds a skeleton with a star, cut for the level the switch shows, its name hidden", async () => {
    await openMystery({ ageLevels: levelOf("explorer") });

    expect(title()).toBe("?");
    expect(slots().map(([piece]) => piece)).toEqual(skeletonOf("triceratops").cuts.explorer?.map(({ id }) => id));
  });

  it("stomps and roars as it is finished, then asks whose skeleton it is from three dinosaurs, itself among them", async () => {
    const { heard, pictures } = await openMystery();
    fitAll(skeletonOf("triceratops"));

    expect(heard.at(-1)).toBe("roar");
    expect(screen.queryByRole("group", { name: WHOSE })).toBeNull();

    act(() => pictures.fire(REVEAL.motion));

    expect(title()).toBe(WHOSE);
    expect(guesses()).toHaveLength(3);
    expect(guesses().map((guess) => guess.getAttribute("aria-label"))).toContain("TRICERATOPS");
    expect(screen.getByRole("status").textContent).toBe("");
    expect(reveal()).toBeNull();
  });

  it("boings a wrong guess, rests it aside and gives the clue, and guessing goes on", async () => {
    const { heard, user } = await openGuess();
    const wrong = guesses().find((guess) => guess.getAttribute("aria-label") !== "TRICERATOPS") as HTMLElement;
    const name = wrong.getAttribute("aria-label");

    await user.click(wrong);

    expect(heard.at(-1)).toBe("boing");
    expect([wrong.hasAttribute("disabled"), wrong.hasAttribute("data-wrong"), wrong.getAttribute("aria-label")]).toEqual([true, true, `${name}: TRY ANOTHER`]);
    expect(screen.getByRole("status").textContent).toBe("LOOK AT ITS THREE HORNS!");
    expect(guesses().filter((guess) => !guess.hasAttribute("disabled"))).toHaveLength(2);
    expect(reveal()).toBeNull();
  });

  it("gives the clue in Russian", async () => {
    const { user } = await openGuess({ deviceLanguage: "ru-RU" });

    await user.click(guesses().find((guess) => guess.getAttribute("aria-label") !== "ТРИЦЕРАТОПС") as HTMLElement);

    expect(screen.getByRole("status").textContent).toBe("ПОСМОТРИ НА ТРИ РОГА!");
  });

  it("reveals the dinosaur on the right guess, with no new star", async () => {
    const { user, storage } = await openGuess();

    await user.click(screen.getByRole("button", { name: "TRICERATOPS" }));

    expect(reveal()).not.toBeNull();
    expect(title()).toBe("TRICERATOPS");
    expect(document.querySelector(".skeleton-star[data-new]")).toBeNull();
    expect(savedSkeletons(storage).earned).toEqual(["tyrannosaurus", "triceratops"]);
  });

  it("leaves the guess for the choice of dinosaurs with BACK, every star as before", async () => {
    const { user, storage } = await openGuess();

    await user.click(screen.getByRole("button", { name: "BACK" }));

    expect(choices().at(-1)?.getAttribute("aria-label")).toBe(MYSTERY);
    expect(savedSkeletons(storage).earned).toEqual(["tyrannosaurus", "triceratops"]);
  });
});
