import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BRUSH_SIZES, startRound, treasurePlaces } from "../src/dig/index.ts";
import { DigBoardScreen } from "../src/DigBoardScreen.tsx";
import { GUST, LIFT, TREASURE_FLIGHT } from "../src/digGame.tsx";
import { TEXTS } from "../src/language/texts.ts";
import { PROGRESS_KEY } from "../src/localProgress.ts";
import { presentDigBoard } from "../src/presentation.ts";
import { board, choiceCard, cleared, clearCells, drag, finishBoard, landTreasure, openDigApp, placeBoard, roundDinosaur } from "./digApp.tsx";
import { badgeOf } from "./homePage.tsx";
import { withPictures } from "./pictures.tsx";
import { fakeBodyPicture, fakeTreasurePicture, homeTile, memoryStorage, SHIPPED_DIG, type MemoryStorage } from "./support.ts";

// Every test round, drawn at 0, hides a shell at the first place beside
// its dinosaur.
const stored = (treasures: object) => memoryStorage({ [PROGRESS_KEY]: JSON.stringify({ schemaVersion: 1, games: { dig: { dug: [], badges: [], treasures } } }) });
const saved = (storage: MemoryStorage) => JSON.parse(storage.items.get(PROGRESS_KEY) ?? "{}").games?.dig;
const fieldGuide = (language: "en" | "ru" = "en") => screen.getByRole("button", { name: TEXTS[language].fieldGuide });
const buried = () => document.querySelector<HTMLElement>(".dig-treasure");
const found = () => document.querySelector<HTMLElement>(".dig-treasure-found");
const flight = () => document.querySelector<HTMLElement>(".dig-treasure-flight");
const fresh = () => document.querySelector(".dig-field-guide-new");

function openRound(options: Parameters<typeof openDigApp>[0] = {}) {
  const app = openDigApp(options);
  fireEvent.click(homeTile(options.language === "ru" ? "РАСКОПКИ" : "DIG"));
  placeBoard(800);
  return app;
}

// The treasure's place, in the frame's cells, and its cells' rows brushed
// one stroke each.
const place = () => treasurePlaces(roundDinosaur().cells)[0]!;
function brushTreasure(time = 0) {
  const { column, row } = place();
  [0.5, 1.5, 2.5].forEach((offset, at) => drag([[column * 20 + 10, (row + offset) * 20], [(column + 3) * 20 - 10, (row + offset) * 20]], time + 1000 * at));
}

