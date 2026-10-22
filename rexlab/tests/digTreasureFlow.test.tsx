import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BRUSH_SIZES, keepTreasure, startRound, TREASURE_CHANCES, TREASURE_KINDS, treasurePlaces, type Random, type TreasureKind } from "../src/dig/index.ts";
import { DigBoardScreen } from "../src/DigBoardScreen.tsx";
import { COUNT_SETTLE, GUST, LIFT, TREASURE_FLIGHT } from "../src/digGame.tsx";
import { TEXTS } from "../src/language/texts.ts";
import { localDigProgress, PROGRESS_KEY } from "../src/localProgress.ts";
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
const route = () => document.querySelector<SVGPathElement>(".dig-treasure-route path");
const fresh = () => document.querySelector(".dig-field-guide-new");

const guideCards = () => within(screen.getByRole("group", { name: TEXTS.en.treasureCards })).getAllByRole("region");
const helped = () => board().getAttribute("data-helped");
const spendHelp = (app: ReturnType<typeof openDigApp>, seconds: number) => {
  for (let second = 0; second < seconds; second++) act(() => app.timers.fire(1000));
};

function openRound(options: Parameters<typeof openDigApp>[0] = {}) {
  const app = openDigApp(options);
  fireEvent.click(homeTile(options.language === "ru" ? "РАСКОПКИ" : "DIG"));
  placeBoard(800);
  return app;
}

// The draws of a first round at Explorer hiding `kind`: 0, as every other
// test round's, but the one that draws its kind, in the middle of that
// kind's chance. The draw it is at is found by starting such rounds.
function roundDraws(kind: TreasureKind): number[] {
  const draw = TREASURE_KINDS.slice(0, TREASURE_KINDS.indexOf(kind)).reduce((sum, each) => sum + TREASURE_CHANCES[each], 0) + TREASURE_CHANCES[kind] / 2;
  for (let at = 0; at < 100; at++) {
    const draws = Array.from({ length: at + 1 }, (_, each) => (each === at ? draw : 0));
    const queue = [...draws];
    if (startRound(SHIPPED_DIG, [], undefined, () => queue.shift() ?? 0, "explorer").treasure?.kind === kind) return draws;
  }
  throw new Error(`No round hides ${kind}`);
}

