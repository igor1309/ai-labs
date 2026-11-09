import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, onTestFinished } from "vitest";
import { QuestionScreen } from "../src/QuestionScreen.tsx";
import { TEXTS } from "../src/language/texts.ts";
import { withPictures } from "./pictures.tsx";
import { openWindow } from "./windowSizes.ts";
import { appStylesheet } from "./stylesheet.ts";
import { questionProps } from "./compareQuestionProps.ts";

afterEach(() => { delete document.documentElement.dataset.size; });

describe("a question on a phone on its side", () => {
  it.each(["en", "ru"] as const)("reserves NEXT beside every %s prompt before answering, with the pockets below", (language) => {
    openWindow(667, 375);
    document.documentElement.dataset.size = "wide-short";
    const props = questionProps({ language });
    const { rerender } = render(<QuestionScreen {...props} />, withPictures);
    const part = (selector: string) => document.querySelector<HTMLElement>(selector)!;
    const style = (selector: string) => getComputedStyle(part(selector));
    expect(style(".question").gridTemplateRows).toBe("auto auto minmax(auto, 1fr)");
    expect([style(".next-row").gridRow, style(".next-row").gridColumn, style(".next-row").width]).toEqual(["2", "2", "210px"]);
    expect([style(".dinosaur-cards").gridRow, style(".dinosaur-cards").gridColumn]).toEqual(["3", "1 / -1"]);
    expect(style(".question").getPropertyValue("--next-height").trim()).toBe("48px");
    expect(style(".question-ochre").display).toBe("none");
    expect([style(".home-button").width, style(".home-button").height]).toEqual(["48px", "48px"]);
    expect(style(".home-button .narrow-hidden").position).toBe("absolute");
    expect(style(".question-best").display).toBe("none");
    const geometry = () => [".question", ".dinosaur-cards", ".dinosaur-card", ".dinosaur-art", ".dinosaur-picture", ".dinosaur-name", ".versus", ".next-row"].map(selector => ["display", "padding", "gap", "width", "height", "min-height", "grid-template-columns", "grid-template-rows"].map(p => style(selector).getPropertyValue(p)));
    const before = geometry();
    for (const last of [false, true]) {
      rerender(<QuestionScreen {...props} answered last={last} left={{ ...props.left, value: "7 T", mark: "correct", chosen: true }} right={{ ...props.right, value: "15 KG" }} />);
      expect(geometry()).toEqual(before);
      const next = screen.getByRole("button", { name: last ? TEXTS[language].seeResult : TEXTS[language].next });
      expect([getComputedStyle(next).height, getComputedStyle(next).width]).toEqual(["var(--next-height)", "100%"]);
      for (const chip of document.querySelectorAll(".dinosaur-value-chip")) expect(getComputedStyle(chip).position).toBe("absolute");
    }
  });
});

it.each([
  [667, 375, { top: 0, right: 0, bottom: 0, left: 0 }],
  [852, 393, { top: 8, right: 59, bottom: 21, left: 59 }],
  [932, 430, { top: 0, right: 59, bottom: 21, left: 59 }]
] as const)("clears every safe area at %i by %i and keeps the 110-pixel picture minimum", (width, height, insets) => {
  openWindow(width, height);
  document.documentElement.dataset.size = "wide-short";
  const sheet = Object.assign(document.createElement("style"), { textContent: appStylesheet(insets) });
  document.head.append(sheet);
  onTestFinished(() => sheet.remove());
  render(<QuestionScreen {...questionProps()} />, withPictures);
  const question = getComputedStyle(document.querySelector(".question")!);
  expect([question.paddingTop, question.paddingRight, question.paddingBottom, question.paddingLeft]).toEqual([`${8 + insets.top}px`, `${20 + insets.right}px`, `${12 + insets.bottom}px`, `${20 + insets.left}px`]);
  expect(question.getPropertyValue("--min-picture").trim()).toBe("110px");
  expect(getComputedStyle(document.querySelector(".dinosaur-art")!).minHeight).toBe("var(--min-picture)");
});
