import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.tsx";
import { HOME_GAMES } from "../src/HomePage.tsx";
import { PICTURE_LIMIT } from "../src/Picture.tsx";
import {
  SHIPPED_CATALOGUE,
  SHIPPED_DINOSAURS,
  emptyCare,
  emptyDig,
  emptyPairs,
  emptyProgress,
  emptySkeletons,
  emptySorting,
  englishDevice,
  fakeBodyPicture,
  featuring,
  gameDoor,
  lightDevice,
  manualViewport,
  manualPictures,
  pageAtRest,
  seededRandom,
  unsetAgeLevel,
  type ManualPictures
} from "./support.ts";

// pictures.feature, "A picture shimmers until it has loaded, then fades
// in": each place of the outline the catalogue and pages tests do not
// already cover, with its screen shown at once.

function openApp(pictures: ManualPictures, featured: Parameters<typeof featuring>[0] = "compare") {
  render(
    <App {...featuring(featured)} dinosaurs={SHIPPED_DINOSAURS} catalogue={SHIPPED_CATALOGUE} bodyPicture={fakeBodyPicture} random={seededRandom(21)} portraitLayouts={{}} viewport={manualViewport("landscape")} progress={emptyProgress()} {...englishDevice()} {...lightDevice()} {...unsetAgeLevel()} {...emptyCare()} {...emptySorting()} {...emptyPairs()} {...emptySkeletons()} {...emptyDig()} {...pageAtRest()} {...pictures} />
  );
  return userEvent.setup({ delay: null });
}

const lookOf = (picture: HTMLElement | null | undefined) => [picture?.dataset.picture, picture?.getAttribute("src")];

describe("a place shimmering until its picture loads", () => {
  it("is the ANCIENT REPTILES tile on the home page", () => {
    const pictures = manualPictures();
    openApp(pictures);
    const picture = gameDoor("ANCIENT REPTILES").querySelector("img");

    expect(lookOf(picture)).toEqual(["loading", null]);
    act(() => pictures.finish(fakeBodyPicture("stegosaurus")));
    expect(lookOf(picture)).toEqual(["appearing", fakeBodyPicture("stegosaurus")]);
  });

  it("is Velociraptor's card on the list of every dinosaur", async () => {
    const pictures = manualPictures();
    const user = openApp(pictures);

    await user.click(gameDoor("ANCIENT REPTILES"));

    const card = within(screen.getByRole("group", { name: "ANCIENT REPTILES" })).getByRole("button", { name: "Velociraptor" });
    expect(lookOf(card.querySelector("img"))).toEqual(["loading", null]);
    act(() => pictures.finish(fakeBodyPicture("velociraptor")));
    expect(lookOf(card.querySelector("img"))).toEqual(["appearing", fakeBodyPicture("velociraptor")]);
  });

  it("is the compare result's dinosaur", async () => {
    // Every picture loads but the result's Tyrannosaurus.
    const hero = fakeBodyPicture("tyrannosaurus");
    const pictures = manualPictures();
    const loadAllBut = () => act(() => pictures.loading().filter((url) => url !== hero).forEach(pictures.finish));
    const user = openApp(pictures);
    await user.click(gameDoor("COMPARE"));
    for (let number = 1; number <= 10; number++) {
      loadAllBut();
      await user.click(within(screen.getByRole("group", { name: "ANIMALS" })).getAllByRole("button")[0] ?? document.body);
      await user.click(screen.getByRole("button", { name: number < 10 ? "NEXT" : "SEE RESULT" }));
    }

    const picture = document.querySelector<HTMLElement>(".result-hero");
    expect([screen.getByLabelText("SCORE").textContent, ...lookOf(picture)]).toEqual([expect.stringMatching(/^\d+\/10$/), "loading", null]);
    act(() => pictures.finish(hero));
    expect(lookOf(picture)).toEqual(["appearing", hero]);
  });
});

// Each picture on the page, as its look and source.
const looks = () => [...document.querySelectorAll<HTMLElement>("img")].map(lookOf);

