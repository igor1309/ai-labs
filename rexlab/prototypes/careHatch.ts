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

export type Baby = {
  id: string;
  name: Record<Language, string>;
  eats: readonly Food[];
  picture: string;
};

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
  | "look"
  | "dance";

export type Level = "hatchling" | "explorer" | "paleontologist";
export const LEVELS: readonly Level[] = [
  "hatchling",
  "explorer",
  "paleontologist",
];

// A baby being raised: what it still wants, and how far it has grown out
// of the steps it takes to fill its shadow.
export type Raising = {
  baby: Baby;
  wants: readonly Want[];
  grown: number;
  steps: number;
};

// A Hatchling raises one baby through all four wants. An Explorer raises
// twins, a plant-eater and a meat-eater, through hunger and one other
// want each; the item goes to the baby the child last tapped. A
// Paleontologist raises three, one eating both, and works out what each
// eats from its teeth.
export type Nursery =
  | { phase: "egg"; taps: number }
  | { phase: "babies"; babies: readonly Raising[]; chosen: number }
  | { phase: "grown"; babies: readonly Baby[] };

export type Target = Item | "egg" | `baby-${number}` | `look-${number}`;

export const WANTS: readonly Want[] = ["hungry", "thirsty", "dirty", "sleepy"];
export const ITEMS: readonly Item[] = [
  "plants",
  "meat",
  "water",
  "bath",
  "nest",
];
const TAPS_TO_HATCH = 3;

// Land dinosaurs only: water and a bath mean nothing to a flying or sea
// reptile.
const BODIES = import.meta.glob<string>("../src/assets/dinos/*/body.webp", {
  eager: true,
  import: "default",
});
export const BABIES: readonly Baby[] = records
  .filter((record) => record.group === "dinosaur")
  .map((record) => ({
    id: record.id,
    name: {
      en: record.name.en.toUpperCase(),
      ru: record.name.ru.toUpperCase(),
    },
    eats: record.diet === "both" ? ["plants", "meat"] : [record.diet as Food],
    picture: BODIES[`../src/assets/dinos/${record.id}/body.webp`] ?? "",
  }));
const eatsOnly = (food: Food) =>
  BABIES.filter((baby) => baby.eats.length === 1 && baby.eats[0] === food);
export const PLANT_EATERS = eatsOnly("plants");
export const MEAT_EATERS = eatsOnly("meat");
export const BOTH_EATERS = BABIES.filter((baby) => baby.eats.length === 2);

// What a paleontologist sees in a baby's mouth: pointed teeth for meat,
// flat ones for plants, both kinds for both.
export type Teeth = "sharp" | "flat" | "mixed";
export const teethOf = (baby: Baby): Teeth =>
  baby.eats.length === 2 ? "mixed" : baby.eats[0] === "meat" ? "sharp" : "flat";

export const anEgg = (): Nursery => ({ phase: "egg", taps: 0 });

// `random` gives a number in [0, 1), as Math.random does; tests pass
// their own.
export type Random = () => number;

const pick = <T>(items: readonly T[], random: Random): T =>
  items[Math.floor(random() * items.length)] as T;

function shuffled<T>(items: readonly T[], random: Random): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other] as T, result[index] as T];
  }
  return result;
}

// The babies that hatch at a level, unless a test names them.
export function hatch(
  level: Level,
  random: Random,
  named?: readonly Baby[],
): Raising[] {
  if (level === "hatchling") {
    const baby = named?.[0] ?? pick(BABIES, random);
    return [
      { baby, wants: shuffled(WANTS, random), grown: 0, steps: WANTS.length },
    ];
  }
  const eaters =
    level === "explorer"
      ? [PLANT_EATERS, MEAT_EATERS]
      : [PLANT_EATERS, MEAT_EATERS, BOTH_EATERS];
  const babies =
    named ??
    shuffled(
      eaters.map((each) => pick(each, random)),
      random,
    );
  return babies.map((baby) => {
    const wants = shuffled<Want>(
      ["hungry", pick(WANTS.slice(1), random)],
      random,
    );
    return { baby, wants, grown: 0, steps: wants.length };
  });
}

