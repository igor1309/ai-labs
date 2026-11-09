import { render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { LevelResultScreen } from "../src/LevelResultScreen.tsx";
import { TEXTS } from "../src/language/texts.ts";
import { resultProps } from "./compareResultProps.ts";
import { withPictures } from "./pictures.tsx";
import { appStylesheet } from "./stylesheet.ts";
import { openWindow } from "./windowSizes.ts";

afterEach(() => { delete document.documentElement.dataset.size; });
const phones = [
  [667, 375, { top: 0, right: 0, bottom: 21, left: 0 }],
  [852, 393, { top: 0, right: 59, bottom: 21, left: 59 }],
  [932, 430, { top: 0, right: 59, bottom: 21, left: 59 }]
] as const;
for (const language of ["en", "ru"] as const) for (const [width, height, insets] of phones) {
  test(`controlled short landscape result preserves safe areas and tap sizes: ${language}, ${width}x${height}`, () => {
    openWindow(width, height);
    document.documentElement.dataset.size = "wide-short";
    const sheet = document.createElement("style");
    sheet.textContent = appStylesheet(insets);
    document.head.append(sheet);
    try {
      render(<LevelResultScreen {...resultProps({ language })} />, withPictures);
      const style = (selector: string) => getComputedStyle(document.querySelector(selector)!);
      const result = style(".compare-result");
      expect([result.display, result.height, result.overflow]).toEqual(["grid", "auto", "hidden"]);
      expect([result.paddingTop, result.paddingRight, result.paddingBottom, result.paddingLeft]).toEqual([`${12 + insets.top}px`, `${20 + insets.right}px`, `${12 + insets.bottom}px`, `${20 + insets.left}px`]);
      expect(style(".result-hero").minHeight).toBe("120px");
      expect(style(".result-hero").objectFit).toBe("contain");
      expect(style(".result-score").gridRow).toBe("span 2");
      for (const selector of [".celebration", ".best-score", ".level-switch", ".result-actions"]) expect(style(selector).gridColumn).toBe("1 / -1");
      expect(style(".result-title").gridColumn).toBe("2");
      expect(style(".result-stars").gridColumn).toBe("2");
      expect(style(".result-actions").flexDirection).toBe("row");
      for (const name of [TEXTS[language].playAgain, TEXTS[language].home, ...Object.values(TEXTS[language].ageLevels).map(level => level.name)]) {
        const button = screen.getByRole("button", { name });
        expect(parseFloat(getComputedStyle(button).height)).toBeGreaterThanOrEqual(44);
      }
      for (const name of document.querySelectorAll(".level-switch-name")) expect(getComputedStyle(name).clipPath).toBe("inset(50%)");
    } finally { sheet.remove(); }
  });
}
