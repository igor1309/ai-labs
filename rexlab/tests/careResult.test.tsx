import { act, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NEEDS, type Need } from "../src/care/index.ts";
import { TEXTS } from "../src/language/texts.ts";
import { LANGUAGE_KEY } from "../src/localLanguage.ts";
import { PROGRESS_KEY, localProgress } from "../src/localProgress.ts";
import { THEME_KEY } from "../src/localTheme.ts";
import { meetNeed, needAsked, playVisit, visitorShown } from "./care.ts";
import {
  button,
  careRecord,
  celebrations,
  heartsShown,
  needStates,
  openCare,
  openCareApp,
  scoreShown,
  shipped,
  storedCare,
  visitorsFrom,
  welcomeVisitor
} from "./careApp.tsx";
import { SHIPPED_VISITORS, fakeBodyPicture, fakeItemPicture, manualPictures, memoryStorage, quizSaved, symbolOf } from "./support.ts";

const symbolsOf = (element: Element) =>
  [...element.querySelectorAll("svg.lucide")].map((svg) => [...svg.classList].find((name) => name.startsWith("lucide-"))?.slice("lucide-".length));

// The needs met after a refusal, so a visit earns `score` hearts.
const refusalsFor = (score: number): Need[] => NEEDS.slice(0, 8 - score);

const stored = (bestScore: number | null, visitsFinished: number, friends: string[], games: Record<string, unknown> = {}) =>
  memoryStorage({ [PROGRESS_KEY]: careRecord({ bestScore, visitsFinished, friends }, games) });

const bestShown = () => screen.queryByLabelText("BEST SCORE")?.querySelector(".best-score-value")?.textContent;
const friendCards = (label = "FRIENDS") => within(screen.getByRole("group", { name: label })).getAllByRole("button");
const friendCount = () => document.querySelector(".friend-count")?.textContent;

describe("a finished visit", () => {
  it.each([
    [0, 4],
    [2, 6],
    [4, 8]
  ])("with %i first choices dances off, then shows %i/8 by its hearts, its dinosaur as a friend, and where to go", async (firstChoices, score) => {
    const { user, clock } = openCareApp();
    await welcomeVisitor(user);
    for (const need of NEEDS) await meetNeed(user, clock, NEEDS.indexOf(need) >= firstChoices);

    expect(document.querySelector(".stage")?.hasAttribute("data-leaving")).toBe(true);
    act(() => clock.settle());

    expect(scoreShown()).toBe(`${score}/8`);
    const hearts = screen.getByRole("img", { name: `${score} OF 8 HEARTS` });
    expect([symbolsOf(hearts).every((symbol) => symbol === "heart"), hearts.querySelectorAll(".result-heart-won").length]).toEqual([true, score]);
    expect(document.querySelector(".care-result-hero")?.getAttribute("src")).toBe(fakeBodyPicture("tyrannosaurus"));
    const friend = screen.getByLabelText("FRIEND");
    expect([symbolOf(friend), friend.textContent]).toEqual(["heart", "TYRANNOSAURUS"]);
    expect(screen.getByRole("heading").textContent).toBe("NEW FRIEND!");
    expect(["NEW VISITOR", "FRIENDS", "HOME"].map((name) => symbolOf(button(name)))).toEqual(["footprints", "heart-handshake", "house"]);
  });

  it("is recorded once, as the last need is met, before the dinosaur dances off", async () => {
    const { user, clock, storage, unmount } = openCareApp();
    await welcomeVisitor(user);
    for (let at = 0; at < 3; at++) await meetNeed(user, clock);
    expect(storedCare(storage)).toBeUndefined();

    await user.click(document.querySelector<HTMLElement>('.tray-item[data-item="nest"]') ?? document.body);

    const recorded = { bestScore: 8, visitsFinished: 1, friends: ["tyrannosaurus"] };
    expect(storedCare(storage)).toEqual(recorded);
    await user.click(button("HOME"));
    act(() => clock.settle());
    expect([storedCare(storage), screen.queryByLabelText("SCORE")]).toEqual([recorded, null]);
    unmount();
    const reopened = openCareApp({ storage });
    await openCare(reopened.user);
    expect(storedCare(storage)).toEqual(recorded);
    expect(friendCount()).toBe("1");
  });

  it("sets and celebrates the first best", async () => {
    const { user, clock, storage } = openCareApp();
    await welcomeVisitor(user);

    await playVisit(user, clock, NEEDS);

    expect(celebrations()).toEqual(["FIRST BEST SCORE"]);
    expect(storedCare(storage)).toMatchObject({ bestScore: 4, visitsFinished: 1 });
  });

  it("celebrates beating the highest score, not the last", async () => {
    const storage = stored(6, 2, []);
    const { user, clock } = openCareApp({ storage });
    await welcomeVisitor(user);

    await playVisit(user, clock, refusalsFor(7));

    expect(celebrations()).toEqual(["NEW BEST SCORE"]);
    expect([screen.getByLabelText("BEST SCORE").querySelector(".best-score-beaten")?.textContent, bestShown()]).toEqual(["6", "7/8"]);
    expect(storedCare(storage)).toMatchObject({ bestScore: 7, visitsFinished: 3 });
  });

  it.each([7, 5])("keeps a best of 7 after a visit of %i, with no celebration", async (score) => {
    const storage = stored(7, 2, []);
    const { user, clock } = openCareApp({ storage });
    await welcomeVisitor(user);
    for (let need = needAsked(); need !== undefined; need = needAsked()) await meetNeed(user, clock, refusalsFor(score).includes(need));

    expect(document.querySelector(".stage")?.hasAttribute("data-leaving")).toBe(true);
    act(() => clock.settle());
    expect([scoreShown(), bestShown(), celebrations()]).toEqual([`${score}/8`, "7/8", []]);
    expect(storedCare(storage)).toMatchObject({ bestScore: 7 });
  });

  it("gives way at once to one fresh visit by another dinosaur on a quick double tap of NEW VISITOR", async () => {
    const clock = manualPictures();
    const { user, storage } = openCareApp({ clock });
    await welcomeVisitor(user);
    act(() => clock.finishAll());
    await playVisit(user, clock);

    await user.dblClick(button("NEW VISITOR"));

    expect([visitorShown().id, heartsShown(), needStates()]).toEqual(["triceratops", "0", ["current", "pending", "pending", "pending"]]);
    expect(storedCare(storage)).toMatchObject({ visitsFinished: 1 });
  });

  it("is kept going home from its result, and care opens on its welcome screen again", async () => {
    const { user, clock, storage } = openCareApp();
    await welcomeVisitor(user);
    await playVisit(user, clock);

    await user.click(button("HOME"));
    await openCare(user);

    expect(button("NEW VISITOR")).toBeDefined();
    expect([screen.getByLabelText("BEST SCORE").textContent, friendCount()]).toEqual(["8/8", "1"]);
    expect(storedCare(storage)).toEqual({ bestScore: 8, visitsFinished: 1, friends: ["tyrannosaurus"] });
  });

  it("shows its result and its friends with reduced motion without waiting for a dance", async () => {
    const { user, clock } = openCareApp({ reducedMotion: true });
    await welcomeVisitor(user);
    for (let at = 0; at < 4; at++) await meetNeed(user, clock);

    expect(clock.timers()).toEqual([160]);
    act(() => clock.settle());
    expect([scoreShown(), celebrations()]).toEqual(["8/8", ["FIRST BEST SCORE"]]);
    await user.click(button("FRIENDS"));
    await user.click(friendCards()[0] ?? document.body);
    expect([visitorShown().id, heartsShown()]).toEqual(["tyrannosaurus", "0"]);
  });
});

