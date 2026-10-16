import type { AppProps } from "./App.tsx";
import records from "./data/dinosaurs.json";
import { readDinosaurs } from "./dinosaurs.ts";
import { localLanguage } from "./localLanguage.ts";
import { localProgress } from "./localProgress.ts";
import { localTheme } from "./localTheme.ts";
import { mediaAppearance } from "./mediaAppearance.ts";
import { mediaOrientation } from "./mediaOrientation.ts";

// What the app takes from the browser it runs in.
export type Browser = {
  localStorage: Pick<Storage, "getItem" | "setItem">;
  matchMedia(query: string): MediaQueryList;
  navigator: { language: string };
};

// The app's collaborators in a browser. Progress, the chosen language and
// the chosen theme outlive the visit, so all three are kept in local
// storage.
export function appProps(browser: Browser): AppProps {
  const storage = () => browser.localStorage;
  const media = mediaOrientation((query) => browser.matchMedia(query));
  const appearance = mediaAppearance((query) => browser.matchMedia(query));
  return {
    dinosaurs: readDinosaurs(records),
    random: Math.random,
    orientation: { isPortrait: media.portrait, subscribe: media.watch },
    progress: localProgress(storage),
    deviceLanguage: browser.navigator.language,
    languageStore: localLanguage(storage),
    appearance: { isDark: appearance.dark, subscribe: appearance.watch },
    themeStore: localTheme(storage)
  };
}
