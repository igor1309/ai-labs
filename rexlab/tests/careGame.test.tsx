import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Item, Need } from "../src/care/index.ts";
import { TEXTS } from "../src/language/texts.ts";
import { PROGRESS_KEY } from "../src/localProgress.ts";
import { endReaction, meetNeed, meets, needAsked, playVisit, trayItem, visitorShown } from "./care.ts";
import {
  bubbleShows,
  button,
  careRecord,
  heartsShown,
  needStates,
  openCare,
  openCareApp,
  shipped,
  storedCare,
  trayItems,
  visitorsFrom,
  welcomeVisitor
} from "./careApp.tsx";
import { fakeBodyPicture, fakeItemPicture, manualOrientation, manualPictures, memoryStorage, symbolOf } from "./support.ts";

// The name of every symbol an element shows, in order.
const symbolsOf = (element: Element) =>
  [...element.querySelectorAll("svg.lucide")].map((svg) => [...svg.classList].find((name) => name.startsWith("lucide-"))?.slice("lucide-".length));

const stage = () => document.querySelector(".stage");
const reaction = () => stage()?.getAttribute("data-reaction") ?? undefined;
const visitorName = () => document.querySelector(".visitor-name");

describe("the CARE tile", () => {
  it("is beside the COMPARE card, under ALL DINOSAURS, with a heart and a dinosaur", () => {
    openCareApp();

    const tile = button("CARE");
    expect(symbolOf(tile)).toBe("heart");
    expect(tile.querySelector("img")?.getAttribute("src")).toBe(fakeBodyPicture("parasaurolophus"));
    expect(button("ALL DINOSAURS").nextElementSibling).toBe(tile);
    expect(tile.parentElement?.previousElementSibling).toBe(button("COMPARE"));
    expect(tile.querySelector(".care-tile-best")).toBeNull();
  });

  it("shows the care best score with a trophy once a visit is finished", async () => {
    const { user, clock } = openCareApp();

    await welcomeVisitor(user);
    await playVisit(user, clock, ["hungry"]);
    await user.click(button("HOME"));

    const best = button("CARE").querySelector(".care-tile-best");
    expect(best && [symbolOf(best), best.textContent]).toEqual(["trophy", "7"]);
  });

  it("opens the care welcome screen: NEW VISITOR, FRIENDS with the number of friends, and HOME", async () => {
    const storage = memoryStorage({ [PROGRESS_KEY]: careRecord({ bestScore: 6, visitsFinished: 3, friends: ["triceratops", "gallimimus"] }) });
    const { user } = openCareApp({ storage });

    await openCare(user);

    expect(symbolsOf(button("NEW VISITOR"))).toContain("footprints");
    const friends = button("FRIENDS");
    expect(symbolsOf(friends)).toContain("heart-handshake");
    const count = friends.querySelector(".friend-count");
    expect(count && [symbolOf(count), count.textContent]).toEqual(["heart", "2"]);
    expect(symbolOf(button("HOME"))).toBe("house");
    expect(screen.getByLabelText("BEST SCORE").textContent).toBe("6/8");
  });
});

