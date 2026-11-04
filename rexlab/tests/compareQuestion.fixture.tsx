import "@fontsource-variable/lexend";
import "../src/app.css";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { QuestionScreen, type QuestionScreenProps } from "../src/QuestionScreen.tsx";
import { PicturesProvider, pictureStore } from "../src/Picture.tsx";
import { compareQuestionType, compareQuestionWidth, NARROW_QUESTION, PORTRAIT_QUESTION } from "../src/compareQuestionLayout.ts";
import { mediaViewport } from "../src/mediaViewport.ts";
import { questionProps } from "./compareQuestionProps.ts";

declare global { interface Window { showQuestion: (props: Partial<QuestionScreenProps>, loading?: boolean) => void } }
const files = import.meta.glob<string>("../src/assets/dinos/*/body.webp", { eager: true, query: "?url", import: "default" });
const picture = (url: string) => files[url.replace(/^\/src\//, "../src/")] ?? url;
const root = createRoot(document.getElementById("root")!);
const viewport = mediaViewport(matchMedia, undefined, window, () => getComputedStyle(document.documentElement));
const loaded = pictureStore((_url, done) => done("loaded"));
const loading = pictureStore(() => {});
window.showQuestion = (props, isLoading = false) => {
  const size = viewport.sizeClass();
  document.documentElement.dataset.size = size;
  const sizes = size === "tall-narrow" ? NARROW_QUESTION : PORTRAIT_QUESTION;
  const type = size === "tall" || size === "tall-narrow" ? compareQuestionType(compareQuestionWidth(innerWidth, 0, 0, innerWidth - document.documentElement.clientWidth, sizes), sizes) : undefined;
  const controlled = questionProps(props);
  controlled.left = { ...controlled.left, picture: picture(controlled.left.picture) };
  controlled.right = { ...controlled.right, picture: picture(controlled.right.picture) };
  flushSync(() => root.render(
    <PicturesProvider key={String(isLoading)} store={isLoading ? loading : loaded} startTimer={() => () => {}}>
      <QuestionScreen {...controlled} {...(type ? { type } : {})} />
    </PicturesProvider>
  ));
};
window.showQuestion({});
