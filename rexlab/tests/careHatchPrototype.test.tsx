import { beforeEach, describe, expect, it } from "vitest";
import {
  anEgg,
  BABIES,
  hatch as hatchAt,
  ITEMS,
  MEAT_EATERS,
  PLANT_EATERS,
  startCareHatch,
  tap,
  WANTS,
  type Baby,
  type Item,
  type Nursery,
  type Options,
  type Reaction,
  type Target,
  type Want,
} from "../prototypes/careHatch.ts";

// The hatch and grow care prototype of LAB-387: the nursery's rules, then
// the page played by its taps.

const always = (value: number) => () => value;
const tyrannosaurus = BABIES.find(
  (baby) => baby.id === "tyrannosaurus",
) as Baby;
const triceratops = BABIES.find((baby) => baby.id === "triceratops") as Baby;
const ITEM_FOR: Record<Want, Item> = {
  hungry: "meat",
  thirsty: "water",
  dirty: "bath",
  sleepy: "nest",
};

function hatched(baby: Baby, wants: readonly Want[] = WANTS): Nursery {
  return {
    phase: "babies",
    babies: [{ baby, wants, grown: 0, steps: WANTS.length }],
    chosen: 0,
  };
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
      const [next, reaction] = tap(nursery, "egg", always(0), "hatchling", [
        tyrannosaurus,
      ]);
      nursery = next;
      reactions.push(reaction);
    }

    expect(reactions).toEqual(["wobble", "wobble", "hatch"]);
    const [raising] = nursery.phase === "babies" ? nursery.babies : [];
    expect(
      raising && [raising.baby.id, [...raising.wants].sort(), raising.grown],
    ).toEqual(["tyrannosaurus", [...WANTS].sort(), 0]);
  });

  it("ignores items while it is still an egg", () => {
    expect(tap(anEgg(), "meat", always(0))).toEqual([anEgg(), undefined]);
  });

  it("spits out a food it does not eat, even when hungry, and does not grow", () => {
    const nursery = hatched(triceratops, [
      "hungry",
      "thirsty",
      "dirty",
      "sleepy",
    ]);

    expect(tap(nursery, "meat", always(0))).toEqual([nursery, "spit"]);
  });

  it("plays with a bath or nest it does not need yet, and refuses water it does not want", () => {
    const nursery = hatched(tyrannosaurus, [
      "hungry",
      "thirsty",
      "dirty",
      "sleepy",
    ]);

    expect([
      tap(nursery, "bath", always(0))[1],
      tap(nursery, "nest", always(0))[1],
      tap(nursery, "water", always(0))[1],
    ]).toEqual(["splash", "bounce", "not-now"]);
    expect(tap(nursery, "bath", always(0))[0]).toBe(nursery);
  });

  it("grows a step for each want met, and dances when grown", () => {
    let nursery = hatched(tyrannosaurus, [
      "dirty",
      "hungry",
      "sleepy",
      "thirsty",
    ]);
    const reactions: (Reaction | undefined)[] = [];
    for (const item of ["bath", "meat", "nest", "water"] as const) {
      const [next, reaction] = tap(nursery, item, always(0));
      nursery = next;
      reactions.push(reaction);
    }

    expect(reactions).toEqual(["wash", "eat", "sleep", "dance"]);
    expect(nursery).toEqual({ phase: "grown", babies: [tyrannosaurus] });
  });

  it("giggles when the baby itself is tapped", () => {
    expect(tap(hatched(tyrannosaurus), "baby-0", always(0))[1]).toBe("giggle");
  });
});