describe("a new visitor", () => {
  it("is a dinosaur from the list, shown large with its name in capitals, asking for food, with 0 hearts", async () => {
    const { user } = openCareApp();

    await welcomeVisitor(user);

    const name = screen.getByRole("heading", { name: "Tyrannosaurus" });
    expect(name.textContent).toBe("TYRANNOSAURUS");
    expect(parseFloat(getComputedStyle(name).fontSize)).toBeGreaterThanOrEqual(32);
    expect(document.querySelector("img.visitor")?.getAttribute("src")).toBe(fakeBodyPicture("tyrannosaurus"));
    expect(bubbleShows()).toEqual(["bowl"]);
    expect(needStates()).toEqual(["current", "pending", "pending", "pending"]);
    expect(needAsked()).toBe("hungry");
    expect(heartsShown()).toBe("0");
  });

  it("is another dinosaur than the last, and may be a friend already", async () => {
    const storage = memoryStorage({ [PROGRESS_KEY]: careRecord({ bestScore: 6, visitsFinished: 1, friends: ["triceratops"] }) });
    const { user, clock } = openCareApp({ storage });
    await welcomeVisitor(user);
    await playVisit(user, clock);

    await user.click(button("NEW VISITOR"));

    expect(visitorShown().id).toBe("triceratops");
  });

  it("starts one visit on a quick double tap", async () => {
    const clock = manualPictures();
    const { user } = openCareApp({ clock });
    await openCare(user);

    await user.dblClick(button("NEW VISITOR"));

    expect(clock.loading()).toEqual([fakeBodyPicture("tyrannosaurus")]);
    expect(clock.timers()).toEqual([1000]);
    act(() => clock.finish(fakeBodyPicture("tyrannosaurus")));
    expect(heartsShown()).toBe("0");
    expect([clock.loading(), clock.timers()]).toEqual([[], []]);
  });

  it("waits for its picture at most a second, and goes on without it, a dinosaur symbol by its name", async () => {
    const clock = manualPictures();
    const { user } = openCareApp({ clock });
    await openCare(user);

    await user.click(button("NEW VISITOR"));

    expect(screen.queryByLabelText("HEARTS")).toBeNull();
    expect(button("NEW VISITOR")).toBeDefined();
    act(() => clock.fire(1000));
    expect(heartsShown()).toBe("0");
    const shown = document.body.innerHTML;
    act(() => clock.finish(fakeBodyPicture("tyrannosaurus")));
    expect(document.body.innerHTML).toBe(shown);

    fireEvent.error(document.querySelector("img.visitor") ?? document.body);

    expect(document.querySelector("img.visitor")).toBeNull();
    expect([symbolOf(visitorName() ?? document.body), visitorName()?.textContent]).toEqual(["footprints", "TYRANNOSAURUS"]);
    await meetNeed(user, clock);
    expect([heartsShown(), needAsked()]).toEqual(["2", "thirsty"]);
  });

  it.each(["en", "ru"] as const)("speaks %s, the dinosaur's name and every word in capitals", async (language) => {
    const text = TEXTS[language];
    const { user } = openCareApp({ deviceLanguage: language === "ru" ? "ru-RU" : "en-GB" });

    await user.click(button(text.care));
    expect([text.newVisitor, text.friends, text.home].map((name) => button(name).textContent)).toEqual([
      text.newVisitor,
      `${text.friends}0`,
      text.home
    ]);
    await user.click(button(text.newVisitor));

    expect(trayItems().map((item) => trayItem(item).textContent)).toEqual(["plants", "meat", "water", "bath", "nest"].map((item) => text.items[item as Item]));
    const name = shipped("tyrannosaurus").name[language];
    expect(visitorName()?.getAttribute("aria-label")).toBe(name);
    expect(visitorName()?.textContent).toBe(name.toLocaleUpperCase(language));
    expect(button(text.home).textContent).toBe(text.home);
  });

  it("shows the need asked now and the hearts earned by symbols as well as colour", async () => {
    const { user, clock } = openCareApp();
    await welcomeVisitor(user);
    const needs = () => [...document.querySelectorAll(".need")];

    expect(needs().map(symbolOf)).toEqual(["utensils", "droplet", "bath", "moon"]);
    expect(document.querySelector(".need-bubble")?.getAttribute("data-need")).toBe("hungry");
    await meetNeed(user, clock);

    expect(needs().map(symbolOf)).toEqual(["check", "droplet", "bath", "moon"]);
    expect(needs().map((need) => need.getAttribute("aria-label"))).toEqual(["HUNGRY: DONE", "THIRSTY: NOW", "DIRTY: LATER", "TIRED: LATER"]);
    const hearts = screen.getByLabelText("HEARTS");
    expect([symbolOf(hearts), hearts.textContent]).toEqual(["heart", "2"]);
  });
});

