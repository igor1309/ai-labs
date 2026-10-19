import { act, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AgeLevel } from "../src/ageLevel.ts";
import { PROGRESS_KEY } from "../src/localProgress.ts";
import { dealt, endWave, namesOf, openPairsApp, pairsRecord, placesOf, playDealt, playPairs, storedPairs, turnCard } from "./pairsApp.tsx";
import { SHIPPED_PALS, memoryStorage, symbolOf } from "./support.ts";

const button = (name: string) => screen.getByRole("button", { name });
const bestShown = () => screen.queryByLabelText("BEST SCORE")?.textContent ?? null;
const celebrations = () => screen.queryAllByRole("status").map((status) => status.getAttribute("aria-label"));

describe.each(["hatchling", "explorer", "paleontologist"] as const)("the %s result and collection", (level: AgeLevel) => {
  const board = dealt(level === "hatchling" ? 1 : { large: level });
  const names = namesOf(board);
  const ids = board.pals.map(({ id }) => id);
  const played = level === "hatchling" ? 1 : level;
  const otherBests = { 2: 5, 3: 6, 4: 7, ...(level !== "explorer" && { explorer: 10 }), ...(level !== "paleontologist" && { paleontologist: 13 }) };
  const ordered = (found: readonly string[]) => SHIPPED_PALS.filter(({ id }) => found.includes(id)).map(({ id }) => id);

  function open({ previous, found = [], readable = true }: { previous?: number | undefined; found?: readonly string[]; readable?: boolean } = {}) {
    const best = { ...otherBests, ...(previous !== undefined && { [played]: previous }) };
    const storage = memoryStorage({
      [PROGRESS_KEY]: pairsRecord({ stars: 4, level: 1, boardsOnLevel: 1, best, found })
    }, { read: readable });
    return openPairsApp({ storage, ageLevel: { level, revision: `picked-${level}` } });
  }

  it.each([
    ["first best", undefined, "FIRST BEST SCORE"],
    ["new best", ids.length + 3, "NEW BEST SCORE"],
    ["equal tries", ids.length + 2, null],
    ["more tries", ids.length + 1, null]
  ] as const)("shows the played level's best, tries, star, names and actions on %s", async (_, previous, celebration) => {
    const app = open({ previous, found: ids });
    await playPairs(app.user);
    await playDealt(app.user, app.clock, names, 2);
    endWave(app.clock);

    const expected = Math.min(previous ?? Infinity, ids.length + 2);
    expect(bestShown()).toBe(`BEST${celebration === "NEW BEST SCORE" ? previous : ""}${expected}`);
    expect(symbolOf(screen.getByLabelText("BEST SCORE"))).toBe("trophy");
    expect([screen.getByLabelText("TRIES").textContent, symbolOf(screen.getByLabelText("TRIES")), screen.getByLabelText("STARS").textContent]).toEqual([String(ids.length + 2), "hand", "★5"]);
    expect(screen.getByRole("heading").textContent).toBe("WELL DONE!");
    expect([...document.querySelectorAll(".pairs-found-name")].map((name) => name.textContent)).toEqual(board.pals.map(({ name }) => name.en.toLocaleUpperCase("en")));
    expect([symbolOf(button("PLAY AGAIN")), symbolOf(button("HOME"))]).toEqual(["rotate-ccw", "house"]);
    expect(celebrations()).toEqual([...(celebration ? [celebration] : []), ...(level === "hatchling" ? ["NEW LEVEL 2"] : [])]);
    expect(screen.queryByLabelText("LEVEL")).toBeNull();
    expect(document.querySelectorAll(".pairs-new-badge")).toHaveLength(0);
    expect(storedPairs(app.storage)).toMatchObject({ stars: 5, best: { ...otherBests, [played]: expected }, found: ordered(ids), level: level === "hatchling" ? 2 : 1, boardsOnLevel: level === "hatchling" ? 0 : 1 });
  });

  it("marks only newly found dinosaurs and stamps the completed board's collection and pages", async () => {
    const app = open({ found: ids.slice(0, 2) });
    await playPairs(app.user);
    await playDealt(app.user, app.clock, names);
    endWave(app.clock);

    const cards = within(screen.getByRole("list", { name: "DINOSAURS" })).getAllByRole("listitem");
    expect(cards.map((card) => card.querySelector(".pairs-new-badge")?.textContent ?? null)).toEqual(ids.map((_, at) => at < 2 ? null : "NEW"));
    expect(cards.slice(2).map((card) => symbolOf(card.querySelector(".pairs-new-badge") ?? card))).toEqual(ids.slice(2).map(() => "sparkles"));
    expect(storedPairs(app.storage)).toMatchObject({ found: ordered(ids) });
    await app.user.click(button("HOME"));
    await app.user.click(button("ALL DINOSAURS"));

    const catalogue = screen.getByRole("group", { name: "ALL DINOSAURS" });
    const stamped = within(catalogue).getAllByRole("button").filter((card) => within(card).queryByRole("img", { name: "FOUND" }));
    expect(stamped.map((card) => card.getAttribute("aria-label")).sort()).toEqual(board.pals.map(({ name }) => name.en).sort());
    const first = board.pals[0];
    if (!first) throw new Error("No dinosaur on the board");
    await app.user.click(within(catalogue).getByRole("button", { name: first.name.en }));
    expect(symbolOf(screen.getByRole("img", { name: "FOUND" }))).toBe("copy");
  });

  it("finds nothing from a partly finished board", async () => {
    const app = open({ found: ids.slice(1, 2) });
    await playPairs(app.user);
    for (const place of placesOf(names, names[0] ?? "")) await turnCard(app.user, place);

    await app.user.click(button("HOME"));

    expect(storedPairs(app.storage)).toMatchObject({ stars: 4, found: ids.slice(1, 2) });
  });

  it("records the finish once before the wave, even when HOME and a reload interrupt it", async () => {
    const app = open();
    await playPairs(app.user);
    await playDealt(app.user, app.clock, names);
    const recorded = storedPairs(app.storage);
    expect(recorded).toMatchObject({ stars: 5, best: { ...otherBests, [played]: ids.length }, found: ordered(ids) });

    await app.user.click(button("HOME"));
    act(() => app.clock.settle());
    expect(storedPairs(app.storage)).toEqual(recorded);
    expect(screen.queryByRole("button", { name: "PLAY AGAIN" })).toBeNull();
    app.unmount();
    const reopened = openPairsApp({ storage: app.storage, ageLevel: { level, revision: `picked-${level}` } });
    await reopened.user.click(button("FIND THE PAIR"));
    expect(screen.getByLabelText("STARS").textContent).toBe("5");
    expect(storedPairs(app.storage)).toEqual(recorded);
  });

  it("shows tries and a star, with no best celebration, when progress cannot be read", async () => {
    const app = open({ readable: false });
    await playPairs(app.user);
    await playDealt(app.user, app.clock, names);
    endWave(app.clock);

    expect([screen.getByLabelText("TRIES").textContent, screen.getByLabelText("STARS").textContent, bestShown(), celebrations()]).toEqual([String(ids.length), "★1", null, []]);
  });
});
