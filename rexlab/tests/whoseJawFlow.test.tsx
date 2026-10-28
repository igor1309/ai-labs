import { act, fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, onTestFinished } from "vitest";
import { AGE_LEVELS } from "../src/ageLevel.ts";
import { TEXTS } from "../src/language/texts.ts";
import { localWhoseJawProgress } from "../src/localProgress.ts";
import { JAW_TIMING } from "../src/whoseJawGame.tsx";
import { homeTile } from "./support.ts";
import { pressAt, moveAt } from "./taps.ts";
import { JAWS } from "./whoseJaw.ts";
import { openWhoseJawApp } from "./whoseJawApp.tsx";

// Integrates app navigation, round state, injected timers and the browser
// progress adapter across a reload, in both languages and every level.
describe("Whose Jaw full visit", () => {
  it.each(AGE_LEVELS.flatMap((level) => (["en", "ru"] as const).map((language) => ({ level, language }))))(
    "keeps the $language $level round, shelf and reload consistent", ({ level, language }) => {
      const before = Object.getOwnPropertyDescriptor(Element.prototype, "getAnimations");
      Object.defineProperty(Element.prototype, "getAnimations", { configurable: true, value: () => [] });
      onTestFinished(() => { if (before) Object.defineProperty(Element.prototype, "getAnimations", before); else Reflect.deleteProperty(Element.prototype, "getAnimations"); });
      const text = TEXTS[language];
      let app = openWhoseJawApp({ language });
      const button = (name: string) => screen.getByRole("button", { name });
      fireEvent.click(homeTile(text.whoseJaw));
      fireEvent.click(button(text.ageLevels[level].name));
      fireEvent.click(button(text.play));
      const ids: string[] = [];
      for (let at = 0; at < 5; at++) {
        act(() => app.timers.fire(JAW_TIMING.entering));
        let jaw = screen.getByLabelText(text.jawPick);
        if (at === 0) {
          pressAt(jaw, 1000, { x: 500, y: 500 });
          moveAt(1100, { x: 900, y: 900 });
          fireEvent(window, new PointerEvent("pointercancel", { pointerId: 1 }));
          jaw = screen.getByLabelText(text.jawPick);
          expect(jaw.getAttribute("aria-pressed")).toBe("false");
          expect(app.parts.played).toEqual([]);
        }
        const id = /jaw-(.+)\.webp/.exec(jaw.querySelector("img")!.getAttribute("src")!)![1]!;
        ids.push(id);
        const owner = button(JAWS.find((each) => each.id === id)!.name[language].toLocaleUpperCase(language));
        fireEvent.click(jaw); fireEvent.click(owner);
        const saved = localWhoseJawProgress(() => app.storage, JAWS.map(({ id }) => id)).load()!;
        expect(saved.earned).toEqual(ids);
        act(() => { fireEvent.click(jaw); fireEvent.click(owner); fireEvent.click(owner); });
        expect(app.parts.played.filter((sound) => sound === "snap")).toHaveLength(at + 1);
        act(() => app.timers.fire(JAW_TIMING.right));
        fireEvent.click(button(text.next));
      }
      act(() => app.timers.fire(JAW_TIMING.done));
      expect(new Set(ids).size).toBe(5);
      expect(screen.getByRole("img", { name: text.stars(3, 3) })).toBeDefined();
      expect(document.querySelectorAll(".jaw-result-jaws li")).toHaveLength(5);
      for (const size of ["tall-narrow", "tall"] as const) {
        act(() => app.viewport.resize(size, false));
        act(() => app.timers.settle());
        expect(document.querySelector(".gated-screen")!.hasAttribute("inert")).toBe(false);
        expect(button(text.playAgain)).toBeDefined();
        expect(button(text.jawShelf)).toBeDefined();
        expect(button(text.home)).toBeDefined();
      }
      fireEvent.click(button(text.jawShelf));
      const collected = JAWS.find(({ id }) => id === ids[0])!;
      const name = collected.name[language].toLocaleUpperCase(language);
      fireEvent.click(button(name));
      const card = screen.getByRole("dialog", { name });
      expect(card.textContent).toContain(collected.fact[language].toLocaleUpperCase(language));
      expect(app.parts.spoken.at(-1)).toEqual({ words: `${collected.name[language]}. ${collected.fact[language]}`, language });
      const stopped = { ...app.parts.stopped };
      fireEvent.click(within(card).getByRole("button"));
      act(() => app.timers.settle());
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(app.parts.stopped).toEqual({ voice: stopped.voice + 1, sound: stopped.sound + 1 });
      expect(document.activeElement).toBe(button(name));
      fireEvent.click(button(text.home));
      app.unmount();
      app = openWhoseJawApp({ language, storage: app.storage });
      fireEvent.click(homeTile(text.whoseJaw));
      expect(button(text.ageLevels[level].name).getAttribute("aria-pressed")).toBe("true");
      expect(screen.getByLabelText(text.bestScore).textContent).toBe("🦷 3");
      expect(screen.getByLabelText(text.jawCollection).textContent).toContain("5 / 16");
      fireEvent.click(button(text.play));
      act(() => app.timers.fire(JAW_TIMING.entering));
      expect(document.querySelectorAll(".jaw-socket[data-filled]")).toHaveLength(0);
      expect(document.querySelector(".whose-jaw-board")!.getAttribute("data-phase")).toBe("waiting");
    }
  );
});
