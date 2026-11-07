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
