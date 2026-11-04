import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { QuestionScreen } from "../src/QuestionScreen.tsx";
import { TEXTS } from "../src/language/texts.ts";
import { questionProps } from "./compareQuestionProps.ts";
import { withPictures } from "./pictures.tsx";
import { contrast, symbolOf, surfaceOf } from "./support.ts";

const design = JSON.parse(readFileSync(join(import.meta.dirname, "../design/dig-site.pen"), "utf8"));
const component = (id: string): any => {
  const find = (node: any): any => node.id === id ? node : node.children?.map(find).find(Boolean);
  return find(design);
};
const part = (selector: string) => document.querySelector<HTMLElement>(selector)!;
const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(`--ds-${name}`).trim();
const literal = (property: string, value: string) => { const el = document.createElement("span"); el.style.setProperty(property, value); return getComputedStyle(el).getPropertyValue(property); };
afterEach(() => { delete document.documentElement.dataset.size; delete document.documentElement.dataset.theme; });

for (const theme of ["light", "dark"]) for (const size of ["wide", "tall", "tall-narrow", "wide-short"]) {
  test(`question uses the design's pockets, symbols and tokens in ${theme}, ${size}`, () => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.size = size;
    const props = questionProps({ answered: true, steps: ["right", "wrong", "just-right", "current", ...Array<"to-come">(6).fill("to-come")] });
    render(<QuestionScreen {...props} left={{ ...props.left, mark: "correct", value: "7 T" }} right={{ ...props.right, mark: "wrong", value: "15 KG", chosen: true }} />, withPictures);
    const matches = (selector: string, properties: Record<string, string>) => {
      for (const [property, name] of Object.entries(properties)) expect(getComputedStyle(part(selector)).getPropertyValue(property), `${selector} ${property}`).toBe(literal(property, token(name)));
    };
    matches(".question", { color: "ink" });
    matches(".question-sand", { "background-color": "strata-1" });
    matches(".question-ochre", { "background-color": "strata-2" });
    matches(".home-button", { "background-color": "quiet", color: "ink", "border-radius": "radius-pill" });
    matches(".prompt-symbol", { "background-color": "pocket-1", color: "action" });
    matches(".dinosaur-card", { "background-color": "pocket-1", color: "ink", "outline-color": "good" });
    matches('[data-mark="wrong"]', { "outline-color": "bad" });
    matches('[data-mark="correct"] .mark', { "background-color": "good", color: "on-good", "border-top-color": "label" });
    matches('[data-mark="wrong"] .mark', { "background-color": "bad", color: "on-action" });
    matches(".dinosaur-value-chip", { "background-color": "strong", color: "on-strong", "border-radius": "radius-tag" });
    matches(".versus", { "background-color": "strong", color: "on-strong", "border-radius": "radius-tag" });
    matches(".next-button", { "background-color": "action", color: "on-action", "border-radius": "radius-pill" });
    for (const [step, colour] of [["right", "reward"], ["wrong", "bad"], ["just-right", "good"], ["current", "ink"], ["to-come", "outline"]]) matches(`[data-step="${step}"]`, { "background-color": colour! });
    const phone = size === "tall-narrow" || size === "wide-short";
    expect(getComputedStyle(part(".question-best")).display === "none").toBe(phone);
    expect(getComputedStyle(part(".home-button span")).position === "absolute").toBe(phone);
    const pocket = component("z9Qo0H");
    expect(getComputedStyle(part(".dinosaur-card")).borderRadius).toBe(pocket.cornerRadius.map((name: string) => token(name.slice(4))).join(" "));
    expect(getComputedStyle(part(".dinosaur-card")).outline).toContain(`${pocket.strokeWidth}px solid`);
    expect(getComputedStyle(part(".versus")).height).toBe(`${component("rTVDH").height}px`);
    const marks = [...document.querySelectorAll(".mark")];
    expect(marks.map(symbolOf)).toEqual(["check", "x"]);
    expect(new Set(marks.map(mark => getComputedStyle(mark).backgroundColor)).size).toBe(2);
    for (const mark of marks) {
      const style = getComputedStyle(mark);
      expect(contrast(style.color, style.backgroundColor)).toBeGreaterThanOrEqual(3);
    }
    expect(screen.getByRole("button", { name: TEXTS.en.home })).toBe(part(".home-button"));
  });
}

test.each([undefined, 0, 7])("the controlled question shows best %s only when supplied", (best) => {
  render(<QuestionScreen {...questionProps({ best })} />, withPictures);
  const bestView = screen.queryByLabelText(TEXTS.en.bestScore);
  expect(bestView?.textContent).toBe(best === undefined ? undefined : `${best}/10`);
});

for (const theme of ["light", "dark"]) for (const language of ["en", "ru"] as const) {
  for (const prompt of ["mass", "height", "lighter", "shorter", "longer"] as const) {
    for (const state of ["unanswered", "right", "wrong", "last"] as const) {
      test(`question text and badges keep contrast: ${theme}, ${language}, ${prompt}, ${state}`, () => {
        document.documentElement.dataset.theme = theme;
        document.documentElement.dataset.size = "wide";
        const answered = state !== "unanswered";
        const props = questionProps({ language, prompt, answered, last: state === "last", number: state === "last" ? 10 : 1 });
        const left = { ...props.left, name: language === "en" ? "Pachycephalosaurus" : "Пахицефалозавр", value: answered ? "22 M" : undefined, mark: answered ? "correct" as const : undefined, chosen: state !== "wrong" && answered };
        const right = { ...props.right, name: language === "en" ? "Velociraptor" : "Велоцираптор", value: answered ? "1.5 M" : undefined, mark: state === "wrong" ? "wrong" as const : undefined, chosen: state === "wrong" };
        render(<QuestionScreen {...props} left={left} right={right} />, withPictures);
        expect(screen.getByRole("heading").textContent).toBe(TEXTS[language].prompts[prompt]);
        for (const selector of [".home-button span", ".question-tally", ".question-of", ".question-total", ".prompt", ".dinosaur-name", ".dinosaur-value", ".next-button"]) {
          for (const element of document.querySelectorAll(selector)) {
            expect(contrast(getComputedStyle(element).color, surfaceOf(element)), `${selector} text`).toBeGreaterThanOrEqual(4.5);
          }
        }
        expect(document.querySelectorAll(".dinosaur-value-chip")).toHaveLength(answered ? 2 : 0);
        expect(document.querySelectorAll(".mark")).toHaveLength(answered ? state === "wrong" ? 2 : 1 : 0);
        expect(screen.queryByRole("button", { name: state === "last" ? TEXTS[language].seeResult : TEXTS[language].next }) !== null).toBe(answered);
        expect(getComputedStyle(part(".dinosaur-cards > :last-child")).opacity || "1").toBe("1");
      });
    }
  }
}