describe("a treasure in the sand", () => {
  it("lies under the sand on its cells, nothing of it shown until brushed", () => {
    openRound();
    const { column, row } = place();
    const treasure = buried()!;
    expect([treasure.dataset.kind, treasure.style.left, treasure.style.top, treasure.style.width]).toEqual(["shell", `${column * 2.5}%`, `${(row * 10) / 3}%`, "7.5%"]);
    expect(treasure.compareDocumentPosition(board().querySelector(".dig-sand")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(treasure.querySelector("img")?.getAttribute("src")).toMatch(/shell/);
    expect([found(), flight(), fieldGuide().textContent]).toEqual([null, null, "0"]);
  });

  it("glows, hops and flies a first shell into the FIELD GUIDE, kept as it lands with NEW!, and brushing goes on", () => {
    const app = openRound();
    brushTreasure();

    expect([buried(), found()?.dataset.kind, flight()?.dataset.kind]).toEqual([null, "shell", "shell"]);
    expect(getComputedStyle(found()!).animation).toBe("dig-treasure-hop calc(0.4 * var(--dig-treasure)) var(--ease-out) both");
    expect(getComputedStyle(flight()!).animation).toBe("dig-treasure-flight calc(0.6 * var(--dig-treasure)) var(--ease-out) calc(0.4 * var(--dig-treasure)) both");
    expect(screen.getByRole("main").style.getPropertyValue("--dig-treasure")).toBe(`${TREASURE_FLIGHT.motion}ms`);
    expect(app.timers.timers()).toContain(TREASURE_FLIGHT.motion);
    for (const timing of ["motion", "reduced"] as const) expect(TREASURE_FLIGHT[timing]).toBeLessThan(GUST[timing] + LIFT[timing]);
    expect([fieldGuide().textContent, fresh(), saved(app.storage)?.treasures]).toEqual(["0", null, undefined]);
    expect([cleared() < 0.75, board().hasAttribute("data-blown"), document.querySelectorAll(".dig-choice-card").length]).toEqual([true, false, 0]);

    const before = clearCells().length;
    drag([[100, 300], [700, 300]], 10_000);
    expect(clearCells().length).toBeGreaterThan(before);

    landTreasure(app.timers);
    expect([found(), flight(), buried()]).toEqual([null, null, null]);
    expect([fieldGuide().textContent, fieldGuide().hasAttribute("data-landed"), fresh()?.textContent]).toEqual(["1", true, "NEW!"]);
    expect(getComputedStyle(fieldGuide().querySelector(".dig-field-guide-count")!).animation).toBe("pop-in var(--motion-small) var(--ease-overshoot) both");
    expect(saved(app.storage)).toMatchObject({ dug: [], treasures: { shell: 1 } });
  });

  it("flies a kind found before into the FIELD GUIDE with no NEW!", () => {
    const app = openRound({ storage: stored({ shell: 2, tooth: 1 }) });
    expect(fieldGuide().textContent).toBe("3");
    brushTreasure();
    landTreasure(app.timers);
    expect([fieldGuide().textContent, fieldGuide().hasAttribute("data-landed"), fresh()]).toEqual(["4", true, null]);
    expect(saved(app.storage).treasures).toEqual({ shell: 3, tooth: 1 });
  });

  it("fades from its place under reduced motion, and the count simply changes", () => {
    const app = openRound({ reducedMotion: true });
    brushTreasure();
    expect([flight(), getComputedStyle(found()!).animation]).toEqual([null, "fade-out var(--dig-treasure) var(--ease-out) both"]);
    expect(screen.getByRole("main").style.getPropertyValue("--dig-treasure")).toBe(`${TREASURE_FLIGHT.reduced}ms`);
    expect(app.timers.timers()).toContain(TREASURE_FLIGHT.reduced);
    landTreasure(app.timers, "reduced");
    expect([found(), fieldGuide().textContent, fresh()?.textContent]).toEqual([null, "1", "NEW!"]);
    expect(getComputedStyle(fieldGuide().querySelector(".dig-field-guide-count")!).animation).toBe("");
  });

  it("stays kept once landed when the child leaves for HOME before the gust, with the dinosaur not recorded and no count outside DIG", () => {
    const app = openRound();
    brushTreasure();
    landTreasure(app.timers);
    fireEvent.click(screen.getByRole("button", { name: "HOME" }));

    expect(badgeOf(homeTile("DIG"))).toBeNull();
    expect(saved(app.storage)).toMatchObject({ dug: [], treasures: { shell: 1 } });
    expect(document.querySelector(".dig-field-guide")).toBeNull();
    fireEvent.click(homeTile("DIG"));
    expect(fieldGuide().textContent).toBe("1");
  });

  it("is not kept when the child leaves before it lands", () => {
    const app = openRound();
    brushTreasure();
    fireEvent.click(screen.getByRole("button", { name: "HOME" }));
    landTreasure(app.timers);
    expect(saved(app.storage)?.treasures).toBeUndefined();
  });

  it("tumbles away with the gust when not found, and is not kept", () => {
    const app = openRound();
    const { row } = place();
    for (let y = (row + 6) * 20; y < 600 && document.querySelectorAll(".dig-choice-card").length === 0; y += 20) drag([[0, y], [800, y]], y * 100);
    fireEvent.click(choiceCard());
    expect(board().hasAttribute("data-blown")).toBe(true);
    expect([buried()?.dataset.kind, found()]).toEqual(["shell", null]);
    expect(getComputedStyle(buried()!).animationName).toBe("dig-treasure-tumble");
    expect(app.timers.timers()).toEqual([GUST.motion]);
    finishBoard(app.timers);
    expect(fieldGuide().textContent).toBe("0");
    expect(saved(app.storage).treasures).toBeUndefined();
  });

  it("lies under the same sand after a turn of the iPad, and once kept stays kept and gone from the board", () => {
    const app = openRound();
    drag([[100, 400], [700, 400]]);
    const [treasure, clear] = [buried()!.getAttribute("style"), board().getAttribute("data-clear")];
    act(() => app.orientation.turn("portrait"));
    act(() => app.orientation.turn("landscape"));
    placeBoard(800);
    expect([buried()?.getAttribute("style"), board().getAttribute("data-clear"), fieldGuide().textContent]).toEqual([treasure, clear, "0"]);

    brushTreasure(5000);
    landTreasure(app.timers);
    act(() => app.orientation.turn("portrait"));
    act(() => app.orientation.turn("landscape"));
    placeBoard(800);
    expect([buried(), found(), flight(), fieldGuide().textContent]).toEqual([null, null, null, "1"]);
    expect(saved(app.storage).treasures).toEqual({ shell: 1 });
  });
});

describe("the FIELD GUIDE button", () => {
  it.each(["en", "ru"] as const)("stands beside DUG UP in a round and on the reveal in %s, a 60 by 60 button with the book and the count", (language) => {
    const app = openRound({ language, storage: stored({ amber: 2 }) });
    const text = TEXTS[language];
    for (const where of ["round", "reveal"]) {
      const button = fieldGuide(language);
      expect(button.closest(".dig-bar")).not.toBeNull();
      if (where === "round") expect(button.parentElement?.nextElementSibling).toBe(screen.getByLabelText(text.dugUp));
      expect(button.querySelector("svg")?.classList.contains("lucide-book-open")).toBe(true);
      expect(button.textContent).toBe(where === "round" ? "2" : "3");
      const style = getComputedStyle(button);
      expect([style.minWidth, style.height]).toEqual(["60px", "60px"]);
      if (where === "round") {
        brushTreasure();
        landTreasure(app.timers);
        for (let y = 20; y < 600 && board().getAttribute("data-blown") === null && document.querySelectorAll(".dig-choice-card").length === 0; y += 40) drag([[0, y], [800, y]], 20_000 + y * 100);
        fireEvent.click(choiceCard());
        finishBoard(app.timers);
      }
    }
  });
});

it("opens the FIELD GUIDE through the board's hook", () => {
  const onFieldGuide = vi.fn();
  const round = startRound(SHIPPED_DIG, [], undefined, () => 0, "explorer");
  render(<DigBoardScreen
    {...presentDigBoard(round, fakeBodyPicture, fakeTreasurePicture)} choiceCount={round.choices.length} language="en" level="explorer"
    brush={BRUSH_SIZES.explorer} grains dugUp={0} total={SHIPPED_DIG.length} treasures={5} sandContext={() => null} onBrush={() => {}} onHome={() => {}} onFieldGuide={onFieldGuide}
  />, withPictures);
  fireEvent.click(fieldGuide());
  expect([fieldGuide().textContent, onFieldGuide.mock.calls.length]).toEqual(["5", 1]);
});