describe("the items", () => {
  it("are five big picture buttons with a word beside each, given by one tap, pressed first", async () => {
    const { user } = openCareApp();
    await welcomeVisitor(user);

    expect(trayItems()).toEqual(["plants", "meat", "water", "bath", "nest"]);
    for (const item of trayItems()) {
      const shown = trayItem(item);
      expect(shown.querySelector("img")?.getAttribute("src")).toBe(fakeItemPicture(item));
      expect(shown.querySelector(".tray-label")?.textContent).toBe(item.toUpperCase());
      expect(parseFloat(getComputedStyle(shown).minWidth)).toBeGreaterThanOrEqual(48);
      expect(parseFloat(getComputedStyle(shown).height)).toBeGreaterThanOrEqual(48);
    }
    const meat = trayItem("meat");

    await user.pointer({ keys: "[TouchA>]", target: meat });
    expect(getComputedStyle(meat).transform).toMatch(/^scale\(0\.\d+\)$/);
    expect(reaction()).toBeUndefined();
    await user.pointer({ keys: "[/TouchA]", target: meat });

    expect(reaction()).toBe("happy");
    expect(stage()?.getAttribute("data-item")).toBe("meat");
  });

  it("gives nothing on a touch moved off its item before it lifts", async () => {
    const { user, clock } = openCareApp();
    await welcomeVisitor(user);

    await user.pointer([{ keys: "[TouchA>]", target: trayItem("meat") }, { pointerName: "TouchA", target: document.body }, { keys: "[/TouchA]" }]);

    expect([reaction(), needAsked(), heartsShown(), clock.timers()]).toEqual([undefined, "hungry", "0", []]);
    expect(trayItem("meat").hasAttribute("data-pressed")).toBe(false);
    await meetNeed(user, clock);
    expect(heartsShown()).toBe("2");
  });
});

describe("leaving a visit", () => {
  it("goes home at once, earns nothing, and the next visit starts afresh", async () => {
    const { user, clock, storage } = openCareApp();
    await welcomeVisitor(user);
    await meetNeed(user, clock);
    await user.click(trayItem("water"));

    await user.click(button("HOME"));
    act(() => clock.settle());

    expect(button("COMPARE")).toBeDefined();
    expect(storedCare(storage)).toBeUndefined();
    await user.click(button("CARE"));
    expect(button("NEW VISITOR")).toBeDefined();
    await user.click(button("NEW VISITOR"));
    expect([heartsShown(), needStates()]).toEqual(["0", ["current", "pending", "pending", "pending"]]);
  });

  it("starts no visit when the child goes home while its picture loads, and the next visit starts afresh", async () => {
    const clock = manualPictures();
    const { user } = openCareApp({ clock });
    await openCare(user);
    await user.click(button("NEW VISITOR"));
    expect(clock.loading()).toEqual([fakeBodyPicture("tyrannosaurus")]);

    await user.click(button("HOME"));
    act(() => clock.finish(fakeBodyPicture("tyrannosaurus")));

    expect(button("COMPARE")).toBeDefined();
    expect(screen.queryByLabelText("HEARTS")).toBeNull();
    await user.click(button("CARE"));
    await user.click(button("NEW VISITOR"));
    expect(clock.loading()).toEqual([fakeBodyPicture("tyrannosaurus")]);
    act(() => clock.finish(fakeBodyPicture("tyrannosaurus")));
    expect([visitorShown().id, heartsShown(), needStates()]).toEqual(["tyrannosaurus", "0", ["current", "pending", "pending", "pending"]]);
  });

  it("is dropped on a reload, which opens care on its welcome screen", async () => {
    const storage = memoryStorage();
    const first = openCareApp({ storage });
    await welcomeVisitor(first.user);
    await meetNeed(first.user, first.clock);
    await meetNeed(first.user, first.clock);

    first.unmount();
    const { user } = openCareApp({ storage });
    await openCare(user);

    expect(button("NEW VISITOR")).toBeDefined();
    expect(screen.queryByLabelText("HEARTS")).toBeNull();
    expect(storedCare(storage)).toBeUndefined();
  });

  it("pauses in portrait, nothing to give behind the picture, and goes on unchanged", async () => {
    const orientation = manualOrientation("landscape");
    const { user, clock } = openCareApp({ orientation });
    await welcomeVisitor(user);
    await meetNeed(user, clock);

    act(() => orientation.turn("portrait"));

    expect(screen.getByRole("img", { name: TEXTS.en.turnSideways })).toBeDefined();
    expect(document.querySelector(".tray-item")).toBeNull();
    act(() => orientation.turn("landscape"));
    expect([visitorShown().id, needAsked(), heartsShown()]).toEqual(["tyrannosaurus", "thirsty", "2"]);
    await meetNeed(user, clock);
    expect(heartsShown()).toBe("4");
  });
});

