import { act } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import type { Item, Need, Visitor } from "../src/care/index.ts";
import { SHIPPED_VISITORS, type ManualTimers } from "./support.ts";

// What reads a visit as a child sees it, whatever the language: the
// visitor by its name, the need by its bubble's place in the bar, and the
// items by what they picture.

// Timers a test fires itself.
type Timers = Pick<ManualTimers, "timers" | "fire">;

const MEETS: Record<Exclude<Need, "hungry">, Item> = { thirsty: "water", dirty: "bath", tired: "nest" };

// The visitor on the stage.
export function visitorShown(): Visitor {
  const name = document.querySelector(".visitor-name")?.getAttribute("aria-label");
  const visitor = SHIPPED_VISITORS.find((each) => each.name.en === name || each.name.ru === name);
  if (!visitor) throw new Error(`No visitor named ${name ?? "nothing"} on the stage`);
  return visitor;
}

// The need asked now, undefined while none is.
export const needAsked = () => (document.querySelector(".need[data-state='current']")?.getAttribute("data-need") ?? undefined) as Need | undefined;

export function trayItem(item: Item): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(`.tray-item[data-item="${item}"]`);
  if (!button) throw new Error(`No ${item} on the tray`);
  return button;
}

// An item that meets `need` for `visitor`: plants for a dinosaur that ate
// both.
export function meets(visitor: Visitor, need: Need): Item {
  if (need !== "hungry") return MEETS[need];
  return visitor.diet === "meat" ? "meat" : "plants";
}

// An item that does not meet `need` for `visitor`.
export function missesFor(visitor: Visitor, need: Need): Item {
  return need === "hungry" ? "water" : visitor.diet === "meat" ? "meat" : "plants";
}

// Lets the reaction now playing end, and nothing after it.
export function endReaction(timers: Timers) {
  const [first] = timers.timers();
  if (first === undefined) throw new Error("No reaction is playing");
  act(() => timers.fire(first));
}

// Meets the need asked now, refused once first when `refuse` is set, and
// lets each reaction end: after the last need, the visitor is left
// dancing away.
export async function meetNeed(user: UserEvent, timers: Timers, refuse = false) {
  const visitor = visitorShown();
  const need = needAsked();
  if (need === undefined) throw new Error("No need is asked");
  if (refuse) {
    await user.click(trayItem(missesFor(visitor, need)));
    endReaction(timers);
  }
  await user.click(trayItem(meets(visitor, need)));
  endReaction(timers);
}

// Plays a whole visit to its result, refusing once at each need in
// `refusals`.
export async function playVisit(user: UserEvent, timers: Timers, refusals: readonly Need[] = []) {
  for (let need = needAsked(); need !== undefined; need = needAsked()) await meetNeed(user, timers, refusals.includes(need));
  endReaction(timers);
}
