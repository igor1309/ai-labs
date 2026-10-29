import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AGE_LEVELS } from "../src/ageLevel.ts";
import { TEXTS } from "../src/language/texts.ts";
import { JAW_TIMING, useWhoseJawGame, type WhoseJawSaved } from "../src/whoseJawGame.tsx";
import { jawGameParts, JAWS } from "./whoseJaw.ts";
import { manualTimers } from "./support.ts";
import { PicturesProvider } from "../src/Picture.tsx";

// Integrates the controller, reducer and board with injected time and progress.
describe("child-paced Whose Jaw controller", () => {
  it.each(AGE_LEVELS.flatMap((level) => (["en", "ru"] as const).flatMap((language) => [false, true].map((reduced) => ({ level, language, reduced })))))
    ("waits for each Next at $level in $language (reduced: $reduced)", ({ level, language, reduced }) => {
      const timers = manualTimers();
      const parts = jawGameParts();
      const save = vi.fn<(saved: WhoseJawSaved) => void>();
      const props = { ...parts, progress: { load: () => undefined, save, saveLevel: vi.fn() }, total: JAWS.length, jawPicture: "jaw.webp", gummyPicture: "gummy.webp" };
      const motion = () => reduced;
      function Game() {
        return useWhoseJawGame(props, { level, revision: "parent" }, () => {}, () => {}, () => 0, timers.startTimer, motion).content(language);
      }
      render(<PicturesProvider store={timers.pictures} startTimer={timers.startTimer}><Game /></PicturesProvider>);
      const button = (name: string) => screen.getByRole("button", { name });
      fireEvent.click(button(TEXTS[language].play));
      for (let at = 0; at < 5; at++) {
        act(() => timers.fire(reduced ? JAW_TIMING.reduced : JAW_TIMING.entering));
        const owner = JAWS[at]!;
        fireEvent.click(button(TEXTS[language].jawPick));
        fireEvent.click(button(owner.name[language].toLocaleUpperCase(language)));
        const next = button(TEXTS[language].next) as HTMLButtonElement;
        expect(next.disabled).toBe(true);
        fireEvent.click(next);
        expect(save.mock.calls).toHaveLength(at + 1);
        expect(save.mock.lastCall![0].earned).toEqual(JAWS.slice(0, at + 1).map(({ id }) => id));
        act(() => timers.advance(60_000));
        const board = document.querySelector<HTMLElement>(".whose-jaw-board")!;
        expect(board.dataset.phase).toBe("reading");
        expect(next.disabled).toBe(false);
        expect(document.querySelectorAll(".jaw-socket[data-filled]")).toHaveLength(at + 1);
        if (level === "paleontologist") {
          expect(screen.getByText(owner.fact[language])).toBeDefined();
          expect(parts.spoken.filter(({ words }) => words === owner.fact[language])).toHaveLength(1);
        }
        expect(parts.played.filter((sound) => sound === "snap")).toHaveLength(at + 1);
        expect(save.mock.lastCall![0].best[level]).toBeNull();
        act(() => timers.advance(600_000));
        expect(board.dataset.phase).toBe("reading");
        expect(screen.queryByRole("img", { name: TEXTS[language].stars(3, 3) })).toBeNull();
        act(() => { fireEvent.click(next); fireEvent.click(next); fireEvent.click(next); });
        expect(document.querySelector<HTMLElement>(".whose-jaw-board")!.dataset.phase).toBe(at === 4 ? "done" : "entering");
        expect(document.querySelectorAll(".jaw-socket[data-filled]")).toHaveLength(at + 1);
        act(() => timers.deliverStopped(reduced ? JAW_TIMING.reduced : JAW_TIMING.right));
        expect(document.querySelector<HTMLElement>(".whose-jaw-board")!.dataset.phase).toBe(at === 4 ? "done" : "entering");
      }
      act(() => timers.advance(60_000));
      expect(screen.getByRole("img", { name: TEXTS[language].stars(3, 3) })).toBeDefined();
      expect(save.mock.calls).toHaveLength(6);
      expect(save.mock.lastCall![0].best[level]).toBe(3);
    });
});
