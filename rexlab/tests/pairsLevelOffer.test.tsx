import type { Theme } from "../src/theme.ts";
import { THEMES } from "../src/theme.ts";
import { StrictMode } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AGE_LEVEL_PICTURES } from "../src/ageLevelPictures.ts";
import { LANGUAGES, type Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { PairsResultScreen, type PairsResultScreenProps } from "../src/PairsResultScreen.tsx";
import { afterResultAnimations } from "../src/resultAnimation.ts";
import { contrast, manualTimers, surfaceOf, symbolOf } from "./support.ts";
import { filterTaps, tapAt } from "./taps.ts";
import { WINDOW_SIZES, openWindow } from "./windowSizes.ts";

// jsdom has no animation engine. The browser boundary reports each
// reward's running duration; the screen's timer is driven by the test.
let animationEnds: Record<string, number>;
beforeEach(() => {
  animationEnds = { "pairs-result-star": 560, celebration: 320, "pairs-level-up": 320, "pairs-offer-scrim": 160 };
  Object.defineProperty(Element.prototype, "getAnimations", { configurable: true, value: function (this: Element) {
    const end = Object.entries(animationEnds).find(([name]) => this.classList.contains(name))?.[1];
    if (end === undefined) throw new Error(`Unexpected animation target: ${this.className}`);
    return [{ currentTime: 0, effect: { getComputedTiming: () => ({ endTime: end }) } }];
  } });
});
afterEach(() => { Reflect.deleteProperty(Element.prototype, "getAnimations"); });

function open({ language = "en", theme = "light", level = "explorer", celebration = "new-best", levelUp = null, strict = false }: {
  language?: Language; theme?: Theme; level?: "explorer" | "paleontologist";
  celebration?: PairsResultScreenProps["celebration"]; levelUp?: PairsResultScreenProps["levelUp"]; strict?: boolean;
} = {}) {
  const clock = manualTimers();
  const offer = { level, onShown: vi.fn(), onYes: vi.fn(), onNotNow: vi.fn(), startTimer: clock.startTimer };
  const props: PairsResultScreenProps = { language, pals: [], tries: 12, stars: 3, best: 12, beaten: 16, celebration, levelUp, offer, onBack: vi.fn(), onHome: vi.fn(), onPlayAgain: vi.fn() };
  const content = (offerProp: NonNullable<PairsResultScreenProps["offer"]> | null) => <div data-theme={theme}><PairsResultScreen {...props} offer={offerProp} /></div>;
  const wrap = (offerProp: NonNullable<PairsResultScreenProps["offer"]> | null) => strict ? <StrictMode>{content(offerProp)}</StrictMode> : content(offerProp);
  const view = render(wrap(offer));
  const show = () => act(() => clock.fire(Math.max(560, ...(celebration ? [animationEnds.celebration ?? 0] : []), ...(levelUp ? [animationEnds["pairs-level-up"] ?? 0] : []))));
  return { ...view, clock, offer, props, show, clearOffer: () => view.rerender(wrap(null)) };
}

it.each([
  [null, null, "pairs-result-star"],
  ["first-best", null, "celebration"],
  ["new-best", { level: 2, rows: 2, columns: 3 }, "pairs-level-up"]
] as const)("waits for every reward, including %s and %j", (celebration, levelUp, longest) => {
  animationEnds[longest] = 900;
  const app = open({ celebration, levelUp });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(app.offer.onShown).not.toHaveBeenCalled();
  expect(app.clock.timers()).toEqual([900]);
  act(() => app.clock.fire(560));
  expect(screen.queryByRole("dialog")).toBeNull();
  act(() => app.clock.fire(900));
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(app.offer.onShown).toHaveBeenCalledTimes(1);
});

it("reports shown once through StrictMode and rerenders", () => {
  const app = open({ strict: true });
  app.show();
  app.clearOffer();
  expect(app.offer.onShown).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("dialog")).toBeTruthy();
});

it.each(["HOME", "BACK", "PLAY AGAIN", "reload"])("can leave by %s before showing without reporting shown or answering", (leave) => {
  const app = open();
  if (leave !== "reload") fireEvent.click(screen.getByRole("button", { name: leave }));
  expect([app.props.onHome, app.props.onBack, app.props.onPlayAgain].map((callback) => vi.mocked(callback).mock.calls.length)).toEqual(
    ["HOME", "BACK", "PLAY AGAIN"].map((name) => (leave === name ? 1 : 0))
  );
  app.unmount();
  expect(app.clock.timers()).toEqual([]);
  act(() => app.clock.deliverStopped(560));
  expect(app.offer.onShown).not.toHaveBeenCalled();
  expect(app.offer.onYes).not.toHaveBeenCalled();
  expect(app.offer.onNotNow).not.toHaveBeenCalled();
});