// A round hiding `kind`: the app's draws are 0 until it starts.
function openRoundHiding(kind: TreasureKind, storage: MemoryStorage, options: { language?: "en" | "ru"; reducedMotion?: boolean } = {}) {
  const draws: number[] = [];
  const random: Random = () => draws.shift() ?? 0;
  const app = openDigApp({ storage, random, ...options });
  draws.push(...roundDraws(kind));
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
    expect(screen.getByText("SHELL").getAttribute("aria-live")).toBe("polite");
    expect(getComputedStyle(screen.getByText("SHELL")).animation).toBe("fade-in var(--motion-screen) var(--ease-out) both");
    expect(route()?.getAttribute("d")).toMatch(/^M .* L .*$/);
    expect(getComputedStyle(found()!).animation).toBe("dig-treasure-hop calc(0.4 * var(--dig-treasure)) var(--ease-out) both");
    expect(getComputedStyle(flight()!).animation).toBe("dig-treasure-flight calc(0.6 * var(--dig-treasure)) var(--ease-out) calc(0.4 * var(--dig-treasure)) both");
    expect(screen.getByRole("main").style.getPropertyValue("--dig-treasure")).toBe(`${TREASURE_FLIGHT.motion}ms`);
    expect(app.timers.timers()).toContain(TREASURE_FLIGHT.motion);
    for (const timing of ["motion", "reduced"] as const) expect(TREASURE_FLIGHT[timing]).toBeLessThan(GUST[timing] + LIFT[timing]);
    expect([fieldGuide().textContent, fresh(), saved(app.storage)?.treasures]).toEqual(["0", null, undefined]);
    // Treasure sand cannot unlock the choices already in their slots.
    expect([cleared() < 0.75, board().hasAttribute("data-blown"), document.querySelectorAll(".dig-choice-card:enabled").length]).toEqual([true, false, 0]);

    const before = clearCells().length;
    drag([[100, 300], [700, 300]], 10_000);
    expect(clearCells().length).toBeGreaterThan(before);

    landTreasure(app.timers);
    expect([found(), flight(), buried()]).toEqual([null, null, null]);
    expect([fieldGuide().textContent, fieldGuide().hasAttribute("data-landed"), fresh()?.textContent]).toEqual(["1", true, "NEW!"]);
    expect(getComputedStyle(fieldGuide()).animation).toBe("dig-guide-arrival var(--motion-standard) var(--ease-overshoot) both");
    expect(getComputedStyle(fieldGuide().querySelector(".dig-field-guide-count")!).animation).toBe("pop-in var(--motion-small) var(--ease-overshoot) both");
    expect(saved(app.storage)).toMatchObject({ dug: [], treasures: { shell: 1 } });
  });

  it("flies from its place on the board to the FIELD GUIDE's book, measured again on a resize of an offset, scaled board", () => {
    openRound();
    const { column, row } = place();
    const book = fieldGuide().querySelector("svg")!;
    book.getBoundingClientRect = () => ({ left: 600, top: 32, width: 20, height: 20 } as DOMRect);
    brushTreasure();
    const ends = () => [flight()!.style.left, flight()!.style.top, flight()!.style.width, flight()!.style.getPropertyValue("--treasure-x"), flight()!.style.getPropertyValue("--treasure-y")];
    // The board shows the frame's 800 by 600 pixels at their own size, a
    // cell 20 pixels wide, the treasure 3 cells.
    expect(ends()).toEqual(["610px", "42px", "60px", `${(column + 1.5) * 20 - 610}px`, `${(row + 1.5) * 20 - 42}px`]);
    expect(route()?.getAttribute("d")).toBe(`M ${(column + 1.5) * 20} ${(row + 1.5) * 20} L 610 42`);

    // At half size and moved, a cell is 10 pixels wide.
    board().getBoundingClientRect = () => ({ left: 100, top: 50, width: 400, height: 300 } as DOMRect);
    book.getBoundingClientRect = () => ({ left: 500, top: 12, width: 20, height: 20 } as DOMRect);
    act(() => window.dispatchEvent(new Event("resize")));
    expect(ends()).toEqual(["510px", "22px", "30px", `${100 + (column + 1.5) * 10 - 510}px`, `${50 + (row + 1.5) * 10 - 22}px`]);
    expect(route()?.getAttribute("d")).toBe(`M ${100 + (column + 1.5) * 10} ${50 + (row + 1.5) * 10} L 510 22`);
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
    expect(getComputedStyle(screen.getByText("SHELL")).animation).toBe("fade-in var(--motion-screen) var(--ease-out) both");
    expect(route()).toBeNull();
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
    for (let y = (row + 6) * 20; y < 600 && cleared() < 0.75; y += 20) drag([[0, y], [800, y]], y * 100);
    fireEvent.click(choiceCard());
    expect(board().hasAttribute("data-blown")).toBe(true);
    expect([buried()?.dataset.kind, found()]).toEqual(["shell", null]);
    expect(getComputedStyle(buried()!).animationName).toBe("dig-treasure-tumble");
    expect(app.timers.timers()).toEqual([GUST.motion]);
    finishBoard(app.timers);
    expect(fieldGuide().textContent).toBe("0");
    expect(saved(app.storage).treasures).toBeUndefined();
  });

  it("lies under the same sand after a turn to portrait and back, and once kept stays kept and gone from the board", () => {
    const app = openRound();
    drag([[100, 400], [700, 400]]);
    const [treasure, clear] = [buried()!.getAttribute("style"), board().getAttribute("data-clear")];
    act(() => app.viewport.turn("portrait"));
    act(() => app.viewport.turn("landscape"));
    placeBoard(800);
    expect([buried()?.getAttribute("style"), board().getAttribute("data-clear"), fieldGuide().textContent]).toEqual([treasure, clear, "0"]);

    brushTreasure(5000);
    landTreasure(app.timers);
    act(() => app.viewport.turn("portrait"));
    act(() => app.viewport.turn("landscape"));
    placeBoard(800);
    expect([buried(), found(), flight(), fieldGuide().textContent]).toEqual([null, null, null, "1"]);
    expect(saved(app.storage).treasures).toEqual({ shell: 1 });
  });

  it("flies again after a turn to portrait and back mid-flight, kept only as the flight started again lands", () => {
    const app = openRound();
    brushTreasure();
    const flights = () => app.timers.timers().filter((wait) => wait === TREASURE_FLIGHT.motion).length;
    expect(flights()).toBe(1);

    act(() => app.viewport.turn("portrait"));
    expect(flights()).toBe(0);
    act(() => app.viewport.turn("landscape"));
    placeBoard(800);
    expect([flights(), found()?.dataset.kind, flight()?.dataset.kind]).toEqual([1, "shell", "shell"]);
    act(() => app.timers.deliverStopped(TREASURE_FLIGHT.motion));
    expect([fieldGuide().textContent, fieldGuide().hasAttribute("data-landed"), saved(app.storage)?.treasures]).toEqual(["0", false, undefined]);

    landTreasure(app.timers);
    expect([found(), flight(), fieldGuide().textContent, fresh()?.textContent]).toEqual([null, null, "1", "NEW!"]);
    expect(saved(app.storage).treasures).toEqual({ shell: 1 });
  });

  it("is kept as the reveal comes while its flight, started again by a turn to portrait and back, is still on", () => {
    const app = openRound();
    brushTreasure();
    for (let y = 20; y < 600 && cleared() < 0.75; y += 40) drag([[0, y], [800, y]], 20_000 + y * 100);
    fireEvent.click(choiceCard());
    act(() => app.viewport.turn("portrait"));
    act(() => app.viewport.turn("landscape"));
    placeBoard(800);
    act(() => app.timers.fire(GUST.motion));
    act(() => app.timers.fire(LIFT.motion));
    expect([saved(app.storage).treasures, app.timers.timers()]).toEqual([undefined, expect.arrayContaining([TREASURE_FLIGHT.motion, COUNT_SETTLE.motion])]);

    act(() => app.timers.fire(COUNT_SETTLE.motion));
    expect([screen.getByRole("heading", { level: 2 }).textContent, fieldGuide().textContent]).toEqual(["TYRANNOSAURUS", "1"]);
    expect(saved(app.storage)).toMatchObject({ dug: ["tyrannosaurus"], treasures: { shell: 1 } });
    landTreasure(app.timers);
    expect(saved(app.storage).treasures).toEqual({ shell: 1 });
  });

  it.each([
    { before: { shell: 2 }, after: { shell: 4 }, count: "4" },
    { before: {}, after: { shell: 2 }, count: "2" }
  ])("lands on the count another tab stored meanwhile, from $before", ({ before, after, count }) => {
    const app = openRound({ storage: stored(before) });
    const otherTab = localDigProgress(() => app.storage);
    const other = otherTab.load()!;
    brushTreasure();
    otherTab.save({ ...other, progress: keepTreasure(other.progress, "shell") });

    landTreasure(app.timers);
    expect([fieldGuide().textContent, fresh()]).toEqual([count, null]);
    expect(saved(app.storage).treasures).toEqual(after);
  });

  it.each(["during its flight", "after it lands", "after BACK from the FIELD GUIDE"] as const)("keeps its state through help's ticks %s", (when) => {
    const app = openRound();
    brushTreasure();
    if (when === "after it lands") landTreasure(app.timers);
    if (when === "after BACK from the FIELD GUIDE") {
      fireEvent.click(fieldGuide());
      fireEvent.click(screen.getByRole("button", { name: "BACK" }));
      placeBoard(800);
    }
    expect(helped()).toBe("");
    spendHelp(app, 10);
    expect(helped()).not.toBe("");

    if (when === "during its flight") {
      expect([buried(), found()?.dataset.kind, flight()?.dataset.kind, fieldGuide().textContent]).toEqual([null, "shell", "shell", "0"]);
      landTreasure(app.timers);
    }
    expect([buried(), found(), flight(), fieldGuide().textContent, fresh()?.textContent]).toEqual([null, null, null, "1", "NEW!"]);
    expect(saved(app.storage).treasures).toEqual({ shell: 1 });
    const dropped = when === "after BACK from the FIELD GUIDE";
    expect([board().getAttribute("data-dropped"), board().querySelector(".dig-landing") === null]).toEqual([dropped ? "true" : null, dropped]);
  });
});

