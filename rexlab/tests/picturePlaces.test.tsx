import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.tsx";
import {
  SHIPPED_CATALOGUE,
  SHIPPED_DINOSAURS,
  emptyCare,
  emptyPairs,
  emptyProgress,
  emptySkeletons,
  emptySorting,
  englishDevice,
  fakeBodyPicture,
  featuring,
  homeTile,
  lightDevice,
  manualOrientation,
  manualPictures,
  seededRandom,
  unsetAgeLevel,
  type ManualPictures
} from "./support.ts";

// pictures.feature, "A picture shimmers until it has loaded, then fades
// in": each place of the outline the catalogue and pages tests do not
// already cover, with its screen shown at once.

function openApp(pictures: ManualPictures) {
  render(
    <App {...featuring()} dinosaurs={SHIPPED_DINOSAURS} catalogue={SHIPPED_CATALOGUE} bodyPicture={fakeBodyPicture} random={seededRandom(21)} orientation={manualOrientation("landscape")} progress={emptyProgress()} {...englishDevice()} {...lightDevice()} {...unsetAgeLevel()} {...emptyCare()} {...emptySorting()} {...emptyPairs()} {...emptySkeletons()} {...pictures} />
  );
  return userEvent.setup();
}

const lookOf = (picture: HTMLElement | null | undefined) => [picture?.dataset.picture, picture?.getAttribute("src")];

describe("a place shimmering until its picture loads", () => {
  it("is the ALL DINOSAURS tile on the home page", () => {
    const pictures = manualPictures();
    openApp(pictures);
    const picture = homeTile("ALL DINOSAURS").querySelector("img");

    expect(lookOf(picture)).toEqual(["loading", null]);
    act(() => pictures.finish(fakeBodyPicture("stegosaurus")));
    expect(lookOf(picture)).toEqual(["appearing", fakeBodyPicture("stegosaurus")]);
  });

  it("is Velociraptor's card on the list of every dinosaur", async () => {
    const pictures = manualPictures();
    const user = openApp(pictures);

    await user.click(homeTile("ALL DINOSAURS"));

    const card = within(screen.getByRole("group", { name: "ALL DINOSAURS" })).getByRole("button", { name: "Velociraptor" });
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
    await user.click(homeTile("COMPARE"));
    for (let number = 1; number <= 10; number++) {
      loadAllBut();
      await user.click(within(screen.getByRole("group", { name: "DINOSAURS" })).getAllByRole("button")[0] ?? document.body);
      await user.click(screen.getByRole("button", { name: number < 10 ? "NEXT" : "SEE RESULT" }));
    }

    const picture = document.querySelector<HTMLElement>(".result-hero");
    expect([screen.getByLabelText("SCORE").textContent, ...lookOf(picture)]).toEqual([expect.stringMatching(/^\d+\/10$/), "loading", null]);
    act(() => pictures.finish(hero));
    expect(lookOf(picture)).toEqual(["appearing", hero]);
  });
});
