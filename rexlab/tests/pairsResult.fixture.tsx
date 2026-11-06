import "@fontsource-variable/lexend";
import "@fontsource-variable/manrope";
import "../src/app.css";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import type { AgeLevel } from "../src/ageLevel.ts";
import shippedDinosaurs from "../src/data/dinosaurs.json";
import type { Language } from "../src/language/language.ts";
import { mediaViewport } from "../src/mediaViewport.ts";
import { PairsResultScreen, type PairsResultScreenProps } from "../src/PairsResultScreen.tsx";
import { PicturesProvider, pictureStore } from "../src/Picture.tsx";

// Find the pair's result in a controlled state: `count` dinosaurs, the
// first `newly` of them found for the first time, its rewards, and the
// level offered over it, if any. Its dinosaurs are those with the longest
// names in its language, the hardest to fit.
export type PairsResultState = Pick<PairsResultScreenProps, "tries" | "stars" | "best" | "beaten" | "celebration" | "levelUp"> & {
  count: number;
  newly: number;
  offer?: AgeLevel;
  language: Language;
  theme: "light" | "dark";
  // Every picture fails to load.
  failed?: boolean;
};

declare global { interface Window { showPairsResult: (state: PairsResultState) => void } }

const files = import.meta.glob<string>("../src/assets/dinos/*/body.webp", { eager: true, query: "?url&no-inline", import: "default" });
const picture = (id: string) => files[`../src/assets/dinos/${id}/body.webp`];
const dinosaurs = (shippedDinosaurs as unknown as readonly { id: string; name: Record<Language, string> }[]).filter(({ id }) => picture(id) !== undefined);
const root = createRoot(document.getElementById("root")!);
const viewport = mediaViewport(matchMedia, undefined, window, () => getComputedStyle(document.documentElement));
const noop = () => {};
const timer = (ms: number, done: () => void) => { const id = setTimeout(done, ms); return () => clearTimeout(id); };
let shown = 0;

window.showPairsResult = ({ count, newly, offer, language, theme, failed = false, ...rewards }) => {
  document.documentElement.dataset.size = viewport.sizeClass();
  document.documentElement.dataset.theme = theme;
  const pals = [...dinosaurs].sort((a, b) => b.name[language].length - a.name[language].length).slice(0, count)
    .map(({ id, name }, index) => ({ id, name: name[language], picture: picture(id)!, newlyFound: index < newly }));
  const store = pictureStore((_url, done) => done(failed ? "failed" : "loaded"));
  shown++;
  flushSync(() => root.render(
    <PicturesProvider key={shown} store={store} startTimer={timer}>
      <PairsResultScreen language={language} pals={pals} {...rewards}
        offer={offer ? { level: offer, startTimer: timer, onYes: noop, onNotNow: noop, onShown: noop } : null}
        onPlayAgain={noop} onBack={noop} onHome={noop} />
    </PicturesProvider>
  ));
};