describe("the need's bubble", () => {
  it("shows the empty bowl, water, a bath and a nest with a sleeping symbol, each need highlighted in turn", async () => {
    const { user, clock } = openCareApp();
    await welcomeVisitor(user);
    const seen: Array<[Need | undefined, Array<string | null>, number]> = [];

    for (let need = needAsked(); need !== undefined; need = needAsked()) {
      seen.push([need, bubbleShows(), needStates().indexOf("current")]);
      await meetNeed(user, clock);
    }

    expect(seen).toEqual([
      ["hungry", ["bowl"], 0],
      ["thirsty", ["water"], 1],
      ["dirty", ["bath"], 2],
      ["tired", ["nest"], 3]
    ]);
  });

  it("shows a moon on the nest of a tired dinosaur", async () => {
    const { user, clock } = openCareApp();
    await welcomeVisitor(user);
    for (let at = 0; at < 3; at++) await meetNeed(user, clock);

    const badge = document.querySelector(".need-bubble .bubble-badge");
    expect(badge && symbolOf(badge)).toBe("moon");
  });

  it.each(["tyrannosaurus", "triceratops", "gallimimus", "oviraptor"])("shows the same empty bowl for every hungry dinosaur, never its food: %s", async (id) => {
    const { user } = openCareApp({ visitors: visitorsFrom(id) });

    await welcomeVisitor(user);

    expect(bubbleShows()).toEqual(["bowl"]);
    expect(screen.getByRole("img", { name: "HUNGRY" })).toBeDefined();
  });

  it.each<[string, Item, "happy" | "refusal"]>([
    ["tyrannosaurus", "meat", "happy"],
    ["tyrannosaurus", "plants", "refusal"],
    ["triceratops", "plants", "happy"],
    ["triceratops", "meat", "refusal"],
    ["gallimimus", "plants", "happy"],
    ["gallimimus", "meat", "happy"],
    ["oviraptor", "plants", "happy"],
    ["oviraptor", "meat", "happy"]
  ])("feeds %s as the dinosaur list says: %s is a %s reaction", async (id, item, expected) => {
    const { user, clock } = openCareApp({ visitors: visitorsFrom(id) });
    await welcomeVisitor(user);

    await user.click(trayItem(item));

    expect(reaction()).toBe(expected);
    endReaction(clock);
    expect([needAsked(), heartsShown()]).toEqual(expected === "happy" ? ["thirsty", "2"] : ["hungry", "0"]);
  });

  it.each<[Need, Item]>([
    ["thirsty", "water"],
    ["dirty", "bath"],
    ["tired", "nest"]
  ])("meets %s with %s", async (need, item) => {
    const { user, clock } = openCareApp();
    await welcomeVisitor(user);
    while (needAsked() !== need) await meetNeed(user, clock);

    await user.click(trayItem(item));

    expect([reaction(), stage()?.getAttribute("data-item")]).toEqual(["happy", item]);
    expect(document.querySelector(".rising")?.getAttribute("data-item") ?? null).toBe(item === "water" ? null : item);
    endReaction(clock);
    expect(document.querySelector(`.need[data-need="${need}"]`)?.getAttribute("data-state")).toBe("met");
  });

  it.each<[Need, number, Item]>([
    ["hungry", 0, "water"],
    ["thirsty", 2, "nest"],
    ["dirty", 4, "plants"],
    ["tired", 6, "bath"]
  ])("asks a %s dinosaur with %i hearts again for what it needs after %s, gently, taking none", async (need, hearts, item) => {
    const { user, clock } = openCareApp();
    await welcomeVisitor(user);
    while (needAsked() !== need) await meetNeed(user, clock);
    expect(heartsShown()).toBe(String(hearts));

    await user.click(trayItem(item));

    expect(reaction()).toBe("refusal");
    expect(symbolsOf(document.body)).not.toContain("x");
    expect(document.body.textContent).not.toMatch(/WRONG|-\d/);
    expect(document.querySelector(".hearts-pop")).toBeNull();
    endReaction(clock);
    const right = meets(visitorShown(), need);
    expect([needAsked(), heartsShown(), bubbleShows()]).toEqual([need, String(hearts), [right]]);
    expect(trayItem(right).hasAttribute("data-suggested")).toBe(true);
    expect(trayItem(item).hasAttribute("data-refused")).toBe(true);
    await user.click(trayItem(right));
    expect(reaction()).toBe("happy");
  });

  it("shows Triceratops plants to try after it turns meat away, and gives 1 heart for them", async () => {
    const { user, clock } = openCareApp({ visitors: visitorsFrom("triceratops") });
    await welcomeVisitor(user);

    await user.click(trayItem("meat"));
    endReaction(clock);

    expect([bubbleShows(), heartsShown(), symbolsOf(document.body).includes("x")]).toEqual([["plants"], "0", false]);
    await user.click(trayItem("plants"));
    expect(reaction()).toBe("happy");
    endReaction(clock);
    expect(heartsShown()).toBe("1");
  });
});

