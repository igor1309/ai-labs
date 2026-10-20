import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DigRevealScreen, REVEAL_GLIDE, REVEAL_STAGGER, STAR_LANDS } from "../src/DigRevealScreen.tsx";
import { AGE_LEVELS } from "../src/ageLevel.ts";
import { TEXTS } from "../src/language/texts.ts";
import { withPictures } from "./pictures.tsx";
import { manualTimers } from "./support.ts";

const props = {
  language: "en" as const,
  name: "Pachycephalosaurus",
  picture: "/pictures/pachycephalosaurus.webp",
  dugUp: 42,
  total: 42,
  newStar: true,
  celebration: "new-best" as const,
  badge: true,
  level: "explorer" as const
};

describe("the dig reveal", () => {
  it.each([false, true])("holds every control until the last arrival, reduced motion %s", (reducedMotion) => {
    const timers = manualTimers();
    const onLanded = vi.fn();
    const timing = reducedMotion ? "reduced" : "motion";
    const callbacks = { onLevel: vi.fn(), onDigAgain: vi.fn(), onHome: vi.fn() };
    const landing = { startTimer: timers.startTimer, landingWait: STAR_LANDS[timing], onLanded, reducedMotion };
    const view = render(<DigRevealScreen {...props} {...callbacks} {...landing} landed={false} />, withPictures);
    const switcher = screen.getByRole("group", { name: TEXTS.en.ageLevelSwitch });

    expect(within(switcher).getAllByRole("button")).toHaveLength(AGE_LEVELS.length);
    expect(within(switcher).getAllByRole("button").every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
    expect((screen.getByRole("button", { name: TEXTS.en.digAgain }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: TEXTS.en.home }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(within(switcher).getByRole("button", { name: TEXTS.en.ageLevels.paleontologist.name }));
    fireEvent.click(screen.getByRole("button", { name: TEXTS.en.digAgain }));
    fireEvent.click(screen.getByRole("button", { name: TEXTS.en.home }));
    for (const callback of Object.values(callbacks)) expect(callback).not.toHaveBeenCalled();
    timers.fire(STAR_LANDS[timing] - 1);
    expect(onLanded).not.toHaveBeenCalled();

    timers.fire(STAR_LANDS[timing]);
    expect(onLanded).toHaveBeenCalledWith(true);
    view.rerender(<DigRevealScreen {...props} {...callbacks} {...landing} landed={true} />);
    fireEvent.click(within(screen.getByRole("group", { name: TEXTS.en.ageLevelSwitch })).getByRole("button", { name: TEXTS.en.ageLevels.paleontologist.name }));
    expect(callbacks.onLevel).toHaveBeenCalledWith("paleontologist");
    fireEvent.click(screen.getByRole("button", { name: TEXTS.en.digAgain }));
    fireEvent.click(screen.getByRole("button", { name: TEXTS.en.home }));
    expect(callbacks.onDigAgain).toHaveBeenCalledOnce();
    expect(callbacks.onHome).toHaveBeenCalledOnce();
  });

  it.each([false, true].flatMap((reducedMotion) => [true, false].flatMap((card) => [true, false].map((celebration) => ({ reducedMotion, card, celebration })))))
  ("arrives consecutively with the star in place, reduced motion $reducedMotion, card $card, celebration $celebration", ({ reducedMotion, card, celebration }) => {
    const timing = reducedMotion ? "reduced" : "motion";
    const timers = manualTimers();
    render(<DigRevealScreen {...props} dugUp={card ? 42 : undefined} celebration={celebration ? "new-best" : null}
      onLevel={() => {}} onDigAgain={() => {}} onHome={() => {}} landed={false} reducedMotion={reducedMotion}
      startTimer={timers.startTimer} landingWait={STAR_LANDS[timing]} onLanded={() => {}} />, withPictures);
    const main = screen.getByRole("main");
    expect(REVEAL_GLIDE).toEqual({ motion: 320, reduced: 160 });
    expect(main.style.getPropertyValue("--dig-reveal-duration")).toBe(`${REVEAL_GLIDE[timing]}ms`);
    expect(main.style.getPropertyValue("--dig-reveal-stagger")).toBe(`${REVEAL_STAGGER[timing]}ms`);
    const parts = [...main.querySelectorAll<HTMLElement>("[style*='--reveal-part']")];
    expect(parts.map((part) => part.className)).toEqual([
      "dig-reveal-name", ...(card ? ["dig-card"] : []), ...(celebration ? ["dig-reveal-celebration"] : []),
      "dig-reveal-level", "play-again-button", "home-button"
    ]);
    const delays = parts.map((part) => Number(part.style.getPropertyValue("--reveal-part")) * REVEAL_STAGGER[timing]);
    expect(delays.slice(1).map((delay, i) => delay - delays[i]!)).toEqual(Array(parts.length - 1).fill(reducedMotion ? 0 : 60));
    expect(delays.at(-1)! + REVEAL_GLIDE[timing]).toBe(STAR_LANDS[timing]);
    for (const part of parts) {
      const style = getComputedStyle(part);
      expect(style.animation).toBe("fade-in var(--dig-reveal-duration) var(--ease-out) calc(var(--reveal-part) * var(--dig-reveal-stagger)) both");
      expect(style.animationName).toBe(reducedMotion ? "none" : "rise-in");
    }
    const art = main.querySelector(".dig-reveal-art")!;
    expect(getComputedStyle(art).animation).toBe("fade-in var(--dig-reveal-duration) var(--ease-out) both");
    expect(getComputedStyle(art).animationName).toBe(reducedMotion ? "none" : "dig-reveal-glide");
    for (const selector of [".dig-card-star", ".dig-card-count", ".dig-card-new", ".celebration"]) {
      const item = main.querySelector(selector);
      if (item) expect(["", "none"]).toContain(getComputedStyle(item).animation);
    }
    if (card) expect(main.querySelector(".dig-card-new")?.textContent).toBe("NEW!");
  });
});
