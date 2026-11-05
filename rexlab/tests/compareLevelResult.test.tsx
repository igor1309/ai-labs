import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { AGE_LEVELS } from "../src/ageLevel.ts";
import { LevelResultScreen } from "../src/LevelResultScreen.tsx";
import { TEXTS } from "../src/language/texts.ts";
import { resultProps } from "./compareResultProps.ts";
import { withPictures } from "./pictures.tsx";

for (const language of ["en", "ru"] as const) for (const level of AGE_LEVELS) {
  test(`the dig-site result reports ${level} in ${language} without replacing its finished reward`, async () => {
    const user = userEvent.setup({ delay: null });
    const callbacks = { onLevel: vi.fn(), onPlayAgain: vi.fn(), onHome: vi.fn() };
    const props = resultProps({ language, ...callbacks });
    const view = render(<LevelResultScreen {...props} />, withPictures);
    const text = TEXTS[language];
    const group = screen.getByRole("group", { name: text.ageLevelSwitch });
    const score = screen.getByLabelText(text.score);
    const best = screen.getByLabelText(text.bestScore);
    const reward = document.querySelector(".celebration");
    const finished = [score.textContent, best.textContent, reward?.textContent];

    await user.click(within(group).getByRole("button", { name: text.ageLevels[level].name }));
    expect(callbacks.onLevel.mock.calls).toEqual([[level]]);
    expect(callbacks.onPlayAgain.mock.calls).toEqual([]);
    expect(callbacks.onHome.mock.calls).toEqual([]);
    view.rerender(<LevelResultScreen {...props} level={level} />);

    expect(screen.getByLabelText(text.score)).toBe(score);
    expect(screen.getByLabelText(text.bestScore)).toBe(best);
    expect(document.querySelector(".celebration")).toBe(reward);
    expect([score.textContent, best.textContent, reward?.textContent]).toEqual(finished);
    expect(within(group).getByRole("button", { pressed: true, name: text.ageLevels[level].name })).toBeDefined();
    await user.click(screen.getByRole("button", { name: text.playAgain }));
    await user.click(screen.getByRole("button", { name: text.home }));
    expect(callbacks.onPlayAgain).toHaveBeenCalledTimes(1);
    expect(callbacks.onHome).toHaveBeenCalledTimes(1);
    expect(callbacks.onLevel.mock.calls).toEqual([[level]]);
  });
}
