import { afterEach, expect, test } from "vitest";
import { appStylesheet, computedStyleWithVariables } from "./stylesheet.ts";

const browserStyle = computedStyleWithVariables(window.getComputedStyle.bind(window));

afterEach(() => {
  document.querySelectorAll('[data-seam]').forEach((element) => element.remove());
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.size;
});

for (const theme of ["light", "dark"]) for (const size of ["wide", "tall-narrow", "wide-short"]) {
  test(`computed variables serialize literals in ${theme}, ${size}`, () => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.size = size;
    const sheet = document.createElement("style");
    sheet.dataset.seam = "";
    sheet.textContent = `
      :root { --seam-color: #f2efe8; --seam-size: 16px; }
      [data-theme="dark"] { --seam-color: #1c2238; }
      html[data-size="tall-narrow"], html[data-size="wide-short"] { --seam-size: 14px; }
      .seam { --seam-alias: var(--seam-color); color: var(--seam-alias);
        background: var(--absent, var(--seam-color));
        padding: var(--seam-size) calc(var(--seam-size) + var(--absent, 2px));
        border: 1px solid var(--seam-color); font-size: var(--seam-size); opacity: 0.7; }
      .literal { color: ${theme === "dark" ? "#1c2238" : "#f2efe8"};
        background: ${theme === "dark" ? "#1c2238" : "#f2efe8"};
        padding: ${size === "wide" ? "16px calc(16px + 2px)" : "14px calc(14px + 2px)"};
        border: 1px solid ${theme === "dark" ? "#1c2238" : "#f2efe8"};
        font-size: ${size === "wide" ? "16px" : "14px"}; opacity: 0.7; }
    `;
    document.head.append(sheet);
    const variable = document.createElement("div");
    const literal = document.createElement("div");
    variable.className = "seam";
    literal.className = "literal";
    variable.dataset.seam = literal.dataset.seam = "";
    document.body.append(variable, literal);
    const computed = browserStyle(variable);
    const expected = browserStyle(literal);
    for (const property of ["color", "background-color", "padding-top", "padding-right", "border-top-color", "font-size", "opacity"]) {
      expect(computed.getPropertyValue(property), property).toBe(expected.getPropertyValue(property));
    }
    expect(computed.color).toBe(theme === "dark" ? "rgb(28, 34, 56)" : "rgb(242, 239, 232)");
    expect(browserStyle(variable).backgroundColor).toBe(expected.backgroundColor);
    expect(computed.fontSize).toBe(size === "wide" ? "16px" : "14px");
    expect(sheet.textContent).toContain("color: var(--seam-alias)");
  });
}

test("stylesheet retains the supplied insets and viewport-height substitution", () => {
  const css = appStylesheet({ top: 11, right: 12, bottom: 13, left: 14 });
  expect(css).not.toContain("env(");
  expect(css).not.toMatch(/\d+dvh/);
  expect(css).toContain("calc(32px + 11px)");
  expect(css).toContain("calc(40px + max(12px, 50vw - 720px))");
});

test("variable shorthands preserve literal overrides and transparent fills across reads", () => {
  const sheet = document.createElement("style");
  sheet.dataset.seam = "";
  sheet.textContent = `.seam-cascade { --pad: 8px; --ink: #123456;
    background: transparent; border: 2px solid var(--ink);
    padding: var(--pad); padding-left: 20px; color: var(--ink); }
    #seam-id { color: #abcdef; }`;
  document.head.append(sheet);
  const element = document.createElement("div");
  element.className = "seam-cascade";
  element.id = "seam-id";
  element.dataset.seam = "";
  document.body.append(element);
  for (let read = 0; read < 2; read++) {
    const style = browserStyle(element);
    expect([style.backgroundColor, style.borderTopColor, style.paddingLeft, style.paddingRight, style.color]).toEqual([
      "rgba(0, 0, 0, 0)", "rgb(18, 52, 86)", "20px", "8px", "rgb(171, 205, 239)"
    ]);
  }
});
