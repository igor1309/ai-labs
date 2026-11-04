import "@fontsource-variable/lexend";
import "../src/app.css";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { LevelResultScreen, type LevelResultScreenProps } from "../src/LevelResultScreen.tsx";
import { PicturesProvider, pictureStore } from "../src/Picture.tsx";
import { compareResultType, compareResultWidth, NARROW_RESULT, PORTRAIT_RESULT } from "../src/compareResultLayout.ts";
import { mediaViewport } from "../src/mediaViewport.ts";
import { resultProps } from "./compareResultProps.ts";

declare global { interface Window { showResult: (props: Partial<LevelResultScreenProps>, loading?: boolean) => void } }
const files = import.meta.glob<string>("../src/assets/dinos/*/body.webp", { eager: true, query: "?url", import: "default" });
const root = createRoot(document.getElementById("root")!);
const viewport = mediaViewport(matchMedia, undefined, window, () => getComputedStyle(document.documentElement));
const loaded = pictureStore((_url, done) => done("loaded"));
const loading = pictureStore(() => {});
window.showResult = (props, isLoading = false) => {
  const size = viewport.sizeClass();
  document.documentElement.dataset.size = size;
  const sizes = size === "tall-narrow" ? NARROW_RESULT : PORTRAIT_RESULT;
  const type = compareResultType(compareResultWidth(innerWidth, 0, 0, innerWidth - document.documentElement.clientWidth, sizes), sizes);
  const controlled = resultProps(props);
  controlled.hero = files[controlled.hero.replace(/^\/src\//, "../src/")] ?? controlled.hero;
  flushSync(() => root.render(
    <PicturesProvider key={String(isLoading)} store={isLoading ? loading : loaded} startTimer={() => () => {}}>
      <LevelResultScreen {...controlled} type={type} />
    </PicturesProvider>
  ));
};
window.showResult({});