// The want an item meets, and what the baby does with it otherwise.
const MEETS: Record<Item, Want> = {
  plants: "hungry",
  meat: "hungry",
  water: "thirsty",
  bath: "dirty",
  nest: "sleepy",
};
const MET: Record<Item, Reaction> = {
  plants: "eat",
  meat: "eat",
  water: "drink",
  bath: "wash",
  nest: "sleep",
};
const PLAYED: Partial<Record<Item, Reaction>> = {
  bath: "splash",
  nest: "bounce",
};

export const babyAt = (target: Target): number | undefined =>
  target.startsWith("baby-") ? Number(target.slice(5)) : undefined;
export const lookAt = (target: Target): number | undefined =>
  target.startsWith("look-") ? Number(target.slice(5)) : undefined;

// Taps the egg, a baby or an item, and says what happens.
export function tap(
  nursery: Nursery,
  target: Target,
  random: Random,
  level: Level = "hatchling",
  named?: readonly Baby[],
): [Nursery, Reaction | undefined] {
  if (nursery.phase === "egg") {
    if (target !== "egg") return [nursery, undefined];
    if (nursery.taps + 1 < TAPS_TO_HATCH)
      return [{ phase: "egg", taps: nursery.taps + 1 }, "wobble"];
    return [
      { phase: "babies", babies: hatch(level, random, named), chosen: 0 },
      "hatch",
    ];
  }
  if (nursery.phase === "grown" || target === "egg")
    return [nursery, undefined];
  const tapped = babyAt(target) ?? lookAt(target);
  if (tapped !== undefined)
    return nursery.babies[tapped] === undefined
      ? [nursery, undefined]
      : [
          { ...nursery, chosen: tapped },
          babyAt(target) === undefined ? "look" : "giggle",
        ];

  const item = target as Item;
  const raising = nursery.babies[nursery.chosen] as Raising;
  if (
    (item === "plants" || item === "meat") &&
    !raising.baby.eats.includes(item)
  )
    return [nursery, "spit"];
  if (raising.wants[0] !== MEETS[item])
    return [nursery, PLAYED[item] ?? "not-now"];
  const babies = nursery.babies.map((each, index) =>
    index === nursery.chosen
      ? { ...each, wants: each.wants.slice(1), grown: each.grown + 1 }
      : each,
  );
  if (babies.every((each) => each.wants.length === 0))
    return [
      { phase: "grown", babies: babies.map((each) => each.baby) },
      "dance",
    ];
  // A baby that has all it wants hands the turn to one that still wants.
  const chosen =
    (babies[nursery.chosen] as Raising).wants.length > 0
      ? nursery.chosen
      : babies.findIndex((each) => each.wants.length > 0);
  return [{ phase: "babies", babies, chosen }, MET[item]];
}

const PICTURES: Record<Item, string> = { plants, meat, water, bath, nest };
const LABELS: Record<Language, Record<Item | "home", string>> = {
  en: {
    plants: "PLANTS",
    meat: "MEAT",
    water: "WATER",
    bath: "BATH",
    nest: "NEST",
    home: "HOME",
  },
  ru: {
    plants: "РАСТЕНИЯ",
    meat: "МЯСО",
    water: "ВОДА",
    bath: "ВАННА",
    nest: "ГНЕЗДО",
    home: "ДОМОЙ",
  },
};
const SAYS: Record<Language, Partial<Record<Reaction, string>>> = {
  en: { spit: "BLEH!", "not-now": "NOPE!", eat: "YUM!" },
  ru: { spit: "ФУ!", "not-now": "НЕ-А", eat: "НЯМ!" },
};
const BURP: Record<Language, string> = { en: "BURP!", ru: "ИК!" };
const SNEEZE: Record<Language, string> = { en: "ACHOO!", ru: "АПЧХИ!" };

