import { render, screen } from "@testing-library/react";
import { describe, expect, it, onTestFinished } from "vitest";
import { DinosaurPage, type DinosaurPageView } from "../src/DinosaurPage.tsx";
import { PicturesProvider, pictureStore } from "../src/Picture.tsx";
import { TEXTS } from "../src/language/texts.ts";
import { styleAt } from "./windowSizes.ts";

const DINO: DinosaurPageView = {
  id: "quetzalcoatlus",
  name: "Quetzalcoatlus",
  picture: "/pictures/quetzalcoatlus.webp",
  group: "flying-reptile",
  diet: "meat",
  description: "A flying reptile with a very long neck and a huge wingspan.",
  size: { measure: "wingspan", value: "10 m" },
  mass: "200 kg",
  found: false
};

describe("a dinosaur page in a tall window", () => {
  it("keeps the group line and width-derived bands in the page", () => {
    const root = document.documentElement;
    root.dataset.size = "tall";
    onTestFinished(() => {
      delete root.dataset.size;
    });

    render(
      <PicturesProvider store={pictureStore((_url, done) => done("loaded"))} startTimer={(_ms, fire) => (fire(), () => {})}>
        <DinosaurPage
          language="en"
          dinosaur={DINO}
          number={10}
          total={52}
          keptLines={{ description: 3, note: 3 }}
          onPrevious={() => {}}
          onNext={() => {}}
          onBack={() => {}}
        />
      </PicturesProvider>
    );

    const page = document.querySelector<HTMLElement>(".dinosaur-page")!;
    const stage = document.querySelector<HTMLElement>(".dinosaur-stage")!;
    expect(page.dataset.descriptionLines).toBe("3");
    expect(page.dataset.noteLines).toBe("3");
    expect(screen.getByText(TEXTS.en.groups["flying-reptile"])).toBeTruthy();
    expect(styleAt(stage, [820, 1180]).value("grid-template-columns")).toBe("72px minmax(0, 1fr) 72px");
    expect(styleAt(stage, [820, 1180]).columnGap()).toBe(16);
    expect(styleAt(document.querySelector(".dinosaur-page-name")!, [820, 1180]).value("font-size")).toBe("min(64px, 7.8cqi)");
  });
});

