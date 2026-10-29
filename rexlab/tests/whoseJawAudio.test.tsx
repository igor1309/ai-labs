import { act, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, onTestFinished } from "vitest";
import { TEXTS } from "../src/language/texts.ts";
import { JAW_AUDIO_KEY } from "../src/localJawAudio.ts";
import { THEME_KEY } from "../src/localTheme.ts";
import { openWindow, styleAt } from "./windowSizes.ts";
import { PROGRESS_KEY } from "../src/localProgress.ts";
import { JAW_TIMING } from "../src/whoseJawGame.tsx";
import { contrast, homeTile, memoryStorage } from "./support.ts";
import { JAWS } from "./whoseJaw.ts";
import { openWhoseJawApp } from "./whoseJawApp.tsx";
import { filterTaps, tapAt } from "./taps.ts";

type Language = "en" | "ru";
const button = (name: string) => screen.getByRole<HTMLButtonElement>("button", { name });
const mute = (language: Language) => button(TEXTS[language].gameAudio.mute);
const owner = () => JAWS.find(({ id }) => document.querySelector(".jaw-loose-picture")!.getAttribute("src") === `jaw-${id}.webp`)!;
const place = (language: Language) => {
  const name = owner().name[language].toLocaleUpperCase(language);
  fireEvent.click(button(TEXTS[language].jawPick)); fireEvent.click(button(name));
};
const expectMuted = (language: Language, muted: boolean) => {
  expect(mute(language).getAttribute("aria-pressed")).toBe(String(muted));
  expect(mute(language).textContent).toBe(muted ? TEXTS[language].gameAudio.off : TEXTS[language].gameAudio.on);
  expect(mute(language).querySelector("svg")).not.toBeNull();
};
function animationsEndImmediately() {
  const before = Object.getOwnPropertyDescriptor(Element.prototype, "getAnimations");
  Object.defineProperty(Element.prototype, "getAnimations", { configurable: true, value: () => [] });
  onTestFinished(() => { if (before) Object.defineProperty(Element.prototype, "getAnimations", before); else Reflect.deleteProperty(Element.prototype, "getAnimations"); });
}