// How long a reaction plays before the next tap counts, and how long the
// dance lasts before the new egg comes.
export const REACTION_MS = 900;
export const DANCE_MS = 2400;

const HOME_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11 12 3l9 8M5 9.5V21h5v-6h4v6h5V9.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const HAND_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11V4.5a1.5 1.5 0 0 1 3 0V10m0-.5a1.5 1.5 0 0 1 3 0V11m0-.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1a6 6 0 0 1-4.6-2.2L4 15.5a1.6 1.6 0 0 1 2.4-2.1L9 16" fill="#fffdf8" stroke="#1d2742" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
// The teeth seen through the magnifier, on a pink gum.
const tooth = (x: number) =>
  `<path d="M${x} 16 L${x + 10} 52 L${x + 20} 16 Z" fill="#fffdf8" stroke="#1d2742" stroke-width="2" stroke-linejoin="round"/>`;
const molar = (x: number) =>
  `<rect x="${x}" y="14" width="18" height="24" rx="5" fill="#fffdf8" stroke="#1d2742" stroke-width="2"/>`;
const gum = '<rect x="0" y="2" width="120" height="16" rx="8" fill="#d9707f"/>';
const TEETH: Record<Teeth, string> = {
  sharp: [5, 27, 49, 71, 93].map(tooth).join(""),
  flat: [6, 28, 50, 72, 94].map(molar).join(""),
  mixed: [tooth(5), tooth(27), molar(52), molar(74), molar(96)].join(""),
};
const teethPicture = (teeth: Teeth) =>
  `<svg viewBox="0 0 120 60" aria-hidden="true">${gum}${TEETH[teeth]}</svg>`;

const DROP_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c4 5 6 8.5 6 11.5a6 6 0 0 1-12 0C6 11.5 8 8 12 3z" fill="#4aa3df"/></svg>';

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  attributes: Record<string, string> = {},
): HTMLElementTagNameMap[K] {
  const made = document.createElement(tag);
  made.className = className;
  for (const [name, value] of Object.entries(attributes))
    made.setAttribute(name, value);
  return made;
}

function picture(className: string, src: string): HTMLImageElement {
  return element("img", className, { src, alt: "", draggable: "false" });
}

function storedLanguage(): Language {
  try {
    return window.localStorage.getItem("rexlab-language") === "ru"
      ? "ru"
      : "en";
  } catch {
    return "en";
  }
}

export type Options = {
  random?: Random;
  sounds?: Sounds;
  language?: Language;
  level?: Level;
  notebook?: Notebook;
  now?: () => number;
  later?: (run: () => void, ms: number) => void;
};

// The field notebook keeps the ids of the babies a Paleontologist has
// raised, across visits, oldest first.
export type Notebook = {
  read(): string[];
  write(ids: readonly string[]): void;
};
const NOTEBOOK_KEY = "rexlab-care-notebook";
const storedNotebook: Notebook = {
  read() {
    try {
      const ids: unknown = JSON.parse(
        window.localStorage.getItem(NOTEBOOK_KEY) ?? "[]",
      );
      return Array.isArray(ids)
        ? ids.filter((id): id is string => typeof id === "string")
        : [];
    } catch {
      return [];
    }
  },
  write(ids) {
    try {
      window.localStorage.setItem(NOTEBOOK_KEY, JSON.stringify(ids));
    } catch {
      // A private window keeps no notebook.
    }
  },
};

// Where each baby stands on the stage, by how many there are.
type Box = { left: number; top: number; width: number; height: number };
const BOXES: Record<Level, readonly Box[]> = {
  hatchling: [{ left: 184, top: 110, width: 600, height: 460 }],
  explorer: [
    { left: 24, top: 190, width: 450, height: 380 },
    { left: 494, top: 190, width: 450, height: 380 },
  ],
  paleontologist: [
    { left: 0, top: 170, width: 330, height: 400 },
    { left: 319, top: 170, width: 330, height: 400 },
    { left: 638, top: 170, width: 330, height: 400 },
  ],
};

