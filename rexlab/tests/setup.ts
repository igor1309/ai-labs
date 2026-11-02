import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { appStylesheet, computedStyleWithVariables, NO_SAFE_AREA } from "./stylesheet.ts";

// The app's stylesheet is in every test document, so a test can read the
// computed style a state gives an element. It is read from disk: Vitest
// does not load CSS imports. The window has no safe-area insets, so the
// fit budgets count none.
const sheet = document.createElement("style");
sheet.textContent = appStylesheet(NO_SAFE_AREA);
document.head.append(sheet);

// Geometry tests evaluate their authored layout expressions themselves. The
// shared faces use resolved tokens; the full browser-style seam is also
// available to tests that need other custom properties resolved.
window.getComputedStyle = computedStyleWithVariables(window.getComputedStyle.bind(window), (value) => value.includes("var(--ds-"));

// jsdom lays nothing out, so it has no scrollIntoView: a spy stands in,
// and its calls' contexts are the elements scrolled into view.
const scrollIntoView = vi.fn<(options?: ScrollIntoViewOptions) => void>();
HTMLElement.prototype.scrollIntoView = scrollIntoView;

afterEach(() => {
  cleanup();
  scrollIntoView.mockClear();
});