describe("hearts", () => {
  const popped = () => {
    const pop = document.querySelector(".hearts-pop");
    return pop && [symbolsOf(pop).length, pop.querySelector(".hearts-pop-count")?.textContent];
  };

  it("are two for a first-choice match, joining the total as the need is marked met", async () => {
    const { user, clock } = openCareApp();
    await welcomeVisitor(user);
    await meetNeed(user, clock);

    await user.click(trayItem("water"));

    expect(popped()).toEqual([2, "+2"]);
    expect([heartsShown(), needStates()[1]]).toEqual(["4", "met"]);
  });

  it("are one after any number of refusals", async () => {
    const { user, clock } = openCareApp();
    await welcomeVisitor(user);
    await meetNeed(user, clock);
    for (const item of ["nest", "plants", "bath"] as const) {
      await user.click(trayItem(item));
      endReaction(clock);
    }
    expect(heartsShown()).toBe("2");

    await user.click(trayItem("water"));

    expect(popped()).toEqual([1, "+1"]);
    endReaction(clock);
    expect([heartsShown(), needAsked()]).toEqual(["3", "dirty"]);
  });

  it("give the first-choice bonus afresh for each need", async () => {
    const { user, clock } = openCareApp();
    await welcomeVisitor(user);
    await meetNeed(user, clock, true);
    expect(heartsShown()).toBe("1");

    await meetNeed(user, clock);

    expect(heartsShown()).toBe("3");
  });

  it("are earned only for the first tap while the dinosaur drinks, and the next need keeps its first choice", async () => {
    const { user, clock } = openCareApp();
    await welcomeVisitor(user);
    await meetNeed(user, clock);

    await user.dblClick(trayItem("water"));
    await user.click(trayItem("bath"));

    expect(clock.timers()).toHaveLength(1);
    expect(trayItems().map((item) => trayItem(item).disabled)).toEqual([true, true, true, true, true]);
    endReaction(clock);
    expect([heartsShown(), needAsked(), document.querySelector(".tray-item[data-refused]")]).toEqual(["4", "dirty", null]);
    await meetNeed(user, clock);
    expect(heartsShown()).toBe("6");
  });

  it("are not earned for a tap while a dinosaur turns food away", async () => {
    const { user, clock } = openCareApp({ visitors: visitorsFrom("triceratops") });
    await welcomeVisitor(user);

    await user.click(trayItem("meat"));
    await user.click(trayItem("plants"));

    expect(clock.timers()).toHaveLength(1);
    endReaction(clock);
    expect([needAsked(), heartsShown()]).toEqual(["hungry", "0"]);
    await user.click(trayItem("plants"));
    endReaction(clock);
    expect(heartsShown()).toBe("1");
  });

  it("come for each of the four needs once, in order, each asked after the last reaction, then the dinosaur dances off to its result", async () => {
    const { user, clock } = openCareApp();
    await welcomeVisitor(user);
    const asked: Need[] = [];

    for (const item of ["meat", "water", "bath", "nest"] as const) {
      asked.push(needAsked() ?? "hungry");
      await user.click(trayItem(item));
      expect([needAsked(), bubbleShows()]).toEqual([undefined, []]);
      endReaction(clock);
    }

    expect(asked).toEqual(["hungry", "thirsty", "dirty", "tired"]);
    expect(needStates()).toEqual(["met", "met", "met", "met"]);
    expect(stage()?.hasAttribute("data-leaving")).toBe(true);
    await user.click(trayItem("meat"));
    expect([heartsShown(), clock.timers()]).toEqual(["8", [1280]]);
    endReaction(clock);
    expect(screen.getByLabelText("SCORE").textContent).toBe("8/8");
  });

  it("are not lost while a need waits: nothing ticks, and a first choice still earns two", async () => {
    const { user, clock } = openCareApp();
    await welcomeVisitor(user);

    expect(clock.timers()).toEqual([]);
    await meetNeed(user, clock);

    expect(heartsShown()).toBe("2");
  });
});

