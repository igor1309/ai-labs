import { fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { arrival, choicesOf, choose, startCareMission, VISITORS, type Choice } from "../prototypes/careMission.ts";

// The care mission prototype of LAB-281, played by its taps: the
// dinosaur's pose and the choices it leaves.

let root: HTMLElement;

beforeEach(() => {
  root = document.createElement("main");
  document.body.replaceChildren(root);
});

const choices = () => [...root.querySelectorAll<HTMLElement>("[data-choice]")].map((button) => button.dataset.choice);
const pose = () => root.querySelector<HTMLElement>(".mission-visitor")?.dataset.pose;
const visitor = () => root.querySelector(".mission-name")?.textContent;
const offered = () => root.querySelector<HTMLElement>("[data-offered]")?.dataset.offered;

// Taps `choice`, a second after the last tap.
let clock = 0;
function tap(choice: Choice) {
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

describe("the care mission", () => {
  it("brings a dinosaur to an empty bowl with plants, meat and water to offer, and nothing scored or timed", () => {
    startCareMission(root);

    expect([visitor(), pose(), offered()]).toEqual(["TYRANNOSAURUS", "waiting", undefined]);
    expect(choices()).toEqual(["plants", "meat", "water"]);
    expect(root.textContent).not.toMatch(/\d/);
  });

  it("turns the dinosaur away from a food it does not eat, every choice still there to try again", () => {
    startCareMission(root);

    tap("plants");

    expect([pose(), offered()]).toEqual(["turned", "plants"]);
    expect(choices()).toEqual(["plants", "meat", "water"]);
    expect(root.querySelector(".mission-choice-serve")).toBeNull();
  });

  it("leans the dinosaur to a food it eats, which can be served or swapped for the other", () => {
    startCareMission(root);

    tap("meat");

    expect([pose(), offered()]).toEqual(["leaning", "meat"]);
    expect(choices()).toEqual(["serve", "plants"]);
    tap("plants");
    expect([pose(), offered()]).toEqual(["turned", "plants"]);
  });

  it("lets the dinosaur drink the water at once, the food still to choose", () => {
    startCareMission(root, arrival(2));

    tap("water");

    expect([visitor(), pose(), offered()]).toEqual(["GALLIMIMUS", "drinking", "water"]);
    expect(choices()).toEqual(["plants", "meat"]);
    tap("plants");
    expect([pose(), choices()]).toEqual(["leaning", ["serve", "meat"]]);
  });

  it("leaves the bowl empty once a meal is served, then brings the next dinosaur", () => {
    startCareMission(root, arrival(1));

    tap("plants");
    tap("serve");

    expect([visitor(), pose(), offered(), choices()]).toEqual(["TRICERATOPS", "full", undefined, ["again"]]);
    tap("again");
    expect([visitor(), pose(), choices()]).toEqual(["GALLIMIMUS", "waiting", ["plants", "meat", "water"]]);
  });

  it("swallows the second tap of a double tap, so it never presses the choice that appears under it", () => {
    startCareMission(root);
    tap("meat");

    fireEvent.click(root.querySelector('[data-choice="serve"]') ?? root);

    expect(pose()).toBe("leaning");
  });

  it("feeds each dinosaur what it eats, meat, plants and both, and comes round to the first again", () => {
    const eaten = VISITORS.map((_, at) => (["plants", "meat"] as const).filter((food) => choose(arrival(at), food).pose === "leaning"));
    expect(eaten).toEqual([["meat"], ["plants"], ["plants", "meat"]]);
    expect(choose(choose(choose(arrival(2), "meat"), "serve"), "again")).toEqual(arrival(0));
    expect(choicesOf(choose(arrival(0), "serve"))).toEqual(["plants", "meat", "water"]);
  });
});