describe.each(TREASURE_KINDS)("a %s found", (kind) => {
  it.each(["en", "ru"] as const)("names the discovery in %s, in both motion settings", (language) => {
    for (const reducedMotion of [false, true]) {
      const app = openRoundHiding(kind, stored({}), { language, reducedMotion });
      brushTreasure();
      expect(screen.getByText(TEXTS[language].treasures[kind]).getAttribute("aria-live")).toBe("polite");
      landTreasure(app.timers, reducedMotion ? "reduced" : "motion");
      app.unmount();
    }
  });

  it.each([
    { found: "first", before: {}, count: 1, fresh: "NEW!" },
    { found: "again", before: { [kind]: 1 }, count: 2, fresh: undefined }
  ])("is kept as its own kind, $found, and shows on its FIELD GUIDE card", ({ before, count, fresh: news }) => {
    const app = openRoundHiding(kind, stored(before));
    expect(buried()?.dataset.kind).toBe(kind);
    brushTreasure();
    expect([found()?.dataset.kind, flight()?.dataset.kind]).toEqual([kind, kind]);
    landTreasure(app.timers);

    expect(saved(app.storage).treasures).toEqual({ [kind]: count });
    expect([fieldGuide().textContent, fresh()?.textContent]).toEqual([String(count), news]);
    fireEvent.click(fieldGuide());
    expect(guideCards().map((card) => [card.dataset.kind, card.querySelector(".dig-guide-name")?.textContent, card.querySelector(".dig-guide-count")?.textContent])).toEqual(
      TREASURE_KINDS.map((each) => (each === kind ? [each, TEXTS.en.treasures[each], `×${count}`] : [each, undefined, undefined]))
    );
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
        for (let y = 20; y < 600 && board().getAttribute("data-blown") === null && cleared() < 0.75; y += 40) drag([[0, y], [800, y]], 20_000 + y * 100);
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
    {...presentDigBoard(round, fakeBodyPicture, fakeTreasurePicture, (id) => id)} choiceCount={round.choices.length} language="en" level="explorer"
    brush={BRUSH_SIZES.explorer} wide={false} onWide={() => {}} grains dugUp={0} total={SHIPPED_DIG.length} treasures={5} sandContext={() => null} onBrush={() => {}} onHome={() => {}} onFieldGuide={onFieldGuide}
  />, withPictures);
  fireEvent.click(fieldGuide());
  expect([fieldGuide().textContent, onFieldGuide.mock.calls.length]).toEqual(["5", 1]);
});