// Integrates the rendered control, game audio wrappers, reaction timers and local storage.
describe("Whose Jaw audio control", () => {
  it.each((["en", "ru"] as const).flatMap((language) => [false, true].map((reduced) => ({ language, reduced }))))
    ("stops active $language audio without restarting a reaction (reduced: $reduced)", ({ language, reduced }) => {
      const app = openWhoseJawApp({ language, reduced, setting: { level: "paleontologist", revision: "parent" } });
      fireEvent.click(homeTile(TEXTS[language].whoseJaw)); expectMuted(language, false);
      fireEvent.click(button(TEXTS[language].play));
      act(() => app.timers.fire(reduced ? JAW_TIMING.reduced : JAW_TIMING.entering));
      const first = owner(); place(language);
      expect(app.parts.played).toEqual(["snap"]);
      expect(app.parts.spoken).toEqual([{ words: first.fact[language], language }]);
      const stopped = { ...app.parts.stopped };
      const pending = app.timers.timers();
      fireEvent.click(mute(language)); expectMuted(language, true);
      expect(app.parts.stopped).toEqual({ sound: stopped.sound + 1, voice: stopped.voice + 1 });
      expect(app.timers.timers()).toEqual(pending);
      expect(app.storage.items.get(JAW_AUDIO_KEY)).toBe("true");
      // Enable before queued bites/steps: the old reaction must remain silent.
      fireEvent.click(mute(language)); expectMuted(language, false);
      expect(app.timers.timers()).toEqual(pending);
      act(() => app.timers.advance(850));
      expect(app.parts.played).toEqual(["snap"]);
      expect(app.parts.spoken).toEqual([{ words: first.fact[language], language }]);
      if (!reduced) act(() => app.timers.advance(500));
      expect(document.querySelector(".whose-jaw-board")!.getAttribute("data-phase")).toBe("reading");
      fireEvent.click(mute(language)); fireEvent.click(button(TEXTS[language].next));
      act(() => app.timers.fire(reduced ? JAW_TIMING.reduced : JAW_TIMING.entering));
      // A new direct name request and a whole correct reaction are suppressed too.
      fireEvent.click(button(owner().name[language].toLocaleUpperCase(language)));
      place(language); act(() => app.timers.advance(2000));
      expect(app.parts.played).toEqual(["snap"]);
      expect(app.parts.spoken).toEqual([{ words: first.fact[language], language }]);
      fireEvent.click(mute(language)); expect(app.parts.spoken).toHaveLength(1);
      fireEvent.click(button(TEXTS[language].next));
      act(() => app.timers.fire(reduced ? JAW_TIMING.reduced : JAW_TIMING.entering));
      const third = owner(); place(language);
      expect(app.parts.played).toEqual(["snap", "snap"]);
      expect(app.parts.spoken.at(-1)).toEqual({ words: third.fact[language], language });
    });

  it.each(["en", "ru"] as const)("shares %s mute across welcome, board, result, shelf, card and reload", async (language) => {
    animationsEndImmediately();
    const text = TEXTS[language];
    let app = openWhoseJawApp({ language });
    fireEvent.click(homeTile(text.whoseJaw));
    const user = userEvent.setup({ delay: null });
    mute(language).focus(); await user.keyboard("{Enter}"); expectMuted(language, true);
    fireEvent.click(button(text.play));
    for (let at = 0; at < 5; at++) {
      expectMuted(language, true);
      act(() => app.timers.fire(JAW_TIMING.entering)); place(language);
      act(() => app.timers.advance(JAW_TIMING.right)); fireEvent.click(button(text.next));
    }
    act(() => app.timers.fire(JAW_TIMING.done));
    expect(screen.getByRole("img", { name: text.stars(3, 3) })).toBeDefined(); expectMuted(language, true);
    fireEvent.click(button(text.jawShelf)); expectMuted(language, true);
    fireEvent.click(button(JAWS[0]!.name[language].toLocaleUpperCase(language)));
    const card = screen.getByRole("dialog"); expectMuted(language, true);
    expect(app.parts.played).toEqual([]); expect(app.parts.spoken).toEqual([]);
    const close = within(card).getByRole("button", { name: text.back });
    expect(document.activeElement).toBe(close);
    await user.tab(); expect(document.activeElement).toBe(mute(language));
    await user.keyboard(" "); expectMuted(language, false);
    expect(app.parts.played).toEqual([]); expect(app.parts.spoken).toEqual([]);
    await user.tab(); expect(document.activeElement).toBe(close);
    await user.tab({ shift: true }); expect(document.activeElement).toBe(mute(language));
    fireEvent.click(close); act(() => app.timers.fire(0));
    fireEvent.click(button(JAWS[0]!.name[language].toLocaleUpperCase(language)));
    expect(app.parts.played).toEqual(["chomp"]);
    expect(app.parts.spoken).toEqual([{ words: `${JAWS[0]!.name[language]}. ${JAWS[0]!.fact[language]}`, language }]);
    const stopped = { ...app.parts.stopped };
    fireEvent.click(mute(language));
    expect(app.parts.stopped).toEqual({ sound: stopped.sound + 1, voice: stopped.voice + 1 }); expectMuted(language, true);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: text.back }));
    act(() => app.timers.fire(0));
    fireEvent.click(button(text.home)); fireEvent.click(homeTile(text.whoseJaw)); expectMuted(language, true);
    app.unmount(); app = openWhoseJawApp({ language, storage: app.storage });
    fireEvent.click(homeTile(text.whoseJaw)); expectMuted(language, true); fireEvent.click(mute(language));
    app.unmount(); app = openWhoseJawApp({ language, storage: app.storage });
    fireEvent.click(homeTile(text.whoseJaw)); expectMuted(language, false);
  });

  it("remains operable when storage cannot be read or saved and filters a second touch", () => {
    const app = openWhoseJawApp({ storage: memoryStorage({}, { read: false, save: false }) });
    fireEvent.click(homeTile(TEXTS.en.whoseJaw)); filterTaps();
    tapAt(mute("en"), 1000, { x: 300, y: 40 }); tapAt(mute("en"), 1100, { x: 300, y: 40 });
    expectMuted("en", true); fireEvent.click(button(TEXTS.en.play)); expectMuted("en", true);
    fireEvent.click(mute("en")); expectMuted("en", false);
    act(() => app.timers.fire(JAW_TIMING.entering)); place("en"); expect(app.parts.played).toEqual(["snap"]);
  });

  it.each(([[390, 844, "tall-narrow"], [1180, 820, "wide"]] as const).flatMap(([width, height, layout]) =>
    (["en", "ru"] as const).flatMap((language) => (["light", "dark"] as const).map((theme) => ({ width, height, layout, language, theme })))
  ))("fits $language welcome and card controls at $width × $height in $theme", ({ width, height, layout, language, theme }) => {
    openWindow(width, height);
    const app = openWhoseJawApp({ language, storage: memoryStorage({
      [THEME_KEY]: theme, [JAW_AUDIO_KEY]: "true",
      [PROGRESS_KEY]: JSON.stringify({ schemaVersion: 1, games: { "whose-jaw": { earned: [JAWS[0]!.id] } } })
    }) });
    fireEvent.click(homeTile(TEXTS[language].whoseJaw));
    act(() => app.viewport.resize(layout, false));
    act(() => app.timers.settle());
    const size = [width, height] as const;
    const style = (element: Element) => styleAt(element, size);
    // jsdom has no layout: allow a full em for every letter, plus icons, padding and gaps.
    const buttonWidth = (element: HTMLButtonElement) => {
      const at = style(element);
      const words = element.querySelector("span")!;
      const wordsWidth = style(words).value("display") === "none" ? 0 : words.textContent!.length * at.px("font-size") + at.columnGap();
      return Math.max(at.px("width"), at.px("min-width"), wordsWidth + 24 + at.px("padding-left") + at.px("padding-right"));
    };
    const home = button(TEXTS[language].home);
    const header = style(home.parentElement!);
    const page = style(document.querySelector(".whose-jaw-welcome")!);
    expect(buttonWidth(home) + buttonWidth(mute(language)) + header.columnGap()).toBeLessThanOrEqual(width - page.px("padding-left") - page.px("padding-right"));
    fireEvent.click(button(TEXTS[language].jawShelf));
    expect(style(document.querySelector(".jaw-shelf-status")!).value("flex-wrap")).toBe("wrap");
    fireEvent.click(button(JAWS[0]!.name[language].toLocaleUpperCase(language)));
    const card = screen.getByRole("dialog");
    const controls = style(card.querySelector(".jaw-card-controls")!);
    const close = within(card).getByRole<HTMLButtonElement>("button", { name: TEXTS[language].back });
    const cardStyle = style(card);
    const available = Math.min(640, width - 48) - cardStyle.px("padding-left") - cardStyle.px("padding-right");
    expect(controls.value("display")).toBe("flex");
    expect(buttonWidth(close) + buttonWidth(mute(language)) + controls.columnGap()).toBeLessThanOrEqual(available);
    const audio = getComputedStyle(mute(language));
    expect(contrast(audio.color, audio.backgroundColor)).toBeGreaterThanOrEqual(4.5);
    expect(style(mute(language)).px("min-height")).toBeGreaterThanOrEqual(48);
    expectMuted(language, true);
  });

  it("keeps mute reachable inside a level offer's focus loop", async () => {
    animationsEndImmediately();
    const storage = memoryStorage({ [PROGRESS_KEY]: JSON.stringify({ schemaVersion: 1, games: { "whose-jaw": { offer: { level: "explorer", strong: 2, declined: [] } } } }) });
    const app = openWhoseJawApp({ storage });
    fireEvent.click(homeTile(TEXTS.en.whoseJaw)); fireEvent.click(button(TEXTS.en.play));
    for (let at = 0; at < 5; at++) {
      act(() => app.timers.fire(JAW_TIMING.entering)); place("en");
      act(() => app.timers.fire(JAW_TIMING.right)); fireEvent.click(button(TEXTS.en.next));
    }
    act(() => app.timers.fire(JAW_TIMING.done));
    act(() => app.timers.fire(0));
    const dialog = screen.getByRole("dialog");
    expect(document.activeElement).toBe(button(TEXTS.en.levelOffer.yes));
    expect(within(dialog).getByRole("button", { name: TEXTS.en.gameAudio.mute })).toBe(mute("en"));
    fireEvent.click(mute("en")); expectMuted("en", true);
    const user = userEvent.setup({ delay: null }); mute("en").focus();
    await user.tab({ shift: true }); expect(document.activeElement).toBe(button(TEXTS.en.levelOffer.notNow));
    await user.tab(); expect(document.activeElement).toBe(mute("en"));
  });
});
