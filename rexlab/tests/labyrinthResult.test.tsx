import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LabyrinthResultScreen, type LabyrinthResultScreenProps } from "../src/LabyrinthResultScreen.tsx";
import { LevelOfferDialog } from "../src/LevelOfferDialog.tsx";
import { AGE_LEVELS } from "../src/ageLevel.ts";
import { LANGUAGES } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { LEVEL_EMS } from "./levelEms.ts";
import { withPictures } from "./pictures.tsx";
import { contrast, fakeBodyPicture, manualTimers, seenOn, surfaceOf } from "./support.ts";
import { openWindow, windowsAnd } from "./windowSizes.ts";

function resultProps(): LabyrinthResultScreenProps {
  return {
    language: "en", level: "explorer", picture: fakeBodyPicture("triceratops"),
    totalStars: 6, best: 3, beaten: undefined, celebration: null,
    onLevel: vi.fn(), onPlayAgain: vi.fn(), onHome: vi.fn()
  };
}

const part = (selector: string) => {
  const found = document.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector}`);
  return found;
};
const style = (selector: string) => getComputedStyle(part(selector));

describe.each(LANGUAGES)("the %s reunion reward", (language) => {
  it.each([null, "first-best", "new-best"] as const)("always earns three animated stars with celebration %s", (celebration) => {
    const props = { ...resultProps(), language, celebration, beaten: celebration === "new-best" ? 2 : undefined };
    render(<LabyrinthResultScreen {...props} />, withPictures);
    const text = TEXTS[language];
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(language === "en" ? "HOME TOGETHER!" : "ВМЕСТЕ ДОМА!");
    const baby = screen.getByRole("img", { name: text.labyrinthBoard.baby });
    const parent = screen.getByRole("img", { name: text.labyrinthBoard.parent });
    expect([baby.getAttribute("src"), parent.getAttribute("src")]).toEqual([props.picture, props.picture]);
    expect(baby.parentElement).toBe(parent.parentElement);
    const stars = screen.getByRole("img", { name: text.stars(3, 3) });
    expect(stars.children).toHaveLength(3);
    [...stars.children].forEach((star, index) => {
      expect(star.classList.contains("star-won")).toBe(true);
      expect((star as HTMLElement).style.getPropertyValue("--star")).toBe(String(index));
      expect(getComputedStyle(star).animation).toContain("pop-in var(--motion-standard)");
      expect(star.querySelector("svg")?.getAttribute("fill")).toBe("currentColor");
    });
    expect(part(".labyrinth-reward").textContent).toBe(language === "en" ? "+3 STARS · TOTAL 6" : "+3 ЗВЕЗДЫ · ВСЕГО 6");
    expect(screen.getByLabelText(text.bestScore).textContent).toBe(`${text.best}${props.beaten ?? ""}3`);
    expect(screen.queryByRole("status")?.getAttribute("aria-label") ?? null).toBe(celebration ? text.celebrations[celebration].label : null);
    expect(document.querySelector(".festivity") !== null).toBe(celebration !== null);
    for (const name of [text.labyrinthResult.again, text.home]) {
      expect(screen.getByRole("button", { name }).textContent).toBe(name);
      expect(screen.getByRole("button", { name }).querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    }
  });

  it("keeps the reunion and earned reward when saved totals and bests are unavailable", () => {
    render(<LabyrinthResultScreen {...resultProps()} language={language} totalStars={undefined} best={undefined} />, withPictures);
    expect(part(".labyrinth-reward").textContent).toBe(TEXTS[language].labyrinthResult.earned);
    expect(screen.queryByLabelText(TEXTS[language].bestScore)).toBeNull();
    expect(screen.getByRole("img", { name: TEXTS[language].stars(3, 3) }).children).toHaveLength(3);
    expect(screen.getByRole("img", { name: TEXTS[language].labyrinthBoard.parent })).toBeDefined();
  });
});

describe("reunion actions", () => {
  it.each(AGE_LEVELS)("reports a choice of %s and keeps the played reward until its caller updates the props", async (level) => {
    const user = userEvent.setup({ delay: null });
    const props = resultProps();
    const view = render(<LabyrinthResultScreen {...props} />, withPictures);
    const levels = screen.getByRole("group", { name: TEXTS.en.ageLevelSwitch });
    const again = screen.getByRole("button", { name: "AGAIN" });
    expect(levels.compareDocumentPosition(again) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(levels).getAllByRole("button").map((button) => button.textContent)).toEqual(["🥚HATCHLING", "🦖EXPLORER", "🦴PALEONTOLOGIST"]);
    await user.click(within(levels).getByRole("button", { name: TEXTS.en.ageLevels[level].name }));
    expect(props.onLevel).toHaveBeenCalledExactlyOnceWith(level);
    expect(within(levels).getByRole("button", { pressed: true }).textContent).toBe("🦖EXPLORER");
    expect(props.onPlayAgain).not.toHaveBeenCalled();
    view.rerender(<LabyrinthResultScreen {...props} level={level} />);
    expect(within(levels).getByRole("button", { pressed: true }).textContent).toContain(TEXTS.en.ageLevels[level].name);
    expect(part(".labyrinth-reward").textContent).toBe("+3 STARS · TOTAL 6");
    expect(screen.getByLabelText("BEST SCORE").textContent).toBe("BEST3");
    expect(screen.getByRole("img", { name: TEXTS.en.stars(3, 3) }).children).toHaveLength(3);
    await user.click(again);
    await user.click(screen.getByRole("button", { name: "HOME" }));
    expect(props.onPlayAgain).toHaveBeenCalledOnce();
    expect(props.onHome).toHaveBeenCalledOnce();
  });

  it("makes all five choices available to the keyboard", async () => {
    const user = userEvent.setup({ delay: null });
    const props = resultProps();
    render(<LabyrinthResultScreen {...props} />, withPictures);
    for (const name of [...AGE_LEVELS.map((level) => TEXTS.en.ageLevels[level].name), "AGAIN", "HOME"]) {
      await user.tab();
      expect(document.activeElement).toBe(screen.getByRole("button", { name }));
      await user.keyboard("{Enter}");
    }
    expect(vi.mocked(props.onLevel).mock.calls).toEqual(AGE_LEVELS.map((level) => [level]));
    expect(props.onPlayAgain).toHaveBeenCalledOnce();
    expect(props.onHome).toHaveBeenCalledOnce();
  });

  it.each(["yes", "not-now"] as const)("composes the shared level offer and reports %s to its caller", async (answer) => {
    const user = userEvent.setup({ delay: null });
    const onAnswer = vi.fn();
    const onShown = vi.fn();
    const props = resultProps();
    const offer = { level: "paleontologist" as const, onYes: vi.fn(), onNotNow: vi.fn(), onShown: vi.fn(), startTimer: manualTimers().startTimer };
    const view = render(<LabyrinthResultScreen {...props} levelOffer={<LevelOfferDialog language="en" offer={offer} leaving={false} onShown={onShown} onAnswer={onAnswer} onGone={vi.fn()} />} />, withPictures);
    const dialog = screen.getByRole("dialog", { name: TEXTS.en.levelOffer.question(TEXTS.en.ageLevels.paleontologist.name) });
    expect(onShown).toHaveBeenCalledOnce();
    const main = screen.getByRole("main");
    expect(main.hasAttribute("inert")).toBe(true);
    for (const button of within(main).getAllByRole<HTMLButtonElement>("button")) {
      expect(button.disabled).toBe(true);
      await user.click(button);
    }
    await user.click(within(dialog).getByRole("button", { name: answer === "yes" ? TEXTS.en.levelOffer.yes : TEXTS.en.levelOffer.notNow }));
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith(answer);
    expect(props.onLevel).not.toHaveBeenCalled();
    expect(props.onPlayAgain).not.toHaveBeenCalled();
    expect(props.onHome).not.toHaveBeenCalled();
    view.rerender(<LabyrinthResultScreen {...props} />);
    expect(main.hasAttribute("inert")).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(within(main).getAllByRole<HTMLButtonElement>("button").every((button) => !button.disabled)).toBe(true);
  });
});

describe.each(LANGUAGES.flatMap((language) => (["light", "dark"] as const).map((theme) => ({ language, theme }))))("reunion fit in $language, $theme", ({ language, theme }) => {
  it.each(windowsAnd([1024, 670]))("keeps the whole family, reward and controls visible at %i by %i", (width, height) => {
    openWindow(width, height);
    document.documentElement.dataset.theme = theme;
    try {
      render(<LabyrinthResultScreen {...resultProps()} language={language} celebration="first-best" />, withPictures);
      const px = (value: string) => Number.parseFloat(value);
      const outer = style(".labyrinth-result-screen");
      expect([outer.display, outer.flexDirection, outer.alignItems, outer.justifyContent]).toEqual(["flex", "column", "center", "center"]);
      expect([outer.boxSizing, outer.height, outer.minWidth]).toEqual(["border-box", `${height}px`, "1024px"]);
      const family = style(".labyrinth-family");
      expect(family.alignItems).toBe("flex-end");
      expect(px(family.height)).toBeCloseTo(Math.min(220, 0.28 * height));
      expect([style(".labyrinth-reunion-baby").width, style(".labyrinth-reunion-baby").height, style(".labyrinth-reunion-parent").width, style(".labyrinth-reunion-parent").height]).toEqual(["120px", "100px", "300px", "100%"]);
      expect(style(".labyrinth-reunion-parent").objectFit).toBe("contain");
      const levels = style(".labyrinth-reunion-levels");
      const levelWidth = px(levels.width);
      expect(levelWidth + px(outer.paddingLeft) + px(outer.paddingRight)).toBeLessThanOrEqual(width);
      const switchStyle = style(".level-switch");
      const levelHeight = px(style(".level-switch-level").height);
      const switchHeight = levelHeight + 2 * px(switchStyle.paddingTop) + 2 * px(switchStyle.borderTopWidth);
      const segmentWidth = (levelWidth - 2 * px(switchStyle.paddingLeft) - 2 * px(switchStyle.borderLeftWidth) - 2 * px(switchStyle.gap)) / 3;
      for (const button of within(part(".level-switch")).getAllByRole("button")) {
        const s = getComputedStyle(button);
        const name = button.querySelector(".level-switch-name")!;
        const nameWidth = LEVEL_EMS[name.textContent!]! * px(s.fontSize) + name.textContent!.length * px(s.letterSpacing);
        expect(nameWidth + 2 * px(s.paddingLeft) + 22 + px(s.gap)).toBeLessThanOrEqual(segmentWidth);
        expect(contrast(seenOn(s.color, surfaceOf(button)), surfaceOf(button))).toBeGreaterThanOrEqual(4.5);
      }
      for (const button of screen.getAllByRole("button")) expect(px(getComputedStyle(button).height)).toBeGreaterThanOrEqual(48);
      const titleHeight = px(style(".labyrinth-reunion-title").fontSize) * Number(style(".labyrinth-reunion-title").lineHeight);
      const familyHeight = Math.min(220, 0.28 * height);
      const stars = screen.getByRole("img", { name: TEXTS[language].stars(3, 3) });
      expect([...stars.querySelectorAll("svg")].map((star) => star.getAttribute("height"))).toEqual(["56", "56", "56"]);
      const contentHeight = titleHeight + familyHeight + 56 + px(style(".labyrinth-reward").lineHeight) + Math.max(px(style(".celebration").height), px(style(".best-score").height)) + switchHeight + px(style(".labyrinth-reunion-actions button").height);
      expect(contentHeight + 6 * px(outer.gap) + px(outer.paddingTop) + px(outer.paddingBottom)).toBeLessThanOrEqual(height);
      for (const selector of [".labyrinth-reunion-title", ".labyrinth-reward", ".best-score-value", ".celebration", ".labyrinth-reunion-actions button"]) {
        const element = part(selector);
        const surface = surfaceOf(element);
        expect(contrast(seenOn(getComputedStyle(element).color, surface), surface)).toBeGreaterThanOrEqual(4.5);
      }
    } finally {
      delete document.documentElement.dataset.theme;
    }
  });
});
