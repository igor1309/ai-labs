// The care mission prototype, round 2 (LAB-349, after LAB-281): five
// hungry dinosaurs wait in a line, and the child feeds each in turn with
// one tap on a food. A dinosaur that eats it chomps, sends up hearts and
// hops for joy before the next one comes; one that does not shakes its
// head and the food bounces out of the bowl, to try again. Water is
// slurped, and the dinosaur is still hungry. Feeding all five hatches the
// egg in the nest. Apart from the game, for a playtest only: nothing is
// scored, timed or kept.
import "@fontsource-variable/lexend";
import "./careMission.css";
import bowl from "../src/assets/care/bowl.webp";
import meat from "../src/assets/care/meat.webp";
import nest from "../src/assets/care/nest.webp";
import plants from "../src/assets/care/plants.webp";
import water from "../src/assets/care/water.webp";
import data from "../src/data/dinosaurs.json";
import gallimimus from "../src/assets/dinos/gallimimus/body.webp";
import stegosaurus from "../src/assets/dinos/stegosaurus/body.webp";
import triceratops from "../src/assets/dinos/triceratops/body.webp";
import tyrannosaurus from "../src/assets/dinos/tyrannosaurus/body.webp";
import velociraptor from "../src/assets/dinos/velociraptor/body.webp";

export type Item = "plants" | "meat" | "water";
type Food = Exclude<Item, "water">;
export type Reaction = "eats" | "refuses" | "drinks";

type Visitor = { name: string; eats: readonly Food[]; picture: string };

// The line, in the order it comes: meat and plants by turns, then one
// that eats both.
const PICTURES_OF: Record<string, string> = { tyrannosaurus, triceratops, velociraptor, stegosaurus, gallimimus };
const EATS: Record<string, readonly Food[]> = { meat: ["meat"], plants: ["plants"], both: ["meat", "plants"] };

// Each with its name and diet from the dinosaurs' data.
export const VISITORS: readonly Visitor[] = Object.entries(PICTURES_OF).map(([id, picture]) => {
  const dinosaur = data.find((each) => each.id === id);
  if (dinosaur === undefined) throw new Error(`No dinosaur ${id} in the data`);
  return { name: dinosaur.name.en.toUpperCase(), eats: EATS[dinosaur.diet] ?? [], picture };
});

// Where the mission is: how many are fed, so which one is at the bowl,
// whether that one has drunk, and the round, which picks the egg's baby.
export type Mission = { round: number; fed: number; drank: boolean };

export const startOf = (round = 0): Mission => ({ round, fed: 0, drank: false });

export const isHatched = (mission: Mission) => mission.fed >= VISITORS.length;

const visitorAt = (at: number) => VISITORS[at % VISITORS.length] as Visitor;

export const choicesOf = (mission: Mission): Item[] => (isHatched(mission) ? [] : mission.drank ? ["plants", "meat"] : ["plants", "meat", "water"]);

export function reactionOf(mission: Mission, item: Item): Reaction {
  if (item === "water") return "drinks";
  return visitorAt(mission.fed).eats.includes(item) ? "eats" : "refuses";
}

export function after(mission: Mission, reaction: Reaction): Mission {
  if (reaction === "eats") return { ...mission, fed: mission.fed + 1, drank: false };
  if (reaction === "drinks") return { ...mission, drank: true };
  return mission;
}

// The sounds the mission makes.
export type Sound = "toss" | "chomp" | "bleh" | "slurp" | "yay" | "crack" | "fanfare";

// Waits, and plays one animation on an element to its end.
export type Motion = {
  wait: (ms: number) => Promise<void>;
  play: (element: Element, frames: Keyframe[], ms: number) => Promise<void>;
};

const PICTURE_OF: Record<Item, string> = { plants, meat, water };
const LABELS: Record<Item | "again", string> = { plants: "PLANTS", meat: "MEAT", water: "WATER", again: "PLAY AGAIN" };

// A tap this soon after the last one is the second of a double tap.
const SETTLE_MS = 400;

// The dinosaur's head reaches the bowl from this far to its left.
const LEAN = -230;

const HOME_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11 12 3l9 8M5 9.5V21h5v-6h4v6h5V9.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const AGAIN_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h11a5 5 0 0 1 0 10H9M4 10l4-4M4 10l4 4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11Z" fill="currentColor"/></svg>';
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 3 6.9 7.5.7-5.7 5 1.7 7.4L12 18l-6.5 4 1.7-7.4-5.7-5 7.5-.7Z" fill="currentColor"/></svg>';
const DROP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2s7 8 7 13a7 7 0 0 1-14 0c0-5 7-13 7-13Z" fill="currentColor"/></svg>';

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, attributes: Record<string, string> = {}): HTMLElementTagNameMap[K] {
  const made = document.createElement(tag);
  made.className = className;
  for (const [name, value] of Object.entries(attributes)) made.setAttribute(name, value);
  return made;
}

