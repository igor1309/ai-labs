import { fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { after, reactionOf, startCareMission, startOf, VISITORS, type Item, type Motion, type Sound } from "../prototypes/careMission.ts";

// The care mission prototype of LAB-349, played by its taps: who is at
// the bowl, who is fed, what is left to tap, and what is heard.

let root: HTMLElement;
let heard: Sound[];

// Every animation over at once.
const instant: Motion = { wait: async () => {}, play: async () => {} };

beforeEach(() => {
  root = document.createElement("main");
  document.body.replaceChildren(root);
  heard = [];
});

const start = (motion = instant) => startCareMission(root, { motion, sound: (sound) => heard.push(sound) });

const choices = () => [...root.querySelectorAll<HTMLElement>("[data-choice]")].map((button) => button.dataset.choice);
const visitor = () => root.querySelector(".mission-name")?.textContent;
const line = () => [...root.querySelectorAll<HTMLElement>(".mission-place")].map((place) => `${place.dataset.state}${place.querySelector(".mission-place-heart") ? " ♥" : ""}`);
const fed = () => line().filter((place) => place.startsWith("fed")).length;
const egg = () => root.querySelector<HTMLElement>(".mission-egg")?.dataset.egg;

// Taps `choice`, a second after the last tap.
let clock = 0;
function tap(choice: Item | "again") {
  clock += 1000;
  const button = root.querySelector(`[data-choice="${choice}"]`);
  if (button === null) throw new Error(`No ${choice} to tap among ${choices().join(", ")}`);
  button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

// jsdom stamps each event with the time since the page opened; the taps
// here come a second apart.
const realTimeStamp = Object.getOwnPropertyDescriptor(Event.prototype, "timeStamp");
beforeEach(() => {
  clock = 0;
  Object.defineProperty(Event.prototype, "timeStamp", { configurable: true, get: () => clock });
  return () => {
    if (realTimeStamp) Object.defineProperty(Event.prototype, "timeStamp", realTimeStamp);
  };
});

// What each dinosaur in the line eats.
const eaten = VISITORS.map((_, fed) => (["plants", "meat"] as const).filter((food) => reactionOf({ ...startOf(), fed }, food) === "eats"));

async function feedAll(mission: ReturnType<typeof start>) {
  for (const foods of eaten) {
    tap(foods[0] ?? "meat");
    await mission.idle();
  }
}

describe("the care mission", () => {
  it("brings the first of five hungry dinosaurs to the bowl, with plants, meat and water to tap, and nothing scored or timed", async () => {
    await start().idle();

    expect(visitor()).toBe("TYRANNOSAURUS");
    expect(line()).toEqual(["now", "waiting", "waiting", "waiting", "waiting"]);
    expect(choices()).toEqual(["plants", "meat", "water"]);
    expect(root.textContent).not.toMatch(/\d/);
  });

  it("feeds a dinosaur with one tap on a food it eats: a chomp, a cheer, a heart in the line, and the next one comes", async () => {
    const mission = start();
    await mission.idle();

    tap("meat");
    await mission.idle();

    expect(heard).toEqual(["toss", "chomp", "yay"]);
    expect(line()).toEqual(["fed ♥", "now", "waiting", "waiting", "waiting"]);
    expect([visitor(), choices()]).toEqual(["TRICERATOPS", ["plants", "meat", "water"]]);
    expect(root.querySelector("[data-food]")).toBeNull();
  });

  it("has a dinosaur refuse a food it does not eat, the food knocked out and every choice left to try again", async () => {
    const mission = start();
    await mission.idle();

    tap("plants");
    await mission.idle();

    expect(heard).toEqual(["toss", "bleh"]);
    expect([visitor(), fed(), choices()]).toEqual(["TYRANNOSAURUS", 0, ["plants", "meat", "water"]]);
    expect(root.querySelector("[data-food]")).toBeNull();
  });

  it("lets a dinosaur slurp the water, still hungry, and gives the next one water again", async () => {
    const mission = start();
    await mission.idle();

    tap("water");
    await mission.idle();

    expect(heard).toEqual(["toss", "slurp"]);
    expect([visitor(), fed(), choices()]).toEqual(["TYRANNOSAURUS", 0, ["plants", "meat"]]);
    tap("meat");
    await mission.idle();
    expect([visitor(), choices()]).toEqual(["TRICERATOPS", ["plants", "meat", "water"]]);
  });

  it("hatches the egg in the nest once all five are fed, then plays again from the first", async () => {
    const mission = start();
    await mission.idle();

    await feedAll(mission);

    expect(line()).toEqual(["fed ♥", "fed ♥", "fed ♥", "fed ♥", "fed ♥"]);
    expect([egg(), heard.slice(-2), choices()]).toEqual(["hatched", ["crack", "fanfare"], ["again"]]);
    tap("again");
    await mission.idle();
    expect([visitor(), line(), egg(), choices()]).toEqual(["TYRANNOSAURUS", ["now", "waiting", "waiting", "waiting", "waiting"], undefined, ["plants", "meat", "water"]]);
  });

  it("lets no tap in while a dinosaur walks in or reacts", async () => {
    let holding = true;
    const ends: (() => void)[] = [];
    const mission = start({ ...instant, play: () => (holding ? new Promise((done) => ends.push(done)) : Promise.resolve()) });
    const playOut = async () => {
      holding = false;
      ends.splice(0).forEach((end) => end());
      await mission.idle();
      holding = true;
    };

    tap("plants");
    expect(heard).toEqual([]);
    await playOut();
    tap("meat");
    tap("plants");
    expect(heard).toEqual(["toss"]);
    await playOut();

    expect([heard, visitor()]).toEqual([["toss", "chomp", "yay"], "TRICERATOPS"]);
  });

  it("swallows the second tap of a double tap once the first has played out", async () => {
    const mission = start();
    await mission.idle();
    tap("water");
    await mission.idle();

    fireEvent.click(root.querySelector('[data-choice="meat"]') ?? root);
    await mission.idle();

    expect([heard, fed()]).toEqual([["toss", "slurp"], 0]);
  });

  it("takes each dinosaur's diet from the data, meat and plants by turns and one that eats both", () => {
    expect(VISITORS.map(({ name }) => name)).toEqual(["TYRANNOSAURUS", "TRICERATOPS", "VELOCIRAPTOR", "STEGOSAURUS", "GALLIMIMUS"]);
    expect(eaten).toEqual([["meat"], ["plants"], ["meat"], ["plants"], ["plants", "meat"]]);
    expect(after(after(startOf(), "drinks"), "eats")).toEqual({ round: 0, fed: 1, drank: false });
    expect(after(startOf(), "refuses")).toEqual(startOf());
  });
});