// The tokens of app.css, in milliseconds, in full motion and reduced.
function tokens(): Record<"motion" | "reduced", Record<string, number>> {
  const css = readFileSync(join(import.meta.dirname, "../src/app.css"), "utf8");
  const read = (block: string) => Object.fromEntries([...block.matchAll(/--motion-(\w+):\s*(\d+)ms/g)].map(([, name, ms]) => [name ?? "", Number(ms)]));
  const reducedAt = css.indexOf("@media (prefers-reduced-motion: reduce)");
  const motion = read(css.slice(0, reducedAt));
  return { motion, reduced: { ...motion, ...read(css.slice(reducedAt, css.indexOf("}", reducedAt))) } };
}

describe("care's motion", () => {
  // How long app.css plays each reaction: the item flies in over a screen
  // change, then the dinosaur hops (0.8 counts) while its hearts pop and
  // fly off (two standards), or turns away (1.5 standards); the happy
  // dinosaur dances (1.6 counts) and walks off over a screen change.
  const lengths = ({ screen: change = 0, standard = 0, count = 0 }: Record<string, number>) => ({
    happy: change + Math.max(count * 0.8, standard * 2),
    refusal: change + standard * 1.5,
    departure: count * 1.6 + change
  });

  it.each(["motion", "reduced"] as const)("waits for each reaction as app.css plays it, in %s, with the same rewards, and items back after", async (setting) => {
    const expected = lengths(tokens()[setting]);
    const { user, clock } = openCareApp({ reducedMotion: setting === "reduced" });
    await welcomeVisitor(user);

    await user.click(trayItem("water"));
    expect(clock.timers()).toEqual([expected.refusal]);
    expect(trayItem("meat").disabled).toBe(true);
    endReaction(clock);
    expect(trayItem("meat").disabled).toBe(false);
    await user.click(trayItem("meat"));
    expect(clock.timers()).toEqual([expected.happy]);
    endReaction(clock);
    for (const item of ["water", "bath", "nest"] as const) {
      await user.click(trayItem(item));
      endReaction(clock);
    }

    expect(clock.timers()).toEqual([expected.departure]);
    endReaction(clock);
    expect(screen.getByLabelText("SCORE").textContent).toBe("7/8");
  });
});

describe("the welcome screen", () => {
  it("shows a dinosaur knocking on the NEW VISITOR card", async () => {
    const { user } = openCareApp();

    await openCare(user);

    const card = button("NEW VISITOR");
    expect(within(card).getByText("NEW VISITOR")).toBeDefined();
    expect(card.querySelector("img")?.getAttribute("src")).toBe(fakeBodyPicture("brachiosaurus"));
    expect(symbolsOf(card)).toEqual(["door-open", "footprints"]);
  });
});
