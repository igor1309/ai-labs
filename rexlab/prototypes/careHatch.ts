// The hatch and grow care prototype of LAB-387: a mystery egg cracks
// after a few taps and a baby land dinosaur hatches small. It wants food,
// water, a bath and sleep in a random order, shown on it, not in words.
// Every item and the baby itself get a reaction; meeting a want makes it
// grow a step, and after four it dances, joins the friends and a new egg
// comes. Apart from the game, for a playtest only: nothing is scored,
// timed or kept.
import "@fontsource-variable/lexend";
import "./careHatch.css";
import bowl from "../src/assets/care/bowl.webp";
import bath from "../src/assets/care/bath.webp";
import meat from "../src/assets/care/meat.webp";
import nest from "../src/assets/care/nest.webp";
import plants from "../src/assets/care/plants.webp";
import water from "../src/assets/care/water.webp";
import records from "../src/data/dinosaurs.json";
import { careSounds, type Sounds } from "./careSounds.ts";

export type Item = "plants" | "meat" | "water" | "bath" | "nest";
type Food = "plants" | "meat";
export type Want = "hungry" | "thirsty" | "dirty" | "sleepy";
export type Language = "en" | "ru";

export type Baby = { id: string; name: Record<Language, string>; eats: readonly Food[]; picture: string };

// What the child just made happen, which the stage plays.
export type Reaction =
  | "wobble"
  | "hatch"
  | "eat"
  | "spit"
  | "drink"
  | "wash"
  | "sleep"
  | "splash"
  | "bounce"
  | "not-now"
  | "giggle"
  | "dance";

export type Nursery =
  | { phase: "egg"; taps: number }
  | { phase: "baby"; baby: Baby; wants: readonly Want[]; grown: number }
  | { phase: "grown"; baby: Baby };

export const WANTS: readonly Want[] = ["hungry", "thirsty", "dirty", "sleepy"];
export const ITEMS: readonly Item[] = ["plants", "meat", "water", "bath", "nest"];
const TAPS_TO_HATCH = 3;

// Land dinosaurs only: water and a bath mean nothing to a flying or sea
// reptile.
const BODIES = import.meta.glob<string>("../src/assets/dinos/*/body.webp", { eager: true, import: "default" });
export const BABIES: readonly Baby[] = records
  .filter((record) => record.group === "dinosaur")
  .map((record) => ({
    id: record.id,
    name: { en: record.name.en.toUpperCase(), ru: record.name.ru.toUpperCase() },
    eats: record.diet === "both" ? ["plants", "meat"] : [record.diet as Food],
    picture: BODIES[`../src/assets/dinos/${record.id}/body.webp`] ?? ""
  }));

export const anEgg = (): Nursery => ({ phase: "egg", taps: 0 });

// `random` gives a number in [0, 1), as Math.random does; tests pass
// their own.
export type Random = () => number;

function shuffled<T>(items: readonly T[], random: Random): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other] as T, result[index] as T];
  }
  return result;
}

// The want an item meets, and what the baby does with it otherwise.
const MEETS: Record<Item, Want> = { plants: "hungry", meat: "hungry", water: "thirsty", bath: "dirty", nest: "sleepy" };
const MET: Record<Item, Reaction> = { plants: "eat", meat: "eat", water: "drink", bath: "wash", nest: "sleep" };
const PLAYED: Partial<Record<Item, Reaction>> = { bath: "splash", nest: "bounce" };

// Taps the egg, the baby or an item, and says what happens.
export function tap(nursery: Nursery, target: Item | "egg" | "baby", random: Random, hatchling?: Baby): [Nursery, Reaction | undefined] {
  if (nursery.phase === "egg") {
    if (target !== "egg") return [nursery, undefined];
    if (nursery.taps + 1 < TAPS_TO_HATCH) return [{ phase: "egg", taps: nursery.taps + 1 }, "wobble"];
    const baby = hatchling ?? (BABIES[Math.floor(random() * BABIES.length)] as Baby);
    return [{ phase: "baby", baby, wants: shuffled(WANTS, random), grown: 0 }, "hatch"];
  }
  if (nursery.phase === "grown" || target === "egg") return [nursery, undefined];
  if (target === "baby") return [nursery, "giggle"];

  const { baby, wants } = nursery;
  if ((target === "plants" || target === "meat") && !baby.eats.includes(target)) return [nursery, "spit"];
  if (wants[0] !== MEETS[target]) return [nursery, PLAYED[target] ?? "not-now"];
  const grown = nursery.grown + 1;
  if (grown === WANTS.length) return [{ phase: "grown", baby }, "dance"];
  return [{ phase: "baby", baby, wants: wants.slice(1), grown }, MET[target]];
}

