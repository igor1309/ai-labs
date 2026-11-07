import "@fontsource-variable/lexend";
import "@fontsource-variable/manrope";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import "../src/app.css";
import type { AgeLevel } from "../src/ageLevel.ts";
import type { Language } from "../src/language/language.ts";
import { mediaViewport } from "../src/mediaViewport.ts";
import { PicturesProvider, pictureStore } from "../src/Picture.tsx";
import { PicturePuzzleChoiceScreen } from "../src/PicturePuzzleChoiceScreen.tsx";
import tyrannosaurus from "../src/assets/dinos/tyrannosaurus/body.webp";
import triceratops from "../src/assets/dinos/triceratops/body.webp";
import stegosaurus from "../src/assets/dinos/stegosaurus/body.webp";

const sizeViewport = mediaViewport(window.matchMedia.bind(window), window.screen.orientation, window, () => getComputedStyle(document.documentElement));
const applySize = () => { document.documentElement.dataset.size = sizeViewport.sizeClass(); };
applySize();
sizeViewport.subscribe(applySize);

const NAMES = { en: ["Tyrannosaurus", "Triceratops", "Stegosaurus"], ru: ["Тираннозавр", "Трицератопс", "Стегозавр"] };
const IDS = ["tyrannosaurus", "triceratops", "stegosaurus"];
const PICTURES = [tyrannosaurus, triceratops, stegosaurus];

let root: Root | undefined;
const loaded = pictureStore((_url, done) => done("loaded"));
const loading = pictureStore(() => {});

function mount(options: { language?: Language; theme?: "light" | "dark"; loading?: boolean }, screen: (language: Language) => React.ReactNode) {
  root?.unmount();
  const language = options.language ?? "en";
  document.documentElement.dataset.theme = options.theme ?? "light";
  document.documentElement.lang = language;
  const host = document.getElementById("root") ?? document.body.appendChild(Object.assign(document.createElement("div"), { id: "root" }));
  root = createRoot(host);
  flushSync(() => root!.render(
    <PicturesProvider store={options.loading ? loading : loaded} startTimer={() => () => {}}>{screen(language)}</PicturesProvider>
  ));
}

// The choice, a first visit with no stars or a return with some.
export function mountChoice(options: { language?: Language; theme?: "light" | "dark"; level?: AgeLevel; stars?: number; loading?: boolean }) {
  const stars = options.stars ?? 0;
  mount(options, (language) => (
    <PicturePuzzleChoiceScreen language={language} level={options.level ?? "hatchling"} onLevel={() => undefined} onChoose={() => undefined} onHome={() => undefined}
      choices={IDS.map((id, index) => ({ id, name: NAMES[language][index]!, picture: PICTURES[index]!, earned: index < stars }))} />
  ));
}