// A baby grows from half its full size. The pictures face left and are
// turned to face the items, so the head sits about a fifth in from the
// right and a third down; it grows from the middle of its feet.
function sizeOf(raising: Raising | undefined, box: Box) {
  const size =
    raising === undefined ? 1 : 0.5 + (0.5 * raising.grown) / raising.steps;
  return {
    size,
    headX: box.width / 2 + 0.3 * box.width * size,
    headY: box.height - 0.7 * box.height * size,
  };
}

const LEVEL_ICONS: Record<Level, string> = {
  hatchling: "🥚",
  explorer: "🦖",
  paleontologist: "🦕",
};

// Draws the nursery into `root` and plays it there, the frame scaled to
// fit the window. Taps during a reaction are ignored, so a quick double
// tap gives an item once.
export function startCareHatch(root: HTMLElement, options: Options = {}): void {
  const random = options.random ?? Math.random;
  const sounds = options.sounds ?? careSounds();
  const language = options.language ?? storedLanguage();
  const now = options.now ?? (() => performance.now());
  const later = options.later ?? ((run, ms) => window.setTimeout(run, ms));
  let level = options.level ?? "hatchling";
  const notebook = options.notebook ?? storedNotebook;
  // The baby whose teeth the magnifier shows.
  let looking: number | undefined;
  let nursery = anEgg();
  let busyUntil = Number.NEGATIVE_INFINITY;
  // Babies whose next want waits until they finish with the last one.
  const resting = new Set<number>();
  const friends: Baby[] = [];

  const frame = element("div", "hatch-frame");
  frame.lang = language;
  const home = element("a", "hatch-home", { href: "/" });
  home.innerHTML = `${HOME_ICON}<span>${LABELS[language].home}</span>`;
  const switcher = element("div", "hatch-levels");
  for (const each of LEVELS) {
    const button = element("button", "hatch-level", {
      type: "button",
      "data-level": each,
      "aria-label": each,
    });
    button.textContent = LEVEL_ICONS[each];
    switcher.append(button);
  }
  const notebookButton = element("button", "hatch-notebook-button", {
    type: "button",
    "aria-label": "notebook",
  });
  notebookButton.textContent = "📓";
  const notebookPages = element("div", "hatch-notebook");
  const row = element("div", "hatch-friends");
  const stage = element("div", "hatch-stage");
  const name = element("h1", "hatch-name");
  const tray = element("div", "hatch-tray");
  for (const item of ITEMS) {
    const button = element("button", "hatch-item", {
      type: "button",
      "data-target": item,
    });
    button.append(picture("hatch-item-picture", PICTURES[item]));
    const label = element("span", "hatch-item-label");
    label.textContent = LABELS[language][item];
    button.append(label);
    tray.append(button);
  }
  stage.append(
    element("div", "hatch-glow"),
    element("div", "hatch-sun"),
    element("div", "hatch-ground"),
    name,
  );
  frame.append(home, row, notebookButton, switcher, stage, tray, notebookPages);
  root.replaceChildren(frame);

  const fit = () =>
    root.style.setProperty(
      "--hatch-scale",
      String(Math.min(window.innerWidth / 1440, window.innerHeight / 900)),
    );
  fit();
  window.addEventListener("resize", fit);

  let creatures: HTMLElement[] = [];

  // Puts out the eggs, or the babies with their shadows and the signs of
  // what they want: an empty bowl, sweat, mud or Zzz. Hungry is never
  // shown as the food to give.
  const arrive = () => {
    for (const creature of creatures) creature.remove();
    const boxes = BOXES[level];
    creatures = boxes.map((box, index) => {
      const creature = element("div", "hatch-creature");
      Object.assign(creature.style, {
        left: `${box.left}px`,
        top: `${box.top}px`,
        width: `${box.width}px`,
        height: `${box.height}px`,
      });
      if (nursery.phase === "egg") {
        const egg = element("button", "hatch-egg", {
          type: "button",
          "data-target": "egg",
          "aria-label": "egg",
        });
        egg.append(element("span", "hatch-egg-spots"));
        creature.append(egg);
        if (index === boxes.length - 1) {
          const hint = element("span", "hatch-hint");
          hint.innerHTML = HAND_ICON;
          creature.append(hint);
        }
      } else if (nursery.phase === "babies") {
        const { baby } = nursery.babies[index] as Raising;
        creature.append(
          element("span", "hatch-ring"),
          picture("hatch-shadow", baby.picture),
        );
        const button = element("button", "hatch-baby", {
          type: "button",
          "data-target": `baby-${index}`,
          "aria-label": baby.name[language],
        });
        button.append(picture("hatch-baby-picture", baby.picture));
        for (let spot = 0; spot < 4; spot += 1)
          button.append(element("span", `hatch-mud hatch-mud-${spot}`));
        button.append(element("span", "hatch-zzz"));
        creature.append(button, picture("hatch-empty-bowl", bowl));
        for (let drop = 0; drop < 3; drop += 1) {
          const sweat = element("span", `hatch-sweat hatch-sweat-${drop}`);
          sweat.innerHTML = DROP_ICON;
          creature.append(sweat);
        }
        // A Paleontologist's magnifier, and the teeth it shows.
        const look = element("button", "hatch-look", {
          type: "button",
          "data-target": `look-${index}`,
          "aria-label": "look",
        });
        look.textContent = "🔍";
        const teeth = element("div", "hatch-teeth");
        teeth.dataset.teeth = teethOf(baby);
        teeth.innerHTML = teethPicture(teethOf(baby));
        creature.append(
          look,
          teeth,
          picture("hatch-offered", ""),
          element("div", "hatch-say"),
        );
      }
      stage.append(creature);
      return creature;
    });
  };

  const draw = () => {
    // The items wait, greyed out, until there is a baby to give them to.
    frame.dataset.phase = nursery.phase;
    frame.dataset.level = level;
    for (const button of switcher.children)
      (button as HTMLElement).dataset.on = String(
        (button as HTMLElement).dataset.level === level,
      );
    creatures.forEach((creature, index) => {
      const box = BOXES[level][index] as Box;
      if (nursery.phase === "egg") {
        creature.dataset.taps = String(nursery.taps);
        return;
      }
      const raising =
        nursery.phase === "babies" ? nursery.babies[index] : undefined;
      const { size, headX, headY } = sizeOf(raising, box);
      creature.style.setProperty("--size", String(size));
      creature.style.setProperty("--head-x", `${headX}px`);
      creature.style.setProperty("--head-y", `${headY}px`);
      creature.dataset.want =
        raising === undefined || resting.has(index)
          ? ""
          : (raising.wants[0] ?? "");
      creature.dataset.chosen = String(
        nursery.phase === "babies" &&
          level !== "hatchling" &&
          nursery.chosen === index,
      );
      creature.dataset.looking = String(
        nursery.phase === "babies" && looking === index,
      );
    });
    name.textContent =
      nursery.phase === "babies"
        ? (nursery.babies[nursery.chosen] as Raising).baby.name[language]
        : nursery.phase === "grown"
          ? nursery.babies.map((baby) => baby.name[language]).join(" + ")
          : "";
  };

  const drawFriends = () => {
    row.replaceChildren(
      ...friends.map((friend) => {
        const face = picture("hatch-friend", friend.picture);
        face.alt = friend.name[language];
        return face;
      }),
    );
  };

  // Plays a reaction on the creatures it belongs to, restarting it so the
  // same one twice plays twice.
  const play = (reaction: Reaction, actors: readonly number[], item?: Item) => {
    let words = SAYS[language][reaction] ?? "";
    if (reaction === "eat" && random() < 1 / 3) words = BURP[language];
    if ((reaction === "wash" || reaction === "splash") && random() < 1 / 3)
      words = SNEEZE[language];
    creatures.forEach((creature, index) => {
      delete creature.dataset.reaction;
      if (!actors.includes(index)) return;
      void creature.offsetWidth;
      creature.dataset.reaction = reaction;
      const offered =
        creature.querySelector<HTMLImageElement>(".hatch-offered");
      if (offered !== null) {
        offered.src = item === undefined ? "" : PICTURES[item];
        offered.dataset.item = item ?? "";
      }
      const say = creature.querySelector(".hatch-say");
      if (say !== null) say.textContent = words;
    });
    stage.dataset.reaction = reaction;
    sounds.play(
      reaction,
      words === BURP[language]
        ? "burp"
        : words === SNEEZE[language]
          ? "sneeze"
          : undefined,
    );
  };

  // A page for each baby raised, with its picture, name and teeth.
  const drawNotebook = () => {
    const ids = notebook.read();
    notebookButton.dataset.pages = String(ids.length);
    notebookPages.replaceChildren(
      ...ids
        .map((id) => BABIES.find((baby) => baby.id === id))
        .filter((baby): baby is Baby => baby !== undefined)
        .map((baby) => {
          const page = element("div", "hatch-page", { "data-id": baby.id });
          const label = element("span", "hatch-page-name");
          label.textContent = baby.name[language];
          const teeth = element("span", "hatch-page-teeth");
          teeth.innerHTML = teethPicture(teethOf(baby));
          page.append(
            picture("hatch-page-picture", baby.picture),
            label,
            teeth,
          );
          return page;
        }),
    );
  };

  const restart = () => {
    nursery = anEgg();
    looking = undefined;
    resting.clear();
    arrive();
    draw();
    delete stage.dataset.reaction;
  };

  frame.addEventListener("click", (event) => {
    const levelButton = (event.target as Element).closest<HTMLElement>(
      ".hatch-level",
    );
    if (levelButton !== null) {
      level = levelButton.dataset.level as Level;
      restart();
      return;
    }
    if ((event.target as Element).closest(".hatch-notebook-button") !== null) {
      frame.dataset.notebook = "open";
      return;
    }
    if (frame.dataset.notebook === "open") {
      delete frame.dataset.notebook;
      return;
    }
    const button = (event.target as Element).closest<HTMLElement>(
      "[data-target]",
    );
    if (button === null || now() < busyUntil) return;
    const target = button.dataset.target as Target;
    const before = nursery;
    const [next, reaction] = tap(nursery, target, random, level);
    if (reaction === undefined) return;
    nursery = next;
    busyUntil = now() + REACTION_MS;
    const actor =
      babyAt(target) ??
      lookAt(target) ??
      (before.phase === "babies" ? before.chosen : 0);
    if (reaction === "look") looking = actor;
    if (before.phase === "egg" && next.phase === "babies") arrive();
    const all = creatures.map((_, index) => index);
    // A want shows once the baby has hatched, or finished with the last.
    const hatched = before.phase === "egg" && next.phase === "babies";
    const met =
      before.phase === "babies" &&
      next.phase === "babies" &&
      next !== before &&
      babyAt(target) === undefined;
    if (hatched || met) {
      const shown = nursery;
      const waiting = hatched ? all : [actor];
      for (const index of waiting) resting.add(index);
      later(() => {
        for (const index of waiting) resting.delete(index);
        if (nursery === shown) draw();
      }, REACTION_MS);
    }
    draw();
    const together =
      reaction === "wobble" || reaction === "hatch" || reaction === "dance";
    play(
      reaction,
      together ? all : [actor],
      ITEMS.includes(target as Item) ? (target as Item) : undefined,
    );
    if (reaction === "dance" && nursery.phase === "grown") {
      const grown = nursery.babies;
      busyUntil = now() + DANCE_MS;
      if (level === "paleontologist") {
        // A baby raised again keeps its one page.
        notebook.write([
          ...new Set([...notebook.read(), ...grown.map((baby) => baby.id)]),
        ]);
        drawNotebook();
      }
      later(() => {
        friends.push(...grown);
        drawFriends();
        restart();
      }, DANCE_MS);
    }
  });
  frame.addEventListener("contextmenu", (event) => event.preventDefault());
  arrive();
  draw();
  drawNotebook();
}