const picture = (className: string, src: string, alt = "") => element("img", className, { src, alt, draggable: "false" });

function icon(className: string, svg: string): HTMLSpanElement {
  const made = element("span", className);
  made.innerHTML = svg;
  return made;
}

function text(className: string, words: string): HTMLSpanElement {
  const made = element("span", className);
  made.textContent = words;
  return made;
}

// The browser's own timers and animations; under reduced motion, short
// fades only.
function browserMotion(): Motion {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const length = (ms: number) => (reduced ? Math.min(ms, 200) : ms);
  return {
    wait: (ms) => new Promise((done) => setTimeout(done, length(ms))),
    play: async (target, frames, ms) => {
      const shown = reduced ? frames.map(({ opacity = 1, offset }) => (offset === undefined ? { opacity } : { opacity, offset })) : frames;
      await target
        .animate(shown, { duration: length(ms), easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" })
        .finished.then(() => undefined)
        .catch(() => undefined);
    }
  };
}

// Sounds made up with Web Audio, the context opened by the first tap, as
// Safari asks; silence where there is no Web Audio.
function browserSounds(): (sound: Sound) => void {
  let context: AudioContext | undefined;
  const audio = () => {
    if (context === undefined && typeof AudioContext === "function") context = new AudioContext();
    if (context?.state === "suspended") void context.resume();
    return context;
  };
  const tone = (ctx: AudioContext, type: OscillatorType, from: number, to: number, ms: number, at = 0, volume = 0.18) => {
    const start = ctx.currentTime + at / 1000;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(to, start + ms / 1000);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + ms / 1000);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + ms / 1000);
  };
  // A short burst of filtered noise, a bite or a crack.
  const crunch = (ctx: AudioContext, at: number, pitch = 900) => {
    const length = Math.floor(ctx.sampleRate * 0.09);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let sample = 0; sample < length; sample++) samples[sample] = (Math.random() * 2 - 1) * (1 - sample / length);
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    source.buffer = buffer;
    filter.type = "bandpass";
    filter.frequency.value = pitch;
    gain.gain.value = 0.6;
    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start(ctx.currentTime + at / 1000);
  };
  const notes = (ctx: AudioContext, pitches: number[], step: number, ms: number) => pitches.forEach((note, at) => tone(ctx, "triangle", note, note, ms, at * step, 0.2));
  const sounds: Record<Sound, (ctx: AudioContext) => void> = {
    toss: (ctx) => tone(ctx, "sine", 500, 900, 160),
    chomp: (ctx) => [0, 250, 500].forEach((at) => crunch(ctx, at)),
    bleh: (ctx) => tone(ctx, "sawtooth", 260, 110, 420, 0, 0.12),
    slurp: (ctx) => [0, 180, 360].forEach((at) => tone(ctx, "sine", 300, 700, 160, at)),
    yay: (ctx) => notes(ctx, [523, 659, 784], 110, 180),
    crack: (ctx) => [0, 120].forEach((at) => crunch(ctx, at, 2400)),
    fanfare: (ctx) => notes(ctx, [523, 659, 784, 1047, 784, 1047], 150, 260)
  };
  return (sound) => {
    const ctx = audio();
    if (ctx !== undefined) sounds[sound](ctx);
  };
}

