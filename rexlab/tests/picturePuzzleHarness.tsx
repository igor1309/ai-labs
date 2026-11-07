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
import { PicturePuzzleBoardScreen } from "../src/PicturePuzzleBoardScreen.tsx";
import { PicturePuzzleResultScreen } from "../src/PicturePuzzleResultScreen.tsx";
import { TEXTS } from "../src/language/texts.ts";
import type { Celebration } from "../src/ResultParts.tsx";
import { cutPicture } from "../src/picturePuzzle/index.ts";
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

// The board at a level, some pieces fitted, the rest in the tray in a
// fixed shuffle.
export function mountBoard(options: { language?: Language; theme?: "light" | "dark"; level?: AgeLevel; id?: number; fitted?: number; loading?: boolean }) {
  const level = options.level ?? "hatchling";
  const at = options.id ?? 0;
  const cut = cutPicture(level);
  const fitted = cut.pieces.slice(0, options.fitted ?? 0).map(({ id }) => id);
  const order = cut.pieces.map(({ id }) => id).sort((a, b) => (a * 7) % cut.pieces.length - (b * 7) % cut.pieces.length);
  mount(options, (language) => (
    <PicturePuzzleBoardScreen language={language} picture={PICTURES[at]!}
      scene={{ name: NAMES[language][at]!, columns: cut.columns, rows: cut.rows, guide: level === "hatchling",
        slots: cut.pieces.map(({ id, home }) => ({ id, crop: home, filled: fitted.includes(id) })),
        tray: order.filter((id) => !fitted.includes(id)).map((id) => ({ id, crop: cut.pieces[id]!.home })) }}
      presence={{ isHidden: () => false, subscribe: () => () => {} }}
      onPlace={() => false} dropFits={() => false} onBack={() => undefined} onHome={() => undefined} />
  ));
}

// The result: a first completion, a new best, a replay with nothing new, or
// with the collection unreadable, no counts and no best.
export function mountResult(options: { language?: Language; theme?: "light" | "dark"; level?: AgeLevel; id?: number; score?: number; shared?: number;
  best?: number; beaten?: number; celebration?: Celebration | null; loading?: boolean }) {
  const id = options.id ?? 0;
  const score = options.score ?? 1;
  mount(options, (language) => (
    <PicturePuzzleResultScreen language={language} name={NAMES[language][id]!} fact={TEXTS[language].pictureFacts[IDS[id] as keyof typeof TEXTS.en.pictureFacts]}
      level={options.level ?? "hatchling"} score={score} shared={options.shared ?? score} best={options.best} beaten={options.beaten}
      celebration={options.celebration ?? null}
      picture={PICTURES[id]!} onReplay={() => undefined} onAnother={() => undefined} onHome={() => undefined} />
  ));
}