it("schedules nothing with no offer", () => {
  const app = open();
  app.clearOffer();
  expect(app.clock.timers()).toEqual([]);
  act(() => app.clock.deliverStopped(560));
  expect(screen.queryByRole("dialog")).toBeNull();
});

it.each(["YES", "NOT NOW"])("answers %s once, blocks the result through dismissal and filters a tap after the fade", (answer) => {
  const app = open();
  app.show();
  const again = screen.getByRole("button", { name: "PLAY AGAIN" });
  const home = screen.getByRole("button", { name: "HOME" });
  const back = screen.getByRole("button", { name: "BACK" });
  expect(screen.getByRole("main").hasAttribute("inert")).toBe(true);
  fireEvent.click(again);
  fireEvent.click(back);
  fireEvent.click(home);
  expect(app.props.onPlayAgain).not.toHaveBeenCalled();
  expect(app.props.onBack).not.toHaveBeenCalled();
  expect(app.props.onHome).not.toHaveBeenCalled();
  const choice = screen.getByRole("button", { name: answer });
  filterTaps();
  tapAt(choice, 0);
  fireEvent.click(choice);
  expect([app.offer.onYes.mock.calls.length, app.offer.onNotNow.mock.calls.length]).toEqual(answer === "YES" ? [1, 0] : [0, 1]);
  app.clearOffer();
  expect(document.querySelector(".pairs-offer-scrim[data-leaving]")).toBeTruthy();
  fireEvent.click(again);
  expect(app.props.onPlayAgain).not.toHaveBeenCalled();
  act(() => app.clock.fire(160));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("main").hasAttribute("inert")).toBe(false);
  expect(document.activeElement).toBe(again);
  tapAt(again, 250);
  expect(app.props.onPlayAgain).not.toHaveBeenCalled();
  tapAt(again, 850);
  tapAt(home, 1500);
  expect(app.props.onPlayAgain).toHaveBeenCalledTimes(1);
  expect(app.props.onHome).toHaveBeenCalledTimes(1);
});

it("keeps keyboard focus on the two answers", () => {
  const app = open();
  app.show();
  const yes = screen.getByRole("button", { name: "YES" });
  const no = screen.getByRole("button", { name: "NOT NOW" });
  expect(document.activeElement).toBe(yes);
  fireEvent.keyDown(yes, { key: "Tab" });
  expect(document.activeElement).toBe(no);
  fireEvent.keyDown(no, { key: "Tab", shiftKey: true });
  expect(document.activeElement).toBe(yes);
});

it("uses the CSS engine's remaining time, including reduced motion, without a new wait", () => {
  const clock = manualTimers();
  const done = vi.fn();
  const elements = [
    { getAnimations: () => [{ currentTime: 40, effect: { getComputedTiming: () => ({ endTime: 160 }) } }] },
    { getAnimations: () => [{ currentTime: 100, effect: { getComputedTiming: () => ({ endTime: 160 }) } }] }
  ] as unknown as Element[];
  const stop = afterResultAnimations(elements, clock.startTimer, done);
  expect(clock.timers()).toEqual([120]);
  stop();
  clock.deliverStopped(120);
  expect(done).not.toHaveBeenCalled();
  afterResultAnimations(elements, clock.startTimer, done);
  clock.fire(120);
  expect(done).toHaveBeenCalledTimes(1);
});

it.each(LANGUAGES.flatMap((language) => (["explorer", "paleontologist"] as const).map((level) => [language, level] as const)))("offers %s %s with the menu's picture and name", (language, level) => {
  const app = open({ language, level });
  app.show();
  const text = TEXTS[language];
  const dialog = screen.getByRole("dialog", { name: text.levelOffer.question(text.ageLevels[level].name) });
  expect(dialog.querySelector(".pairs-offer-picture")?.textContent).toBe(AGE_LEVEL_PICTURES[level]);
  expect(within(dialog).getAllByRole("button").map(symbolOf)).toEqual(["x", "check"]);
});
