import assert from "node:assert/strict";
import test from "node:test";

import { learnUiHtml } from "../src/learn-ui.js";

test("learnUiTheme_shouldDefaultDarkAndExposeSwitcher_onLearnPage", () => {
  const themeContract = {
    defaultDarkTheme: learnUiHtml.includes('<html lang="en" data-theme="dark">'),
    darkColorScheme: learnUiHtml.includes("color-scheme: dark;"),
    lightThemeOverride: learnUiHtml.includes(':root[data-theme="light"]'),
    persistentThemeChoice: learnUiHtml.includes('localStorage.setItem("agonara-learn-theme"'),
    switcher: learnUiHtml.includes('id="theme-toggle-button"'),
    switcherStartsDark: learnUiHtml.includes('aria-label="Switch to light theme"'),
  };

  assert.deepEqual(themeContract, {
    defaultDarkTheme: true,
    darkColorScheme: true,
    lightThemeOverride: true,
    persistentThemeChoice: true,
    switcher: true,
    switcherStartsDark: true,
  });
});
