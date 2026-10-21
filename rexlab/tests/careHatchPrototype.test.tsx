import { beforeEach, describe, expect, it } from "vitest";
import { anEgg, BABIES, ITEMS, startCareHatch, tap, WANTS, type Baby, type Item, type Nursery, type Options, type Reaction, type Want } from "../prototypes/careHatch.ts";

// The hatch and grow care prototype of LAB-387: the nursery's rules, then
// the page played by its taps.

const always = (value: number) => () => value;
const tyrannosaurus = BABIES.find((baby) => baby.id === "tyrannosaurus") as Baby;
const triceratops = BABIES.find((baby) => baby.id === "triceratops") as Baby;
const ITEM_FOR: Record<Want, Item> = { hungry: "meat", thirsty: "water", dirty: "bath", sleepy: "nest" };

function hatched(baby: Baby, wants: readonly Want[] = WANTS): Nursery {
  return { phase: "baby", baby, wants, grown: 0 };
}

describe("the nursery", () => {
  it("hatches only land dinosaurs, each with its picture", () => {
    expect(BABIES).toHaveLength(42);
    expect(BABIES.every((baby) => baby.picture !== "")).toBe(true);
    expect(BABIES.map((baby) => baby.id)).not.toContain("pteranodon");
  });

  it("wobbles the egg twice and hatches a baby on the third tap, wanting all four things", () => {
    let nursery = anEgg();
    const reactions: (Reaction | undefined)[] = [];
    for (let taps = 0; taps < 3; taps += 1) {
      const [next, reaction] = tap(nursery, "egg", always(0), tyrannosaurus);
      nursery = next;
      reactions.push(reaction);
    }

    expect(reactions).toEqual(["wobble", "wobble", "hatch"]);
    expect(nursery.phase === "baby" && [nursery.baby.id, [...nursery.wants].sort(), nursery.grown]).toEqual(["tyrannosaurus", [...WANTS].sort(), 0]);
  });

  it("ignores items while it is still an egg", () => {
    expect(tap(anEgg(), "meat", always(0))).toEqual([anEgg(), undefined]);
  });

  it("spits out a food it does not eat, even when hungry, and does not grow", () => {
    const nursery = hatched(triceratops, ["hungry", "thirsty", "dirty", "sleepy"]);

    expect(tap(nursery, "meat", always(0))).toEqual([nursery, "spit"]);
  });

  it("plays with a bath or nest it does not need yet, and refuses water it does not want", () => {
    const nursery = hatched(tyrannosaurus, ["hungry", "thirsty", "dirty", "sleepy"]);

    expect([tap(nursery, "bath", always(0))[1], tap(nursery, "nest", always(0))[1], tap(nursery, "water", always(0))[1]]).toEqual(["splash", "bounce", "not-now"]);
    expect(tap(nursery, "bath", always(0))[0]).toBe(nursery);
  });

  it("grows a step for each want met, and dances when grown", () => {
    let nursery = hatched(tyrannosaurus, ["dirty", "hungry", "sleepy", "thirsty"]);
    const reactions: (Reaction | undefined)[] = [];
    for (const item of ["bath", "meat", "nest", "water"] as const) {
      const [next, reaction] = tap(nursery, item, always(0));
      nursery = next;
      reactions.push(reaction);
    }

    expect(reactions).toEqual(["wash", "eat", "sleep", "dance"]);
    expect(nursery).toEqual({ phase: "grown", baby: tyrannosaurus });
  });

  it("giggles when the baby itself is tapped", () => {
    expect(tap(hatched(tyrannosaurus), "baby", always(0))[1]).toBe("giggle");
  });
});

let root: HTMLElement;
let clock: number;
let pending: (() => void)[];
let heard: string[];

beforeEach(() => {
  root = document.createElement("main");
  document.body.replaceChildren(root);
  clock = 0;
  pending = [];
  heard = [];
});

function start(options: Partial<Options> = {}) {
  startCareHatch(root, {
    // The first dinosaur, Tyrannosaurus, hatches; no burp or sneeze.
    random: always(0),
    sounds: { play: (reaction, extra) => heard.push(extra ?? reaction) },
    language: "en",
    now: () => clock,
    later: (run) => pending.push(run),
    ...options
  });
}

// Taps `target`, a second after the last tap unless `soon`.
function press(target: Item | "egg" | "baby", soon = false) {
  clock += soon ? 100 : 1000;
  const button = root.querySelector(`[data-target="${target}"]`);
  if (button === null) throw new Error(`No ${target} to tap`);
  button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

const creature = () => root.querySelector<HTMLElement>(".hatch-creature")?.dataset ?? {};
const reaction = () => root.querySelector<HTMLElement>(".hatch-stage")?.dataset.reaction;
const name = () => root.querySelector(".hatch-name")?.textContent;
const friends = () => [...root.querySelectorAll<HTMLImageElement>(".hatch-friend")].map((friend) => friend.alt);

function hatch() {
  for (let taps = 0; taps < 3; taps += 1) press("egg");
}

describe("the hatch and grow page", () => {
  it("starts with an egg and the five items, and shows no score or timer", () => {
    start();

    expect(creature().phase).toBe("egg");
    expect([...root.querySelectorAll<HTMLElement>(".hatch-item")].map((item) => item.dataset.target)).toEqual([...ITEMS]);
    expect(root.textContent).not.toMatch(/\d/);
  });

  it("hatches a baby that shows what it wants, and plays a sound for every tap", () => {
    start();

    hatch();

    expect([creature().phase, creature().grown, name()]).toEqual(["baby", "0", "TYRANNOSAURUS"]);
    expect(WANTS).toContain(creature().want);
    expect(heard).toEqual(["wobble", "wobble", "hatch"]);
  });

  it("ignores a tap while the last reaction plays", () => {
    start();
    hatch();

    press("baby");
    press("baby", true);

    expect(heard.filter((sound) => sound === "giggle")).toHaveLength(1);
  });

  it("spits out plants and says so", () => {
    start();
    hatch();

    press("plants");

    expect([reaction(), creature().grown]).toEqual(["spit", "0"]);
    expect(root.querySelector(".hatch-say")?.textContent).toBe("BLEH!");
  });

  it("grows with each want met, dances, joins the friends and leaves a new egg", () => {
    start();
    hatch();
    const grown: (string | undefined)[] = [];
    for (let step = 0; step < 4; step += 1) {
      press(ITEM_FOR[creature().want as Want]);
      grown.push(creature().grown);
    }

    expect(grown).toEqual(["1", "2", "3", "4"]);
    expect(reaction()).toBe("dance");
    expect(friends()).toEqual([]);

    pending.forEach((run) => run());

    expect(friends()).toEqual(["TYRANNOSAURUS"]);
    expect(creature().phase).toBe("egg");
  });

  it("burps now and then after a meal", () => {
    // Tyrannosaurus hatches wanting food first, then a meal burps.
    const draws = [0, 0.99, 0.99, 0.99];
    start({ random: () => draws.shift() ?? 0.01 });
    hatch();
    expect(creature().want).toBe("hungry");

    press("meat");

    expect(root.querySelector(".hatch-say")?.textContent).toBe("BURP!");
    expect(heard.at(-1)).toBe("burp");
  });

  it("speaks Russian when the app does", () => {
    start({ language: "ru" });
    hatch();

    expect(name()).toBe("ТИРАННОЗАВР");
    expect(root.querySelector('[data-target="nest"]')?.textContent).toBe("ГНЕЗДО");
  });
});
