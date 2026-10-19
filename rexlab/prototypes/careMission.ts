// The care mission prototype of LAB-281: one dinosaur at a time comes to
// an empty bowl, and the child chooses what to offer it. A dinosaur
// leans to a food it eats and turns away from one it does not; water is
// drunk at once. A food it leans to can be served, and the next dinosaur
// comes. Apart from the game, for a playtest only: nothing is scored,
// timed or kept.
import "@fontsource-variable/lexend";
import "./careMission.css";
import bowl from "../src/assets/care/bowl.webp";
import meat from "../src/assets/care/meat.webp";
import plants from "../src/assets/care/plants.webp";
import water from "../src/assets/care/water.webp";
import gallimimus from "../src/assets/dinos/gallimimus/body.webp";
import triceratops from "../src/assets/dinos/triceratops/body.webp";
import tyrannosaurus from "../src/assets/dinos/tyrannosaurus/body.webp";

export type Item = "plants" | "meat" | "water";
type Food = Exclude<Item, "water">;
export type Choice = Item | "serve" | "again";

// How the dinosaur stands: as it came, leaning to the food held out,
// turned away from it, drinking, or full after its meal.
export type Pose = "waiting" | "leaning" | "turned" | "drinking" | "full";

type Visitor = { name: string; eats: readonly Food[]; picture: string };

// Meat, plants and both, in the order they come.
export const VISITORS: readonly Visitor[] = [
  { name: "TYRANNOSAURUS", eats: ["meat"], picture: tyrannosaurus },
  { name: "TRICERATOPS", eats: ["plants"], picture: triceratops },
  { name: "GALLIMIMUS", eats: ["meat", "plants"], picture: gallimimus }
];

export type Mission = { visitor: number; pose: Pose; offered?: Item | undefined; drank: boolean };

export const arrival = (visitor: number): Mission => ({ visitor: visitor % VISITORS.length, pose: "waiting", drank: false });

const visitorOf = (mission: Mission) => VISITORS[mission.visitor] ?? (VISITORS[0] as Visitor);

// What the child can choose now: every item not yet given, and SERVE
// beside the other food while the dinosaur leans to one.
export function choicesOf(mission: Mission): Choice[] {
  if (mission.pose === "full") return ["again"];
  const items: Item[] = mission.drank ? ["plants", "meat"] : ["plants", "meat", "water"];
  if (mission.pose === "leaning") return ["serve", ...items.filter((item) => item !== mission.offered && item !== "water")];
  return items;
}

export function choose(mission: Mission, choice: Choice): Mission {
  if (!choicesOf(mission).includes(choice)) return mission;
  if (choice === "again") return arrival(mission.visitor + 1);
  if (choice === "serve") return { ...mission, pose: "full", offered: undefined };
  if (choice === "water") return { ...mission, pose: "drinking", offered: "water", drank: true };
  return { ...mission, pose: visitorOf(mission).eats.includes(choice) ? "leaning" : "turned", offered: choice };
}

const PICTURES: Record<Item, string> = { plants, meat, water };
const LABELS: Record<Choice, string> = { plants: "PLANTS", meat: "MEAT", water: "WATER", serve: "SERVE", again: "PLAY AGAIN" };

// A tap this soon after the last change is the second of a double tap,
// and lands on a choice the child has not seen yet.
const SETTLE_MS = 400;

const HOME_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11 12 3l9 8M5 9.5V21h5v-6h4v6h5V9.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const AGAIN_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h11a5 5 0 0 1 0 10H9M4 10l4-4M4 10l4 4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, attributes: Record<string, string> = {}): HTMLElementTagNameMap[K] {
  const made = document.createElement(tag);
  made.className = className;
  for (const [name, value] of Object.entries(attributes)) made.setAttribute(name, value);
  return made;
}

function picture(className: string, src: string): HTMLImageElement {
  return element("img", className, { src, alt: "", draggable: "false" });
}

function choiceButton(choice: Choice, mission: Mission): HTMLButtonElement {
  const button = element("button", `mission-choice mission-choice-${choice}`, { type: "button", "data-choice": choice });
  const art = element("span", "mission-choice-art");
  if (choice === "serve") {
    art.append(picture("mission-serve-bowl", bowl), picture("mission-serve-food", PICTURES[mission.offered ?? "meat"]));
  } else if (choice === "again") {
    const icon = element("span", "mission-choice-icon");
    icon.innerHTML = AGAIN_ICON;
    art.append(icon, picture("mission-again-visitor", visitorOf(arrival(mission.visitor + 1)).picture));
  } else {
    art.append(picture("mission-choice-picture", PICTURES[choice]));
  }
  const label = element("span", "mission-choice-label");
  label.textContent = LABELS[choice];
  button.append(art, label);
  return button;
}

// Draws the mission into `root` and plays it there, the frames scaled to
// fit the window. The stage stays while one dinosaur visits, so each
// change of its pose moves it there; a new dinosaur walks in.
export function startCareMission(root: HTMLElement, first: Mission = arrival(0)): void {
  let mission = first;
  let changedAt = Number.NEGATIVE_INFINITY;
  const frame = element("div", "mission-frame");
  const home = element("a", "mission-home", { href: "/" });
  home.innerHTML = `${HOME_ICON}<span>HOME</span>`;
  const stage = element("div", "mission-stage");
  const name = element("h1", "mission-name");
  const tray = element("div", "mission-tray");
  let dinosaur = picture("mission-visitor", "");
  let offered: HTMLImageElement | undefined;
  stage.append(element("div", "mission-glow"), element("div", "mission-ground"), picture("mission-bowl", bowl), dinosaur, name);
  frame.append(home, stage, tray);
  root.replaceChildren(frame);

  const fit = () => root.style.setProperty("--mission-scale", String(Math.min(window.innerWidth / 1440, window.innerHeight / 900)));
  fit();
  window.addEventListener("resize", fit);

  const draw = (arrived: boolean) => {
    const visitor = visitorOf(mission);
    if (arrived) {
      const walking = picture("mission-visitor", visitor.picture);
      dinosaur.replaceWith(walking);
      dinosaur = walking;
    }
    dinosaur.setAttribute("alt", visitor.name);
    dinosaur.dataset.pose = mission.pose;
    name.textContent = visitor.name;

    if (offered?.dataset.offered !== mission.offered) {
      offered?.remove();
      offered = undefined;
      if (mission.offered !== undefined) {
        offered = picture(`mission-offered mission-offered-${mission.offered}`, PICTURES[mission.offered]);
        offered.dataset.offered = mission.offered;
        dinosaur.before(offered);
      }
    }
    stage.dataset.pose = mission.pose;
    tray.replaceChildren(...choicesOf(mission).map((choice) => choiceButton(choice, mission)));
  };

  frame.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLElement>("[data-choice]");
    if (button === null || event.timeStamp - changedAt < SETTLE_MS) return;
    const next = choose(mission, button.dataset.choice as Choice);
    if (next === mission) return;
    const arrived = next.visitor !== mission.visitor;
    mission = next;
    changedAt = event.timeStamp;
    draw(arrived);
  });
  frame.addEventListener("contextmenu", (event) => event.preventDefault());
  draw(true);
}
