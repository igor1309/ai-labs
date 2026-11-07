import "@fontsource-variable/lexend";
import "@fontsource-variable/manrope";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import "../src/app.css";
import type { AgeLevel } from "../src/ageLevel.ts";
import type { Language } from "../src/language/language.ts";
import { mediaViewport } from "../src/mediaViewport.ts";
import { PicturesProvider, pictureStore } from "../src/Picture.tsx";
import { SkeletonChoiceScreen } from "../src/SkeletonChoiceScreen.tsx";
import { SkeletonGuessScreen } from "../src/SkeletonGuessScreen.tsx";
import { SkeletonPuzzleScreen, type ShownHelpStep } from "../src/SkeletonPuzzleScreen.tsx";
import data from "../src/data/skeletons.json";
import tyrannosaurus from "../src/assets/dinos/tyrannosaurus/body.webp";
import triceratops from "../src/assets/dinos/triceratops/body.webp";
import stegosaurus from "../src/assets/dinos/stegosaurus/body.webp";
import brachiosaurus from "../src/assets/dinos/brachiosaurus/body.webp";
import spinosaurus from "../src/assets/dinos/spinosaurus/body.webp";

const sizeViewport = mediaViewport(window.matchMedia.bind(window), window.screen.orientation, window, () => getComputedStyle(document.documentElement));
const applySize = () => { document.documentElement.dataset.size = sizeViewport.sizeClass(); };
applySize();
sizeViewport.subscribe(applySize);

const NAMES = {
  en: ["Tyrannosaurus", "Triceratops", "Stegosaurus", "Brachiosaurus", "Spinosaurus"],
  ru: ["Тираннозавр", "Трицератопс", "Стегозавр", "Брахиозавр", "Спинозавр"]
};
const IDS = ["tyrannosaurus", "triceratops", "stegosaurus", "brachiosaurus", "spinosaurus"];
const PICTURES = [tyrannosaurus, triceratops, stegosaurus, brachiosaurus, spinosaurus];

let root: Root | undefined;
const loaded = pictureStore((_url, done) => done("loaded"));
const loading = pictureStore(() => {});

// The choice, a first visit with no stars or a return with some, which
// brings the best and the mystery tile.
export function mountChoice(options: { language?: Language; theme?: "light" | "dark"; level?: AgeLevel; stars?: number; loading?: boolean }) {
  root?.unmount();
  const language = options.language ?? "en";
  const stars = options.stars ?? 0;
  document.documentElement.dataset.theme = options.theme ?? "light";
  document.documentElement.lang = language;
  const host = document.getElementById("root") ?? document.body.appendChild(Object.assign(document.createElement("div"), { id: "root" }));
  root = createRoot(host);
  flushSync(() => root!.render(
    <PicturesProvider store={options.loading ? loading : loaded} startTimer={() => () => {}}>
      <SkeletonChoiceScreen language={language} level={options.level ?? "hatchling"} onLevel={() => undefined} onChoose={() => undefined} onMuseum={() => undefined} onHome={() => undefined}
        best={stars > 0 ? stars : undefined} onMystery={stars > 0 ? () => undefined : undefined}
        choices={IDS.map((id, index) => ({ id, name: NAMES[language][index]!, picture: PICTURES[index]!, earned: index < stars }))} />
    </PicturesProvider>
  ));
}

const BONES = import.meta.glob<string>("../src/assets/skeletons/*/*.webp", { eager: true, query: "?url&no-inline", import: "default" });
const bone = (id: string, part: string) => BONES[`../src/assets/skeletons/${id}/${part}.webp`]!;