// Draws the mission into `root` and plays it there, the frames scaled to
// fit the window. A tap waits while a reaction plays; `idle` resolves
// once the one playing has ended.
export function startCareMission(root: HTMLElement, { motion = browserMotion(), sound = browserSounds() }: { motion?: Motion; sound?: (sound: Sound) => void } = {}) {
  let mission = startOf();
  let busy: Promise<void> = Promise.resolve();
  let playing = false;
  let tappedAt = Number.NEGATIVE_INFINITY;

  const frame = element("div", "mission-frame");
  const home = element("a", "mission-home", { href: "/" });
  home.append(icon("mission-home-icon", HOME_ICON), text("", "HOME"));
  const line = element("ol", "mission-line", { "aria-label": "Hungry dinosaurs" });
  const stage = element("div", "mission-stage");
  const ground = element("div", "mission-ground");
  const bowlPicture = picture("mission-bowl", bowl);
  const name = element("h1", "mission-name");
  const tray = element("div", "mission-tray");
  let dinosaur = picture("mission-visitor", "");
  stage.append(element("div", "mission-glow"), ground, bowlPicture, dinosaur, name);
  frame.append(home, line, stage, tray);
  root.replaceChildren(frame);

  const fit = () => root.style.setProperty("--mission-scale", String(Math.min(window.innerWidth / 1440, window.innerHeight / 900)));
  fit();
  window.addEventListener("resize", fit);

  const drawLine = () =>
    line.replaceChildren(
      ...VISITORS.map((visitor, at) => {
        const place = element("li", "mission-place", { "data-state": at < mission.fed ? "fed" : at === mission.fed ? "now" : "waiting" });
        place.append(picture("mission-place-picture", visitor.picture, visitor.name));
        if (at < mission.fed) place.append(icon("mission-place-heart", HEART));
        return place;
      })
    );

  const card = (choice: Item | "again", ...art: Element[]) => {
    const button = element("button", `mission-choice mission-choice-${choice}`, { type: "button", "data-choice": choice });
    const holder = element("span", "mission-choice-art");
    holder.append(...art);
    button.append(holder, text("mission-choice-label", LABELS[choice]));
    return button;
  };

  const drawTray = () =>
    tray.replaceChildren(
      ...(isHatched(mission)
        ? [card("again", icon("mission-choice-icon", AGAIN_ICON), picture("mission-again-visitor", visitorAt(0).picture))]
        : choicesOf(mission).map((item) => card(item, picture("mission-choice-picture", PICTURE_OF[item]))))
    );

  // The next dinosaur walks in from the right.
  const arrive = async () => {
    const visitor = visitorAt(mission.fed);
    const walking = picture("mission-visitor", visitor.picture, visitor.name);
    dinosaur.replaceWith(walking);
    dinosaur = walking;
    name.textContent = visitor.name;
    drawLine();
    drawTray();
    await motion.play(dinosaur, [{ transform: "translateX(760px)" }, { transform: "translateX(0)" }], 800);
  };

  // A burst of `count` shapes from (x, y) on the stage, flying up and out.
  const burst = (svg: string, className: string, x: number, y: number, count: number) =>
    Promise.all(
      Array.from({ length: count }, async (_, at) => {
        const shape = icon(`mission-burst ${className}`, svg);
        Object.assign(shape.style, { left: `${x}px`, top: `${y}px` });
        stage.append(shape);
        const angle = (Math.PI * (at + 0.5)) / count;
        const [dx, dy] = [Math.cos(angle) * 180, -Math.sin(angle) * 180 - 80];
        await motion.play(shape, [{ transform: "translate(0, 0) scale(0.4)", opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(1.3)`, opacity: 0 }], 900 + at * 70);
        shape.remove();
      })
    );

  // Moves the dinosaur through `moves`, each a transform after the lean.
  const pose = (moves: string[], ms: number, from = LEAN) => motion.play(dinosaur, moves.map((move) => ({ transform: `translateX(${from}px) ${move}` })), ms);

  // The food flies from its card into the bowl.
  const toss = async (item: Item, from: HTMLElement) => {
    const food = picture(`mission-food mission-food-${item}`, PICTURE_OF[item]);
    food.dataset.food = item;
    dinosaur.before(food);
    const dx = from.offsetLeft + from.offsetWidth / 2 - 410;
    sound("toss");
    await motion.play(
      food,
      [
        { transform: `translate(${dx}px, 330px) scale(0.6)` },
        { transform: `translate(${dx / 2}px, -120px) scale(0.9)`, offset: 0.55 },
        { transform: "translate(0, 0) scale(1)" }
      ],
      600
    );
    return food;
  };

  const eat = async (food: HTMLElement) => {
    sound("chomp");
    await Promise.all([
      pose(["rotate(0deg)", "translateY(18px) rotate(-8deg)", "rotate(0deg)", "translateY(18px) rotate(-8deg)", "rotate(0deg)", "translateY(18px) rotate(-8deg)", "rotate(0deg)"], 750),
      motion.play(food, [{ transform: "scale(1)" }, { transform: "scale(0.75)" }, { transform: "scale(0.45)" }, { transform: "scale(0)", opacity: 0 }], 750)
    ]);
    food.remove();
    sound("yay");
    await Promise.all([burst(HEART, "mission-heart", 470, 110, 7), pose(["translateY(0)", "translateY(-80px)", "translateY(0)", "translateY(-60px)", "translateY(0)"], 900)]);
    mission = after(mission, "eats");
    drawLine();
    await motion.play(dinosaur, [{ transform: `translateX(${LEAN}px)` }, { transform: "translateX(-1300px)" }], 800);
    await (isHatched(mission) ? hatch() : arrive());
  };

  const drink = async (food: HTMLElement) => {
    sound("slurp");
    await Promise.all([
      pose(["rotate(0deg)", "translateY(18px) rotate(-8deg)", "translateY(14px) rotate(-6deg)", "translateY(18px) rotate(-8deg)", "rotate(0deg)"], 1000),
      burst(DROP, "mission-drop", 400, 280, 6),
      motion.play(food, [{ opacity: 1 }, { opacity: 1 }, { opacity: 0 }], 1000)
    ]);
    food.remove();
    mission = after(mission, "drinks");
    drawTray();
    await pose(["translateX(0)", `translateX(${-LEAN}px)`], 450);
  };

  // Shakes its head and knocks the food out of the bowl.
  const refuse = async (food: HTMLElement) => {
    sound("bleh");
    await pose(["rotate(0deg)", "rotate(-7deg)", "rotate(7deg)", "rotate(-7deg)", "rotate(7deg)", "rotate(0deg)"], 650, LEAN / 2);
    await Promise.all([
      motion.play(food, [{ transform: "translate(0, 0) rotate(0deg)" }, { transform: "translate(-160px, -240px) rotate(-200deg)" }, { transform: "translate(-320px, 60px) rotate(-360deg)", opacity: 0 }], 700),
      pose(["translateX(0)", `translateX(${-LEAN / 2}px)`], 500, LEAN / 2)
    ]);
    food.remove();
  };

  const react = async (item: Item, from: HTMLElement) => {
    const reaction = reactionOf(mission, item);
    const food = await toss(item, from);
    if (reaction === "refuses") {
      await pose(["translateX(0)", `translateX(${LEAN / 2}px)`], 400, 0);
      return refuse(food);
    }
    await pose(["translateX(0)", `translateX(${LEAN}px)`], 450, 0);
    return reaction === "eats" ? eat(food) : drink(food);
  };

  // All five fed: they gather round the nest, the egg wobbles, cracks,
  // and a baby looks out.
  const hatch = async () => {
    dinosaur.remove();
    bowlPicture.remove();
    name.textContent = "";
    tray.replaceChildren();
    const crowd = element("div", "mission-crowd");
    crowd.append(...VISITORS.map((visitor) => picture("mission-crowd-dinosaur", visitor.picture, visitor.name)));
    const egg = element("div", "mission-egg", { "data-egg": "whole" });
    const top = element("div", "mission-egg-top");
    const baby = picture("mission-baby", visitorAt(mission.round).picture);
    egg.append(baby, element("div", "mission-egg-bottom"), top);
    stage.append(crowd, egg, picture("mission-nest", nest));
    await motion.play(crowd, [{ transform: "translateY(60px)", opacity: 0 }, { transform: "translateY(0)", opacity: 1 }], 600);
    for (const tilt of [8, 12, 16]) {
      await motion.play(egg, [{ transform: "rotate(0deg)" }, { transform: `rotate(-${tilt}deg)` }, { transform: `rotate(${tilt}deg)` }, { transform: "rotate(0deg)" }], 420);
      await motion.wait(300);
    }
    sound("crack");
    egg.dataset.egg = "hatched";
    sound("fanfare");
    await Promise.all([
      motion.play(top, [{ transform: "translate(0, 0) rotate(0deg)", opacity: 1 }, { transform: "translate(110px, -180px) rotate(50deg)", opacity: 0 }], 700),
      motion.play(baby, [{ transform: "translateY(70px) scale(0.5)", opacity: 0 }, { transform: "translateY(0) scale(1)", opacity: 1 }], 700),
      burst(STAR, "mission-star", 664, 200, 9),
      ...[...crowd.children].map((each, at) =>
        motion.play(each, [{ transform: "translateY(0)" }, { transform: "translateY(-60px)" }, { transform: "translateY(0)" }, { transform: "translateY(-30px)" }, { transform: "translateY(0)" }], 900 + at * 90)
      )
    ]);
    drawTray();
  };

  // Plays again from the first dinosaur, the stage as it was.
  const again = async () => {
    mission = startOf(mission.round + 1);
    for (const each of stage.querySelectorAll(".mission-crowd, .mission-egg, .mission-nest")) each.remove();
    ground.after(bowlPicture);
    bowlPicture.after(dinosaur);
    await arrive();
  };

  const run = (task: () => Promise<void>) => {
    playing = true;
    busy = task().finally(() => {
      playing = false;
    });
  };

  frame.addEventListener("click", (event) => {
    const chosen = (event.target as Element).closest<HTMLElement>("[data-choice]");
    if (chosen === null || playing || event.timeStamp - tappedAt < SETTLE_MS) return;
    tappedAt = event.timeStamp;
    const choice = chosen.dataset.choice;
    run(() => (choice === "again" ? again() : react(choice as Item, chosen)));
  });
  frame.addEventListener("contextmenu", (event) => event.preventDefault());
  run(arrive);

  return { idle: () => busy };
}
