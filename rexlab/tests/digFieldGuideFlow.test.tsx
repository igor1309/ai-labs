import { act, fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { treasurePlaces } from "../src/dig/index.ts";
import { COUNT_SETTLE, GUST, LIFT, STAR_LANDS, TREASURE_FLIGHT } from "../src/digGame.tsx";
import { TEXTS } from "../src/language/texts.ts";
import { PROGRESS_KEY } from "../src/localProgress.ts";
import { TREASURE_PICTURES } from "../src/treasurePictures.ts";
import { board, brushAll, choiceCard, clearCells, digUp, drag, finishBoard, landTreasure, openDigApp, placeBoard, roundDinosaur } from "./digApp.tsx";
import { badgeOf } from "./homePage.tsx";
import { homeTile, memoryStorage } from "./support.ts";
import { filterTaps, tapAt } from "./taps.ts";

// dig-field-guide.feature: the FIELD GUIDE opens from a round and from the
// reveal, and BACK gives back the round or reveal as it was. Every test
// round, drawn at 0, digs up a Tyrannosaurus and hides a shell at the
// first place beside it.

const stored = (treasures: object) => memoryStorage({ [PROGRESS_KEY]: JSON.stringify({ schemaVersion: 1, games: { dig: { dug: [], badges: [], treasures } } }) });
const saved = (app: ReturnType<typeof openDigApp>) => JSON.parse(app.storage.items.get(PROGRESS_KEY) ?? "{}").games?.dig;
const button = (name: string) => screen.getByRole<HTMLButtonElement>("button", { name });
const fieldGuide = () => button(TEXTS.en.fieldGuide);
const title = () => screen.getByRole("heading", { level: 1 }).textContent;
const guideCards = () => within(screen.getByRole("group", { name: TEXTS.en.treasureCards })).getAllByRole("region");
const starts = (app: ReturnType<typeof openDigApp>) => app.featured.history().timesStarted.get("dig") ?? 0;

function openRound(options: Parameters<typeof openDigApp>[0] = {}) {
  const app = openDigApp(options);
  fireEvent.click(homeTile("DIG"));
  placeBoard(800);
  return app;
}

// Brushes the rows of the middle of the board until about half of the
// dinosaur is clear, before the question.
function brushHalf() {
  for (let y = 220; y < 380; y += 40) drag([[0, y], [800, y]], y * 100);
}

// The treasure's rows brushed, one stroke each, from `time`.
function brushTreasure(time = 0) {
  const { column, row } = treasurePlaces(roundDinosaur().cells)[0]!;
  [0.5, 1.5, 2.5].forEach((offset, at) => drag([[column * 20 + 10, (row + offset) * 20], [(column + 3) * 20 - 10, (row + offset) * 20]], time + 1000 * at));
}

describe("the FIELD GUIDE from a round", () => {
  it("shows each kind's picture and count kept, and BACK gives back the same sand with no drop, the round going on", () => {
    const app = openRound({ storage: stored({ shell: 3, "egg-nest": 1 }) });
    brushHalf();
    const [dinosaur, clear, before] = [roundDinosaur().id, board().getAttribute("data-clear"), starts(app)];
    expect(clearCells().length).toBeGreaterThan(0);

    fireEvent.click(fieldGuide());
    expect([title(), document.querySelector(".dig-board")]).toEqual([TEXTS.en.fieldGuide, null]);
    expect(guideCards().map((card) => [card.dataset.kind, card.querySelector("img")?.getAttribute("src"), card.querySelector(".dig-guide-count")?.textContent])).toEqual([
      ["shell", TREASURE_PICTURES.shell, "×3"],
      ["tooth", undefined, undefined],
      ["amber", undefined, undefined],
      ["egg-nest", TREASURE_PICTURES["egg-nest"], "×1"],
      ["golden-fossil", undefined, undefined]
    ]);
    expect(guideCards()[1]?.querySelector<HTMLElement>(".dig-guide-outline")?.style.getPropertyValue("--outline")).toBe(`url("${TREASURE_PICTURES.tooth}")`);
    expect(screen.getByLabelText(TEXTS.en.kindsFound).textContent).toBe("2/5");

    fireEvent.click(button("BACK"));
    placeBoard(800);
    expect([title(), roundDinosaur().id, board().getAttribute("data-clear"), starts(app)]).toEqual([TEXTS.en.dig, dinosaur, clear, before]);
    expect([board().getAttribute("data-dropped"), getComputedStyle(board()).animationName, board().querySelector(".dig-landing")]).toEqual(["true", "none", null]);

    digUp();
    finishBoard(app.timers);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("TYRANNOSAURUS");
    expect(saved(app).dug).toEqual(["tyrannosaurus"]);
    expect(starts(app)).toBe(before);
  });

  it("keeps a treasure in flight as the page opens, as if it had landed, and only once", () => {
    const app = openRound();
    brushTreasure();
    expect(document.querySelector(".dig-treasure-flight")).not.toBeNull();

    fireEvent.click(fieldGuide());
    expect(guideCards()[0]?.querySelector(".dig-guide-count")?.textContent).toBe("×1");
    expect(saved(app).treasures).toEqual({ shell: 1 });
    landTreasure(app.timers);
    expect(saved(app).treasures).toEqual({ shell: 1 });

    fireEvent.click(button("BACK"));
    expect([document.querySelector(".dig-treasure-flight"), document.querySelector(".dig-treasure-found"), document.querySelector(".dig-treasure")]).toEqual([null, null, null]);
    expect([fieldGuide().textContent, document.querySelector(".dig-field-guide-new")?.textContent]).toEqual(["1", "NEW!"]);
  });

  it.each(["gust", "lift", "counted"] as const)("lets the round go on under the page during its %s, as a turn of the iPad does", (phase) => {
    const app = openRound();
    digUp();
    landTreasure(app.timers);
    if (phase !== "gust") act(() => app.timers.fire(GUST.motion));
    if (phase === "counted") act(() => app.timers.fire(LIFT.motion));
    expect(app.timers.timers()).toEqual([{ gust: GUST.motion, lift: LIFT.motion, counted: COUNT_SETTLE.motion }[phase]]);

    fireEvent.click(fieldGuide());
    // The lift's wait belongs to the board shown, and stops with it.
    expect(app.timers.timers()).toEqual(phase === "lift" ? [] : [{ gust: GUST.motion, counted: COUNT_SETTLE.motion }[phase]]);
    if (phase === "gust") act(() => app.timers.fire(GUST.motion));
    if (phase === "counted") act(() => app.timers.fire(COUNT_SETTLE.motion));
    expect([title(), app.timers.timers()]).toEqual([TEXTS.en.fieldGuide, []]);

    fireEvent.click(button("BACK"));
    if (phase !== "counted") {
      expect([board().getAttribute("data-lifting"), app.timers.timers()]).toEqual(["true", [LIFT.motion]]);
      act(() => app.timers.deliverStopped(LIFT.motion));
      act(() => app.timers.fire(LIFT.motion));
      act(() => app.timers.fire(COUNT_SETTLE.motion));
    }
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("TYRANNOSAURUS");
    expect([button("DIG AGAIN").disabled, app.timers.timers()]).toEqual([true, [STAR_LANDS.motion]]);
    act(() => app.timers.fire(STAR_LANDS.motion));
    expect(button("DIG AGAIN").disabled).toBe(false);
  });

  it("leaves for HOME from the page as leaving the round would, the dinosaur not recorded", () => {
    const app = openRound();
    brushAll();
    fireEvent.click(fieldGuide());
    fireEvent.click(button("HOME"));

    expect([badgeOf(homeTile("DIG")), saved(app)?.dug ?? [], app.timers.timers()]).toEqual([null, [], []]);
    for (const wait of [1000, GUST.motion, LIFT.motion, TREASURE_FLIGHT.motion]) act(() => app.timers.deliverStopped(wait));
    expect(document.querySelector(".dig-board")).toBeNull();
  });

  it("opens once on a quick double tap, the second tap pressing nothing on it, and one tap on BACK brings the round back", () => {
    const app = openRound();
    const before = starts(app);
    filterTaps();
    tapAt(fieldGuide(), 0, { x: 600, y: 40 });
    tapAt(button("BACK"), 200, { x: 600, y: 40 });
    expect(title()).toBe(TEXTS.en.fieldGuide);
    tapAt(button("BACK"), 900, { x: 600, y: 40 });
    expect([title(), starts(app)]).toEqual([TEXTS.en.dig, before]);
  });
});

describe("the FIELD GUIDE from the reveal", () => {
  it("opens once the reveal takes taps, and BACK gives the reveal back with its parts in place and its buttons ready at once", () => {
    const app = openRound();
    digUp();
    finishBoard(app.timers);
    expect(fieldGuide().disabled).toBe(true);
    act(() => app.timers.fire(STAR_LANDS.motion));

    fireEvent.click(fieldGuide());
    expect([title(), app.timers.timers()]).toEqual([TEXTS.en.fieldGuide, []]);
    fireEvent.click(button("BACK"));

    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("TYRANNOSAURUS");
    expect([button("DIG AGAIN").disabled, button("HOME").disabled, fieldGuide().disabled]).toEqual([false, false, false]);
    const reveal = document.querySelector<HTMLElement>(".dig-reveal-screen")!;
    expect(reveal.dataset.arrived).toBe("true");
    for (const part of reveal.querySelectorAll(".dig-reveal-art, .dig-reveal-name, .dig-card, .dig-reveal-level, .result-actions > button")) expect(getComputedStyle(part).animationName).toBe("none");

    fireEvent.click(button("DIG AGAIN"));
    placeBoard(800);
    expect([board().hasAttribute("data-dropped"), getComputedStyle(board()).animationName]).toEqual([false, "dig-drop"]);
  });

  it("brings its parts in as it first arrives", () => {
    const app = openRound();
    digUp();
    finishBoard(app.timers);
    const reveal = document.querySelector<HTMLElement>(".dig-reveal-screen")!;
    expect([reveal.hasAttribute("data-arrived"), getComputedStyle(button("DIG AGAIN")).animationName]).toEqual([false, "rise-in"]);
  });
});