describe("the Explorer's twins", () => {
  const twins = (wants: [readonly Want[], readonly Want[]]): Nursery => ({
    phase: "babies",
    babies: [
      { baby: triceratops, wants: wants[0], grown: 0, steps: wants[0].length },
      {
        baby: tyrannosaurus,
        wants: wants[1],
        grown: 0,
        steps: wants[1].length,
      },
    ],
    chosen: 0,
  });

  it("are always a plant-eater and a meat-eater, each wanting food and one thing more", () => {
    for (const draw of [0, 0.3, 0.6, 0.99]) {
      const babies = hatchAt("explorer", always(draw));
      expect(babies.map((each) => each.baby.eats.join()).sort()).toEqual([
        "meat",
        "plants",
      ]);
      expect(
        babies.every(
          (each) => each.wants.length === 2 && each.wants.includes("hungry"),
        ),
      ).toBe(true);
    }
    expect([PLANT_EATERS.length, MEAT_EATERS.length]).toEqual([23, 16]);
  });

  it("gives an item to the twin last tapped", () => {
    const [chosen, giggle] = tap(
      twins([
        ["hungry", "dirty"],
        ["hungry", "sleepy"],
      ]),
      "baby-1",
      always(0),
      "explorer",
    );

    expect([
      giggle,
      tap(chosen, "plants", always(0), "explorer")[1],
      tap(chosen, "meat", always(0), "explorer")[1],
    ]).toEqual(["giggle", "spit", "eat"]);
  });

  it("hands the turn to the other twin once one has all it wants, and dances when both do", () => {
    let nursery = twins([["hungry"], ["thirsty"]]);
    const reactions: (Reaction | undefined)[] = [];
    for (const item of ["plants", "water"] as const) {
      const [next, reaction] = tap(nursery, item, always(0), "explorer");
      nursery = next;
      reactions.push(reaction);
    }

    expect(reactions).toEqual(["eat", "dance"]);
    expect(nursery).toEqual({
      phase: "grown",
      babies: [triceratops, tyrannosaurus],
    });
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
    ...options,
  });
}

// Lets the reactions finish: whatever waits for them runs.
function settle() {
  const waiting = pending;
  pending = [];
  waiting.forEach((run) => run());
}

// Taps `target`, a second after the last tap unless `soon`.
function press(target: Target, soon = false) {
  if (!soon) settle();
  clock += soon ? 100 : 1000;
  const button = root.querySelector(`[data-target="${target}"]`);
  if (button === null) throw new Error(`No ${target} to tap`);
  button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

const creatures = () => [
  ...root.querySelectorAll<HTMLElement>(".hatch-creature"),
];
const creature = () => creatures()[0]?.dataset ?? {};
const size = () => creatures()[0]?.style.getPropertyValue("--size");
const reaction = () => creature().reaction;
const phase = () =>
  root.querySelector<HTMLElement>(".hatch-frame")?.dataset.phase;
const name = () => root.querySelector(".hatch-name")?.textContent;
const friends = () =>
  [...root.querySelectorAll<HTMLImageElement>(".hatch-friend")].map(
    (friend) => friend.alt,
  );

function hatch() {
  for (let taps = 0; taps < 3; taps += 1) press("egg");
}

describe("the hatch and grow page", () => {
  it("starts with an egg and the five items, and shows no score or timer", () => {
    start();

    expect(phase()).toBe("egg");
    expect(
      [...root.querySelectorAll<HTMLElement>(".hatch-item")].map(
        (item) => item.dataset.target,
      ),
    ).toEqual([...ITEMS]);
    expect(root.textContent).not.toMatch(/\d/);
  });

  it("greys out the items until the egg hatches, and again while the grown dinosaur dances", () => {
    start();

    expect(phase()).toBe("egg");
    press("meat");
    expect(heard).toEqual([]);

    hatch();
    expect(phase()).toBe("babies");
    for (let step = 0; step < 4; step += 1) {
      settle();
      press(ITEM_FOR[creature().want as Want]);
    }
    expect(phase()).toBe("grown");
  });

  it("hatches a baby that shows what it wants, and plays a sound for every tap", () => {
    start();

    hatch();

    expect(creature().want).toBe("");
    settle();
    expect([phase(), size(), name()]).toEqual([
      "babies",
      "0.5",
      "TYRANNOSAURUS",
    ]);
    expect(WANTS).toContain(creature().want);
    expect(heard).toEqual(["wobble", "wobble", "hatch"]);
  });

  it("ignores a tap while the last reaction plays", () => {
    start();
    hatch();

    press("baby-0");
    press("baby-0", true);

    expect(heard.filter((sound) => sound === "giggle")).toHaveLength(1);
  });

  it("spits out plants and says so", () => {
    start();
    hatch();

    press("plants");

    expect([reaction(), size()]).toEqual(["spit", "0.5"]);
    expect(root.querySelector(".hatch-say")?.textContent).toBe("BLEH!");
  });

  it("grows with each want met, dances, joins the friends and leaves a new egg", () => {
    start();
    hatch();
    const grown: (string | undefined)[] = [];
    for (let step = 0; step < 4; step += 1) {
      settle();
      press(ITEM_FOR[creature().want as Want]);
      grown.push(size());
    }

    expect(grown).toEqual(["0.625", "0.75", "0.875", "1"]);
    expect(reaction()).toBe("dance");
    expect(friends()).toEqual([]);

    settle();

    expect(friends()).toEqual(["TYRANNOSAURUS"]);
    expect(phase()).toBe("egg");
  });

  it("burps now and then after a meal", () => {
    // Tyrannosaurus hatches wanting food first, then a meal burps.
    const draws = [0, 0.99, 0.99, 0.99];
    start({ random: () => draws.shift() ?? 0.01 });
    hatch();
    settle();
    expect(creature().want).toBe("hungry");

    press("meat");

    expect(root.querySelector(".hatch-say")?.textContent).toBe("BURP!");
    expect(heard.at(-1)).toBe("burp");
  });

  it("switches to the Explorer's twins, who both join the friends when grown", () => {
    start();
    root.querySelector<HTMLElement>('[data-level="explorer"]')?.click();
    expect(creatures()).toHaveLength(2);

    hatch();
    settle();
    expect(creatures().map((each) => each.dataset.chosen)).toEqual([
      "true",
      "false",
    ]);
    const foodOf = (index: number): Item => {
      const label = root
        .querySelector(`[data-target="baby-${index}"]`)
        ?.getAttribute("aria-label");
      return MEAT_EATERS.some((baby) => baby.name.en === label)
        ? "meat"
        : "plants";
    };
    for (const index of [0, 1]) {
      press(`baby-${index}`);
      for (let step = 0; step < 2; step += 1) {
        settle();
        const want = creatures()[index]?.dataset.want as Want;
        press(want === "hungry" ? foodOf(index) : ITEM_FOR[want]);
      }
    }
    expect(reaction()).toBe("dance");
    settle();

    expect(friends()).toHaveLength(2);
    expect(phase()).toBe("egg");
  });

  it("speaks Russian when the app does", () => {
    start({ language: "ru" });
    hatch();

    expect(name()).toBe("ТИРАННОЗАВР");
    expect(root.querySelector('[data-target="nest"]')?.textContent).toBe(
      "ГНЕЗДО",
    );
  });
});