// The puzzle at a level, some bones fitted, help showing or a stray's line
// said, and every bone fitted when complete.
export function mountPuzzle(options: { language?: Language; theme?: "light" | "dark"; id?: string; level?: AgeLevel; fitted?: number; step?: ShownHelpStep; told?: boolean; loading?: boolean }) {
  root?.unmount();
  const language = options.language ?? "en";
  const id = options.id ?? "tyrannosaurus";
  const level = options.level ?? "hatchling";
  const { width, height } = data.frame;
  const dinosaur = (data.dinosaurs as unknown as Record<string, { cuts: Record<AgeLevel, { id: string; area: "head"; name: Record<Language, string>; x: number; y: number; width: number; height: number }[]> }>)[id]!;
  const cut = dinosaur.cuts[level];
  const fitted = options.fitted ?? 0;
  const slots = cut.map((piece, index) => ({ piece: piece.id, name: piece.name[language], picture: bone(id, piece.id), area: piece.area, left: piece.x / width, top: piece.y / height, width: piece.width / width, height: piece.height / height, fitted: index < fitted }));
  const strayOf = (other: string, at: number) => ({ piece: `${other}:${at}`, name: other, picture: bone(other, (data.dinosaurs as unknown as Record<string, { cuts: Record<AgeLevel, { id: string }[]> }>)[other]!.cuts.hatchling[at]!.id), width: 0.2, height: 0.2 });
  const strays = level === "paleontologist" ? [strayOf("triceratops", 0), strayOf("stegosaurus", 0)] : [];
  const target = slots[fitted] ?? slots[0]!;
  document.documentElement.dataset.theme = options.theme ?? "light";
  document.documentElement.lang = language;
  const host = document.getElementById("root") ?? document.body.appendChild(Object.assign(document.createElement("div"), { id: "root" }));
  root = createRoot(host);
  flushSync(() => root!.render(
    <PicturesProvider store={options.loading ? loading : loaded} startTimer={() => () => {}}>
      <SkeletonPuzzleScreen language={language} name={NAMES[language][IDS.indexOf(id)]!} outline={bone(id, "skeleton")} silhouette={level === "paleontologist"} homeShown={level === "hatchling"} frame={data.frame}
        slots={slots} strays={strays} tray={[...slots.map((slot) => slot.piece), ...strays.map((stray) => stray.piece)].sort()} told={options.told ? (language === "ru" ? "ЧЕРЕП ТРИЦЕРАТОПСА" : "TRICERATOPS FRILL") : undefined}
        hint={options.step && { piece: target.piece, step: options.step, region: options.step === "glow" ? undefined : { left: target.left, top: target.top, width: target.width, height: target.height } }}
        complete={fitted >= slots.length} scatter={false} onDrop={() => undefined} onTouch={() => undefined} onLastStep={() => undefined} onMuseum={() => undefined} onBack={() => undefined} onHome={() => undefined} />
    </PicturesProvider>
  ));
}

// The mystery's guess, its first card guessed wrong and the clue given when
// wrong, in the longest names and clue of the set when long.
export function mountGuess(options: { language?: Language; theme?: "light" | "dark"; wrong?: boolean; loading?: boolean }) {
  root?.unmount();
  const language = options.language ?? "en";
  document.documentElement.dataset.theme = options.theme ?? "light";
  document.documentElement.lang = language;
  const host = document.getElementById("root") ?? document.body.appendChild(Object.assign(document.createElement("div"), { id: "root" }));
  root = createRoot(host);
  const clues = (data.dinosaurs as unknown as Record<string, { clue: Record<Language, string> }>);
  const clue = Object.values(clues).map((dinosaur) => dinosaur.clue[language]).sort((a, b) => b.length - a.length)[0];
  flushSync(() => root!.render(
    <PicturesProvider store={options.loading ? loading : loaded} startTimer={() => () => {}}>
      <SkeletonGuessScreen language={language} skeleton={bone("triceratops", "skeleton")} frame={data.frame} clue={options.wrong ? clue : undefined}
        choices={[0, 1, 3].map((index, at) => ({ id: IDS[index]!, name: NAMES[language][index]!, picture: PICTURES[index]!, wrong: Boolean(options.wrong) && at === 0 }))}
        onGuess={() => undefined} onBack={() => undefined} onMuseum={() => undefined} onHome={() => undefined} />
    </PicturesProvider>
  ));
}
