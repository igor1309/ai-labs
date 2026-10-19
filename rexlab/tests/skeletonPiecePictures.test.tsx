import { act, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PICTURE_LIMIT } from "../src/Picture.tsx";
import { AWAY, BOARD_AT, fit, fitAll, fittedPieces, homeOf, layOutPuzzle, lifted, moveTo, openSkeletonsApp, press, release, reveal, revealNow, skeletonOf, slotOf, spotOf, trayPieces } from "./skeletonsApp.tsx";
import { fakeSkeletonPicture, type ManualPictures } from "./support.ts";

// skeleton-assembly-pictures.feature: a bone whose picture is still
// loading, has taken over 8 s or has failed is lifted, fitted and floats
// back as any other, each place it is drawn in asking for its picture as
// a new place and counting its own 8 s.

const TYRANNOSAURUS = skeletonOf("tyrannosaurus");
const SKULL = fakeSkeletonPicture("tyrannosaurus", "skull");

const START: Array<[string, (pictures: ManualPictures) => void, string]> = [
  ["still loading", () => {}, "loading"],
  ["taking over 8 s", (pictures) => pictures.fire(PICTURE_LIMIT), "failed"],
  ["failed", (pictures) => pictures.fail(SKULL), "failed"]
];

// The puzzle open, every picture loaded but the skull's, which `start`
// leaves as it says.
async function openWithSkull(start: (pictures: ManualPictures) => void) {
  const opened = openSkeletonsApp();
  await opened.user.click(screen.getByRole("button", { name: "TYRANNOSAURUS" }));
  act(() => {
    for (const url of new Set(opened.pictures.loading())) if (url !== SKULL) opened.pictures.finish(url);
    start(opened.pictures);
  });
  layOutPuzzle();
  return opened.pictures;
}

const lookIn = (place: Element | null) => place?.querySelector("img")?.getAttribute("data-picture");
const asked = (pictures: ManualPictures) => pictures.loading().filter((url) => url === SKULL).length;

// Where the lifted skull is drawn, and where it is with the finger at
// `clientX`, `clientY`.
const scale = BOARD_AT.width / TYRANNOSAURUS.frame.width;
const { width, height } = TYRANNOSAURUS.places.skull;
const held = () => lifted()?.style.translate.split(" ").map(parseFloat);
const heldAt = (clientX: number, clientY: number) => [expect.closeTo(clientX - (width * scale) / 2), expect.closeTo(clientY - (height * scale) / 2)];

function lift(at = { clientX: 500, clientY: 300 }) {
  const { left, top } = spotOf("skull").getBoundingClientRect();
  press(spotOf("skull"), { clientX: left + 40, clientY: top + 40 });
  moveTo(at);
}

describe.each(START)("a bone whose picture is %s in the tray", (_, start, tray) => {
  it("is lifted as a new place, shimmering until its picture loads, then fades in and fits", async () => {
    const pictures = await openWithSkull(start);
    expect(lookIn(spotOf("skull"))).toBe(tray);

    lift();

    expect([lookIn(lifted()), asked(pictures), held()]).toEqual(["loading", 1, heldAt(500, 300)]);

    act(() => pictures.finish(SKULL));

    expect(lookIn(lifted())).toBe("appearing");

    moveTo(homeOf(TYRANNOSAURUS, "skull"));
    release(homeOf(TYRANNOSAURUS, "skull"));

    expect([fittedPieces(), lookIn(slotOf("skull").querySelector(".skeleton-fitted")), lifted()]).toEqual([["skull"], "shown", null]);
  });

  it("counts its own 8 s once lifted, moving with the finger in the failure look, and floats back and fits as any other", async () => {
    const pictures = await openWithSkull(start);
    lift();

    act(() => pictures.fire(PICTURE_LIMIT));
    moveTo({ clientX: 640, clientY: 420 });

    expect([lookIn(lifted()), held()]).toEqual(["failed", heldAt(640, 420)]);

    release(AWAY);

    const back = spotOf("skull").querySelector(".skeleton-piece");
    expect([back?.hasAttribute("data-returning"), lookIn(back), trayPieces()]).toEqual([true, "loading", ["SKULL", "SPINE", "LEGS", "TAIL"]]);

    act(() => pictures.fail(SKULL));
    lift(homeOf(TYRANNOSAURUS, "skull"));
    release(homeOf(TYRANNOSAURUS, "skull"));

    expect([fittedPieces(), lookIn(slotOf("skull").querySelector(".skeleton-fitted")), asked(pictures)]).toEqual([["skull"], "loading", 1]);
  });
});

// A picture still loading has no size of its own, so each fills the place
// its wrapper keeps, a bone in the tray or held keeping its own shape.
const fills = (picture: Element | null | undefined) => {
  const style = getComputedStyle(picture ?? document.body);
  return [style.display, style.width, style.height, style.objectFit];
};

// The puzzle open, every one of its pictures still loading.
async function openLoading() {
  const opened = openSkeletonsApp();
  await opened.user.click(screen.getByRole("button", { name: "TYRANNOSAURUS" }));
  layOutPuzzle();
  return opened.pictures;
}

describe("a skeleton's picture still loading", () => {
  it.each<[string, () => Element | null | undefined, string]>([
    ["the outline", () => document.querySelector(".skeleton-outline img"), "fill"],
    ["a bone in the tray", () => spotOf("spine").querySelector("img"), "contain"],
    ["the bone held", () => lifted()?.querySelector("img"), "contain"]
  ])("fills %s's place", async (_, picture, objectFit) => {
    await openLoading();
    lift();

    expect(fills(picture())).toEqual(["block", "100%", "100%", objectFit]);
  });

  it("fills a fitted bone's place", async () => {
    await openLoading();

    fit(TYRANNOSAURUS, "skull");

    expect(fills(slotOf("skull").querySelector(".skeleton-fitted img"))).toEqual(["block", "100%", "100%", "fill"]);
  });

  it("fills the whole skeleton's place on the result", async () => {
    const pictures = await openLoading();

    fitAll(TYRANNOSAURUS);
    revealNow(pictures, "tyrannosaurus");

    const bones = reveal()?.querySelector(".skeleton-reveal-bones img");
    expect([bones?.getAttribute("data-picture"), ...fills(bones)]).toEqual(["loading", "block", "100%", "100%", "fill"]);
  });
});