const PICTURES: Record<Item, string> = { plants, meat, water, bath, nest };
const LABELS: Record<Language, Record<Item | "home", string>> = {
  en: { plants: "PLANTS", meat: "MEAT", water: "WATER", bath: "BATH", nest: "NEST", home: "HOME" },
  ru: { plants: "РАСТЕНИЯ", meat: "МЯСО", water: "ВОДА", bath: "ВАННА", nest: "ГНЕЗДО", home: "ДОМОЙ" }
};
const SAYS: Record<Language, Partial<Record<Reaction, string>>> = {
  en: { spit: "BLEH!", "not-now": "MM-MM", eat: "YUM!" },
  ru: { spit: "ФУ!", "not-now": "НЕ-А", eat: "НЯМ!" }
};
const BURP: Record<Language, string> = { en: "BURP!", ru: "ИК!" };
const SNEEZE: Record<Language, string> = { en: "ACHOO!", ru: "АПЧХИ!" };

// How long a reaction plays before the next tap counts, and how long the
// dance lasts before the new egg comes.
export const REACTION_MS = 900;
export const DANCE_MS = 2400;

const HOME_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11 12 3l9 8M5 9.5V21h5v-6h4v6h5V9.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const DROP_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c4 5 6 8.5 6 11.5a6 6 0 0 1-12 0C6 11.5 8 8 12 3z" fill="#4aa3df"/></svg>';

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, attributes: Record<string, string> = {}): HTMLElementTagNameMap[K] {
  const made = document.createElement(tag);
  made.className = className;
  for (const [name, value] of Object.entries(attributes)) made.setAttribute(name, value);
  return made;
}

function picture(className: string, src: string): HTMLImageElement {
  return element("img", className, { src, alt: "", draggable: "false" });
}

function storedLanguage(): Language {
  try {
    return window.localStorage.getItem("rexlab-language") === "ru" ? "ru" : "en";
  } catch {
    return "en";
  }
}

export type Options = { random?: Random; sounds?: Sounds; language?: Language; now?: () => number; later?: (run: () => void, ms: number) => void };

