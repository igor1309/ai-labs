import { render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { QuestionScreen } from "../src/QuestionScreen.tsx";
import { TEXTS } from "../src/language/texts.ts";
import { questionProps } from "./compareQuestionProps.ts";
import { withPictures } from "./pictures.tsx";
import { contrast, symbolOf, surfaceOf } from "./support.ts";

const part = (selector: string) => document.querySelector<HTMLElement>(selector)!;
afterEach(() => { delete document.documentElement.dataset.size; delete document.documentElement.dataset.theme; });

test.each([undefined, 0, 7])("the controlled question shows best %s only when supplied", (best) => {
  render(<QuestionScreen {...questionProps({ best })} />, withPictures);
  const bestView = screen.queryByLabelText(TEXTS.en.bestScore);
  expect(bestView?.textContent).toBe(best === undefined ? undefined : `${best}/10`);
});

for (const language of ["en", "ru"] as const) for (const prompt of ["mass", "height", "lighter", "shorter", "longer"] as const) {
  test(`question asks ${prompt} in ${language}`, () => {
    render(<QuestionScreen {...questionProps({ language, prompt })} />, withPictures);
    expect(screen.getByRole("heading").textContent).toBe(TEXTS[language].prompts[prompt]);
  });
}

const language = "en", prompt = "mass";
for (const theme of ["light", "dark"]) for (const state of ["unanswered", "wrong", "last"] as const) {
  test(`question text and badges keep contrast: ${theme}, ${state}`, () => {
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
    const marks = [...document.querySelectorAll(".mark")];
    expect(marks.map(mark => mark.getAttribute("aria-label"))).toEqual(answered ? state === "wrong" ? [TEXTS[language].marks.correct, TEXTS[language].marks.wrong] : [TEXTS[language].marks.correct] : []);
    expect(marks.map(symbolOf)).toEqual(answered ? state === "wrong" ? ["check", "x"] : ["check"] : []);
    for (const mark of marks) {
      const style = getComputedStyle(mark);
      expect(contrast(style.color, style.backgroundColor)).toBeGreaterThanOrEqual(3);
    }
    expect(screen.queryByRole("button", { name: state === "last" ? TEXTS[language].seeResult : TEXTS[language].next }) !== null).toBe(answered);
    expect(getComputedStyle(part(".dinosaur-cards > :last-child")).opacity || "1").toBe("1");
  });
}