describe.each(HOME_GAMES)("every picture of the home page, featuring %s", (featured) => {
  // The home page's pictures but the first load; the first then ends as
  // the case says. A late one still fades in; a failed one is loaded
  // again only by a later screen.
  it.each([
    ["fails", (pictures: ManualPictures, first: string) => pictures.fail(first), false],
    ["loads past the limit", (pictures: ManualPictures) => pictures.fire(PICTURE_LIMIT), true]
  ])("shimmers, then shows the failure look when its picture %s", (_, end, fadesLate) => {
    const pictures = manualPictures();
    openApp(pictures, featured);
    const [first = "", ...rest] = pictures.loading();

    expect([document.querySelectorAll("img").length > 0, document.querySelectorAll("img:not(.picture)").length]).toEqual([true, 0]);
    expect(new Set(looks().map(String))).toEqual(new Set([String(["loading", null])]));
    act(() => rest.forEach(pictures.finish));
    act(() => end(pictures, first));
    expect(new Set(looks().map(String))).toEqual(new Set(rest.map((url) => String(["appearing", url])).concat(String(["failed", null]))));
    act(() => (fadesLate ? pictures.finish(first) : undefined));
    expect(new Set(looks().map(String))).toEqual(new Set(fadesLate ? [first, ...rest].map((url) => String(["appearing", url])) : rest.map((url) => String(["appearing", url])).concat(String(["failed", null]))));
    expect(pictures.loading()).toEqual([]);
  });
});

describe("a screen whose pictures fail or are late", () => {
  const cards = () => within(screen.getByRole("group", { name: "ANIMALS" })).getAllByRole("button");

  it("is question 1, each card named and answered, once its pictures load past the limit", async () => {
    const pictures = manualPictures();
    const user = openApp(pictures);
    await user.click(gameDoor("COMPARE"));
    const shown = cards().map((card) => card.querySelector("img")?.getAttribute("alt") ?? "");
    act(() => pictures.fire(PICTURE_LIMIT));

    expect(cards().map((card) => [card.textContent, ...lookOf(card.querySelector("img"))])).toEqual(shown.map((name) => [expect.stringContaining(name.toUpperCase()), "failed", null]));
    expect(shown.map((name) => screen.getByRole("img", { name }).dataset.picture)).toEqual(["failed", "failed"]);
    await user.click(cards()[0] ?? document.body);
    expect(screen.getByRole("button", { name: "NEXT" })).toBeTruthy();
    const [name = ""] = shown;
    const late = fakeBodyPicture(name.toLowerCase());
    act(() => pictures.finish(late));
    expect(lookOf(screen.getByRole("img", { name }))).toEqual(["appearing", late]);
  });

  it("is question 1, its cards answered once their pictures fail", async () => {
    const pictures = manualPictures();
    const user = openApp(pictures);
    await user.click(gameDoor("COMPARE"));
    const names = cards().map((card) => card.querySelector("img")?.getAttribute("alt") ?? "");
    act(() => names.forEach((name) => pictures.fail(fakeBodyPicture(name.toLowerCase()))));

    expect(cards().map((card) => card.querySelector("img")?.dataset.picture)).toEqual(["failed", "failed"]);
    await user.click(cards()[1] ?? document.body);
    expect(screen.getByRole("button", { name: "NEXT" })).toBeTruthy();
  });

  it("is the page of Velociraptor, its → button going on", async () => {
    const pictures = manualPictures();
    const user = openApp(pictures);
    await user.click(gameDoor("ANCIENT REPTILES"));
    await user.click(within(screen.getByRole("group", { name: "ANCIENT REPTILES" })).getByRole("button", { name: "Velociraptor" }));
    act(() => pictures.fail(fakeBodyPicture("velociraptor")));

    expect(lookOf(screen.getByRole("img", { name: "Velociraptor" }))).toEqual(["failed", null]);
    const before = screen.getByLabelText("NUMBER").textContent;
    await user.click(screen.getByRole("button", { name: "NEXT" }));
    expect(screen.getByLabelText("NUMBER").textContent).not.toBe(before);
  });

  it("is the compare result, PLAY AGAIN starting a round", async () => {
    const hero = fakeBodyPicture("tyrannosaurus");
    const pictures = manualPictures();
    const user = openApp(pictures);
    await user.click(gameDoor("COMPARE"));
    for (let number = 1; number <= 10; number++) {
      act(() => pictures.loading().filter((url) => url !== hero).forEach(pictures.finish));
      await user.click(cards()[0] ?? document.body);
      await user.click(screen.getByRole("button", { name: number < 10 ? "NEXT" : "SEE RESULT" }));
    }
    act(() => pictures.fail(hero));

    expect(lookOf(document.querySelector<HTMLElement>(".result-hero"))).toEqual(["failed", null]);
    await user.click(screen.getByRole("button", { name: "PLAY AGAIN" }));
    expect(cards()).toHaveLength(2);
  });
});