// Draws the nursery into `root` and plays it there, the frame scaled to
// fit the window. Taps during a reaction are ignored, so a quick double
// tap gives an item once.
export function startCareHatch(root: HTMLElement, options: Options = {}): void {
  const random = options.random ?? Math.random;
  const sounds = options.sounds ?? careSounds();
  const language = options.language ?? storedLanguage();
  const now = options.now ?? (() => performance.now());
  const later = options.later ?? ((run, ms) => window.setTimeout(run, ms));
  let nursery = anEgg();
  let busyUntil = Number.NEGATIVE_INFINITY;
  const friends: Baby[] = [];

  const frame = element("div", "hatch-frame");
  frame.lang = language;
  const home = element("a", "hatch-home", { href: "/" });
  home.innerHTML = `${HOME_ICON}<span>${LABELS[language].home}</span>`;
  const row = element("div", "hatch-friends");
  const stage = element("div", "hatch-stage");
  const name = element("h1", "hatch-name");
  const say = element("div", "hatch-say");
  const offered = picture("hatch-offered", "");
  const tray = element("div", "hatch-tray");
  for (const item of ITEMS) {
    const button = element("button", "hatch-item", { type: "button", "data-target": item });
    button.append(picture("hatch-item-picture", PICTURES[item]));
    const label = element("span", "hatch-item-label");
    label.textContent = LABELS[language][item];
    button.append(label);
    tray.append(button);
  }
  stage.append(element("div", "hatch-glow"), element("div", "hatch-ground"), name, offered, say);
  frame.append(home, row, stage, tray);
  root.replaceChildren(frame);

  const fit = () => root.style.setProperty("--hatch-scale", String(Math.min(window.innerWidth / 1440, window.innerHeight / 900)));
  fit();
  window.addEventListener("resize", fit);

  let creature: HTMLElement = element("div", "hatch-creature");
  stage.append(creature);

  // The egg, or the baby with what it wants shown on it: an empty bowl,
  // a drop of water, mud, or sleepy Zzz.
  const drawCreature = (arrived: boolean) => {
    if (arrived) {
      const next = element("div", "hatch-creature");
      creature.replaceWith(next);
      creature = next;
      if (nursery.phase === "egg") {
        const egg = element("button", "hatch-egg", { type: "button", "data-target": "egg", "aria-label": "egg" });
        egg.append(element("span", "hatch-egg-spots"));
        creature.append(egg);
      } else {
        const baby = element("button", "hatch-baby", { type: "button", "data-target": "baby" });
        baby.append(picture("hatch-baby-picture", nursery.baby.picture));
        for (let spot = 0; spot < 4; spot += 1) baby.append(element("span", `hatch-mud hatch-mud-${spot}`));
        baby.append(element("span", "hatch-zzz"));
        creature.append(baby);
        const bubble = element("div", "hatch-bubble");
        bubble.append(picture("hatch-bubble-bowl", bowl));
        const drop = element("span", "hatch-bubble-drop");
        drop.innerHTML = DROP_ICON;
        bubble.append(drop);
        creature.append(bubble);
      }
    }
    if (nursery.phase === "egg") {
      creature.dataset.phase = "egg";
      creature.dataset.taps = String(nursery.taps);
      name.textContent = "";
      return;
    }
    creature.dataset.phase = nursery.phase;
    creature.dataset.grown = nursery.phase === "grown" ? String(WANTS.length) : String(nursery.grown);
    creature.dataset.want = nursery.phase === "baby" ? (nursery.wants[0] ?? "") : "";
    creature.querySelector(".hatch-baby")?.setAttribute("aria-label", nursery.baby.name[language]);
    name.textContent = nursery.baby.name[language];
  };

  const drawFriends = () => {
    row.replaceChildren(
      ...friends.map((friend) => {
        const face = picture("hatch-friend", friend.picture);
        face.alt = friend.name[language];
        return face;
      })
    );
  };

  // Restarts the stage's reaction, so the same one twice plays twice.
  const play = (reaction: Reaction, item?: Item) => {
    delete stage.dataset.reaction;
    void stage.offsetWidth;
    stage.dataset.reaction = reaction;
    offered.src = item === undefined ? "" : PICTURES[item];
    offered.dataset.item = item ?? "";
    let words = SAYS[language][reaction] ?? "";
    if (reaction === "eat" && random() < 1 / 3) words = BURP[language];
    if ((reaction === "wash" || reaction === "splash") && random() < 1 / 3) words = SNEEZE[language];
    say.textContent = words;
    sounds.play(reaction, words === BURP[language] ? "burp" : words === SNEEZE[language] ? "sneeze" : undefined);
  };

  frame.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLElement>("[data-target]");
    if (button === null || now() < busyUntil) return;
    const target = button.dataset.target as Item | "egg" | "baby";
    const [next, reaction] = tap(nursery, target, random);
    if (reaction === undefined) return;
    const arrived = next.phase !== nursery.phase && next.phase !== "grown";
    nursery = next;
    busyUntil = now() + REACTION_MS;
    drawCreature(arrived);
    play(reaction, ITEMS.includes(target as Item) ? (target as Item) : undefined);
    if (reaction === "dance" && nursery.phase === "grown") {
      const friend = nursery.baby;
      busyUntil = now() + DANCE_MS;
      later(() => {
        friends.push(friend);
        drawFriends();
        nursery = anEgg();
        drawCreature(true);
        delete stage.dataset.reaction;
      }, DANCE_MS);
    }
  });
  frame.addEventListener("contextmenu", (event) => event.preventDefault());
  drawCreature(true);
}