describe("friends", () => {
  it("are made by finishing a visit, each a card with its picture and name", async () => {
    const { user, clock } = openCareApp();
    await openCare(user);
    expect(friendCount()).toBe("0");
    await user.click(button("NEW VISITOR"));
    await playVisit(user, clock);

    await user.click(button("FRIENDS"));

    const [card] = friendCards();
    expect(friendCards()).toHaveLength(1);
    expect([card?.getAttribute("aria-label"), card?.textContent, card?.querySelector("img")?.getAttribute("src")]).toEqual([
      "Tyrannosaurus",
      "TYRANNOSAURUS",
      fakeBodyPicture("tyrannosaurus")
    ]);
    expect(friendCount()).toBe("1");
  });

  it("can be called back for a fresh visit, and stay one card", async () => {
    const storage = stored(5, 3, ["tyrannosaurus"]);
    const { user, clock } = openCareApp({ storage, visitors: visitorsFrom("triceratops") });
    await openCare(user);
    await user.click(button("FRIENDS"));

    await user.click(within(screen.getByRole("group", { name: "FRIENDS" })).getByRole("button", { name: "Tyrannosaurus" }));

    expect([visitorShown().id, heartsShown(), needStates()]).toEqual(["tyrannosaurus", "0", ["current", "pending", "pending", "pending"]]);
    await playVisit(user, clock);
    expect([celebrations(), screen.getByRole("heading").textContent]).toEqual([["NEW BEST SCORE"], "WELL DONE!"]);
    expect(storedCare(storage)).toEqual({ bestScore: 8, visitsFinished: 4, friends: ["tyrannosaurus"] });
    await user.click(button("FRIENDS"));
    expect(friendCards().map((card) => card.getAttribute("aria-label"))).toEqual(["Tyrannosaurus"]);
    expect(friendCount()).toBe("1");
  });

  it("are invited with a picture when there are none yet, with NEW VISITOR and BACK", async () => {
    const { user } = openCareApp();
    await openCare(user);

    await user.click(button("FRIENDS"));

    expect(document.querySelector(".no-friends-nest")?.getAttribute("src")).toBe(fakeItemPicture("nest"));
    expect(screen.getByText("NO FRIENDS YET. WELCOME A DINOSAUR!")).toBeDefined();
    expect([symbolOf(button("NEW VISITOR")), symbolOf(button("BACK"))]).toEqual(["footprints", "arrow-left"]);
    await user.click(button("BACK"));
    expect(button("FRIENDS")).toBeDefined();
    await user.click(button("NEW VISITOR"));
    expect(heartsShown()).toBe("0");
  });

  it("are all 42 dinosaurs once each, in the list's order, scrolled, each to be tapped", async () => {
    const storage = stored(8, 42, SHIPPED_VISITORS.map(({ id }) => id).reverse());
    const { user } = openCareApp({ storage });
    await openCare(user);

    await user.click(button("FRIENDS"));

    expect(friendCards().map((card) => card.getAttribute("aria-label"))).toEqual(SHIPPED_VISITORS.map(({ name }) => name.en));
    expect(SHIPPED_VISITORS).toHaveLength(42);
    expect(friendCount()).toBe("42");
    expect(getComputedStyle(screen.getByRole("group", { name: "FRIENDS" })).overflowY).toBe("auto");
    expect(["NEW VISITOR", "BACK", "HOME"].map((name) => symbolOf(button(name)))).toEqual(["footprints", "arrow-left", "house"]);
    const last = friendCards().at(-1);
    await user.click(last ?? document.body);
    expect(visitorShown().id).toBe(SHIPPED_VISITORS.at(-1)?.id);
  });

  it("show no card for a dinosaur no longer in the list, and change nothing kept", async () => {
    const storage = stored(7, 3, ["tyrannosaurus", "nonesuch"]);
    const before = storage.items.get(PROGRESS_KEY);
    const { user } = openCareApp({ storage });
    await openCare(user);
    expect(friendCount()).toBe("1");

    await user.click(button("FRIENDS"));

    expect(friendCards().map((card) => card.getAttribute("aria-label"))).toEqual(["Tyrannosaurus"]);
    expect(friendCount()).toBe("1");
    expect(storage.items.get(PROGRESS_KEY)).toBe(before);
  });

  it.each(["en", "ru"] as const)("speak %s on the result and the friends", async (language) => {
    const text = TEXTS[language];
    const { user, clock } = openCareApp({ deviceLanguage: language === "ru" ? "ru-RU" : "en-GB" });
    await user.click(button(text.care));
    await user.click(button(text.friends));
    expect(screen.getByText(text.noFriends)).toBeDefined();
    await user.click(button(text.newVisitor));
    await playVisit(user, clock);
    expect([text.newVisitor, text.friends, text.home].map((name) => symbolOf(button(name)))).toEqual(["footprints", "heart-handshake", "house"]);

    await user.click(button(text.friends));

    const name = shipped("tyrannosaurus").name[language];
    expect(friendCards(text.friends).map((card) => [card.getAttribute("aria-label"), card.textContent])).toEqual([[name, name.toLocaleUpperCase(language)]]);
    expect([text.newVisitor, text.back, text.home].map((label) => [button(label).textContent, symbolOf(button(label))])).toEqual([
      [text.newVisitor, "footprints"],
      [text.back, "arrow-left"],
      [text.home, "house"]
    ]);
  });
});

describe("care progress", () => {
  const QUIZ = { "compare-dinosaurs": { bestScore: 9, roundsPlayed: 4 } };

  it("survives reopening the app: finished visits, the best and friends", async () => {
    const storage = stored(7, 3, ["triceratops"]);
    const { user, clock } = openCareApp({ storage });

    expect(button("CARE").querySelector(".care-tile-best")?.textContent).toBe("7");
    await openCare(user);
    expect([screen.getByLabelText("BEST SCORE").textContent, friendCount()]).toEqual(["7/8", "1"]);
    await user.click(button("FRIENDS"));
    await user.click(friendCards()[0] ?? document.body);

    expect(visitorShown().id).toBe("triceratops");
    await playVisit(user, clock, refusalsFor(6));
    expect(storedCare(storage)).toEqual({ bestScore: 7, visitsFinished: 4, friends: ["triceratops"] });
  });

  it("is untouched by an unfinished visit left or dropped by a reload", async () => {
    const storage = stored(7, 3, ["triceratops"]);
    const before = storage.items.get(PROGRESS_KEY);
    const first = openCareApp({ storage });
    await welcomeVisitor(first.user);
    await meetNeed(first.user, first.clock);
    await meetNeed(first.user, first.clock);
    expect([visitorShown().id, heartsShown()]).toEqual(["tyrannosaurus", "4"]);

    await first.user.click(button("HOME"));
    expect(storage.items.get(PROGRESS_KEY)).toBe(before);
    await welcomeVisitor(first.user);
    await meetNeed(first.user, first.clock);
    first.unmount();

    expect(storage.items.get(PROGRESS_KEY)).toBe(before);
    const { user } = openCareApp({ storage });
    await openCare(user);
    await user.click(button("FRIENDS"));
    expect(friendCards().map((card) => card.getAttribute("aria-label"))).toEqual(["Triceratops"]);
  });

  it("leaves the quiz's scores, the language and the theme alone, and the quiz's saves leave care alone", async () => {
    const storage = memoryStorage({ [PROGRESS_KEY]: JSON.stringify({ schemaVersion: 1, games: QUIZ }), [LANGUAGE_KEY]: "en", [THEME_KEY]: "dark" });
    const first = openCareApp({ storage });
    await welcomeVisitor(first.user);
    await playVisit(first.user, first.clock);
    first.unmount();

    openCareApp({ storage });

    expect([storage.items.get(LANGUAGE_KEY), storage.items.get(THEME_KEY)]).toEqual(["en", "dark"]);
    expect(localProgress(() => storage).load()).toEqual(quizSaved(9, 4));
    expect(document.documentElement.dataset.theme).toBe("dark");
    localProgress(() => storage).save(quizSaved(10, 5));
    expect(storedCare(storage)).toEqual({ bestScore: 8, visitsFinished: 1, friends: ["tyrannosaurus"] });
  });

  it.each<[string, string, boolean]>([
    ["absent", JSON.stringify({ schemaVersion: 1, games: QUIZ }), true],
    ["malformed", careRecord({ bestScore: "7", visitsFinished: 3, friends: "triceratops" }, QUIZ), true],
    ["from an unknown schema version", JSON.stringify({ schemaVersion: 2, games: { ...QUIZ, "dinosaur-care": { bestScore: 7, visitsFinished: 3, friends: [] } } }), false]
  ])("starts afresh when %s", async (_, raw, quizReadable) => {
    const storage = memoryStorage({ [PROGRESS_KEY]: raw });
    const { user, clock } = openCareApp({ storage });
    await openCare(user);
    expect([screen.queryByLabelText("BEST SCORE"), friendCount()]).toEqual([null, "0"]);

    await user.click(button("NEW VISITOR"));
    await playVisit(user, clock, refusalsFor(6));

    expect(celebrations()).toEqual(["FIRST BEST SCORE"]);
    expect(storedCare(storage)).toEqual({ bestScore: 6, visitsFinished: 1, friends: ["tyrannosaurus"] });
    expect(localProgress(() => storage).load()).toEqual(quizReadable ? quizSaved(9, 4) : quizSaved(null, 0));
  });

  it("goes on when progress cannot be read: the score and departure, no best, and a friend while the app is open", async () => {
    const storage = memoryStorage({ [PROGRESS_KEY]: careRecord({ bestScore: 7, visitsFinished: 3, friends: [] }) }, { read: false });
    const { user, clock } = openCareApp({ storage });
    await welcomeVisitor(user);
    for (let need = needAsked(); need !== undefined; need = needAsked()) await meetNeed(user, clock, refusalsFor(6).includes(need));
    expect(document.querySelector(".stage")?.hasAttribute("data-leaving")).toBe(true);

    act(() => clock.settle());

    expect([scoreShown(), screen.queryByLabelText("BEST SCORE"), celebrations()]).toEqual(["6/8", null, []]);
    await user.click(button("FRIENDS"));
    expect(friendCards().map((card) => card.getAttribute("aria-label"))).toEqual(["Tyrannosaurus"]);
  });

  it("goes on when progress cannot be saved, compared with the session's best, and only the saved progress after a reload", async () => {
    const storage = memoryStorage({ [PROGRESS_KEY]: careRecord({ bestScore: 5, visitsFinished: 2, friends: [] }) }, { save: false });
    const first = openCareApp({ storage });
    await welcomeVisitor(first.user);

    await playVisit(first.user, first.clock, refusalsFor(6));

    expect([celebrations(), bestShown()]).toEqual([["NEW BEST SCORE"], "6/8"]);
    await first.user.click(button("FRIENDS"));
    expect(friendCards().map((card) => card.getAttribute("aria-label"))).toEqual(["Tyrannosaurus"]);
    await first.user.click(button("NEW VISITOR"));
    await playVisit(first.user, first.clock, refusalsFor(6));
    expect([celebrations(), bestShown()]).toEqual([[], "6/8"]);
    first.unmount();

    const { user } = openCareApp({ storage });
    await openCare(user);
    expect([screen.getByLabelText("BEST SCORE").textContent, friendCount()]).toEqual(["5/8", "0"]);
  });
});
