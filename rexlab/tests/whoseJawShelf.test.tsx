import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { AGE_LEVELS } from "../src/ageLevel.ts";
import { TEXTS } from "../src/language/texts.ts";
import { localWhoseJawProgress, PROGRESS_KEY } from "../src/localProgress.ts";
import { OrientationGate } from "../src/OrientationGate.tsx";
import { WhoseJawShelfScreen } from "../src/WhoseJawShelfScreen.tsx";
import { JAW_TIMING } from "../src/whoseJawGame.tsx";
import { withManualPictures, withPictures } from "./pictures.tsx";
import { contrast, homeTile, manualPictures, manualTimers, memoryStorage } from "./support.ts";
import { JAWS, jawGameParts } from "./whoseJaw.ts";
import { openWhoseJawApp } from "./whoseJawApp.tsx";

const button = (name: string) => screen.getByRole<HTMLButtonElement>("button", { name });
const scrim = () => document.querySelector<HTMLElement>(".jaw-card-scrim")!;
const place = (id: string, language: "en" | "ru" = "en") => button(JAWS.find((jaw) => jaw.id === id)!.name[language].toLocaleUpperCase(language));
const record = (earned: string[]) => memoryStorage({ [PROGRESS_KEY]: JSON.stringify({ schemaVersion: 1, games: { "whose-jaw": { earned } } }) });

function dismissalAnimation() {
  // The browser reports a 160ms fade; the manual timer decides when it ends.
  const before = Object.getOwnPropertyDescriptor(Element.prototype, "getAnimations");
  Object.defineProperty(Element.prototype, "getAnimations", { configurable: true, value: () => [{ currentTime: 0, effect: { getComputedTiming: () => ({ endTime: 160 }) } }] });
  onTestFinished(() => { if (before) Object.defineProperty(Element.prototype, "getAnimations", before); else Reflect.deleteProperty(Element.prototype, "getAnimations"); });
}
function shelf(language: "en" | "ru" = "en", earned = JAWS.map(({ id }) => id)) {
  dismissalAnimation();
  const parts = jawGameParts();
  const play = vi.spyOn(parts.sounds, "play");
  const timers = manualTimers();
  const onBack = vi.fn();
  const onHome = vi.fn();
  const props = { ...parts, language, earned, startTimer: timers.startTimer, onBack, onHome };
  const view = render(<WhoseJawShelfScreen {...props} />, withPictures);
  return { ...view, ...parts, play, timers, props, onBack, onHome };
}
const dismiss = (app: { timers: ReturnType<typeof manualTimers> }) => act(() => app.timers.fire(160));

describe("Whose Jaw museum shelf", () => {
  it.each(["en", "ru"] as const)("keeps narrow %s navigation accessible and reserves three lines for long names", (language) => {
    document.documentElement.dataset.size = "tall-narrow";
    onTestFinished(() => { delete document.documentElement.dataset.size; });
    shelf(language);
    const bar = document.querySelector(".jaw-shelf-bar")!;
    expect(getComputedStyle(bar).gridTemplateColumns).toBe("56px minmax(0, 1fr) 56px");
    for (const name of [TEXTS[language].back, TEXTS[language].home]) {
      const action = button(name);
      expect(getComputedStyle(action).width).toBe("56px");
      expect(getComputedStyle(action).fontSize).toBe("0px");
      expect(action.querySelector("svg")).not.toBeNull();
    }
    for (const name of document.querySelectorAll(".jaw-shelf-name")) {
      const style = getComputedStyle(name);
      expect(Number.parseFloat(style.height) / Number.parseFloat(style.lineHeight)).toBeGreaterThanOrEqual(3);
      expect(style.overflowWrap).toBe("anywhere");
    }
    expect(document.querySelectorAll(".jaw-shelf-place")).toHaveLength(16);
  });

  it.each(["jaw", "gummy"] as const)("waits for the other picture when %s settles first and cancels media on dismissal", (first) => {
    dismissalAnimation();
    const pictures = manualPictures();
    const parts = jawGameParts();
    const id = JAWS[0]!.id;
    render(<WhoseJawShelfScreen {...parts} language="en" earned={[id]} startTimer={pictures.startTimer} onBack={() => {}} onHome={() => {}} />, withManualPictures(pictures));
    fireEvent.click(place(id));
    const close = within(screen.getByRole("dialog")).getByRole("button");
    expect(document.activeElement).toBe(close);
    act(() => pictures.finish(`${first}-${id}.webp`));
    expect(parts.spoken).toEqual([]);
    expect(parts.played).toEqual([]);
    fireEvent.click(close);
    act(() => pictures.finish(`${first === "jaw" ? "gummy" : "jaw"}-${id}.webp`));
    expect(parts.spoken).toEqual([]);
    expect(parts.played).toEqual([]);
    expect(document.querySelector(".jaw-card-chomp[data-ready]")).toBeNull();
    act(() => pictures.fire(160));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(place(id));
    expect(parts.played).toEqual(["chomp"]);
    expect(parts.spoken).toEqual([{ words: `${JAWS[0]!.name.en}. ${JAWS[0]!.fact.en}`, language: "en" }]);
    const animation = getComputedStyle(document.querySelector(".jaw-card-chomp")!).animation;
    expect(animation).toBe("jaw-chomp var(--motion-alive) var(--ease-out) 2");
  });

  it.each(["en", "ru"] as const)("shows sixteen places in four diet-labelled wooden rows in %s, with only collected jaws available", (language) => {
    const earned = [JAWS[0]!.id, JAWS.find(({ diet }) => diet === "plants")!.id];
    const app = shelf(language, earned);
    const rows = document.querySelectorAll(".jaw-shelf-row");
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row.querySelectorAll(".jaw-shelf-place")).toHaveLength(4);
      expect(row.querySelector(".jaw-shelf-labels")!.textContent).toMatch(/🥩|🌿/u);
    }
    expect(screen.getByLabelText(TEXTS[language].jawCollection).textContent).toBe("🦷 2 / 16");
    const places = Array.from(document.querySelectorAll<HTMLButtonElement>(".jaw-shelf-place"));
    expect(places.filter((each) => !each.disabled).map((each) => each.getAttribute("aria-label")).sort()).toEqual(earned.map((id) => JAWS.find((jaw) => jaw.id === id)!.name[language].toLocaleUpperCase(language)).sort());
    for (const locked of places.filter((each) => each.disabled)) {
      expect(locked.textContent).toBe("?");
      expect(locked.querySelector(".jaw-shelf-silhouette")).not.toBeNull();
      fireEvent.click(locked);
    }
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(button(TEXTS[language].back)); fireEvent.click(button(TEXTS[language].home));
    expect([app.onBack.mock.calls.length, app.onHome.mock.calls.length, app.play.mock.calls.length]).toEqual([1, 1, 0]);
  });

  it.each(["en", "ru"] as const)("opens every collected animal's localized card, speaks its name and fact and plays two bites at a distinct pitch in %s", (language) => {
    const app = shelf(language);
    for (const jaw of JAWS) {
      const opener = place(jaw.id, language);
      fireEvent.click(opener);
      const name = jaw.name[language].toLocaleUpperCase(language);
      const card = screen.getByRole("dialog", { name });
      expect(within(card).getByRole("img", { name }).getAttribute("src")).toBe(`gummy-${jaw.id}.webp`);
      expect(card.textContent).toContain(jaw.fact[language].toLocaleUpperCase(language));
      expect(card.textContent).toContain(TEXTS[language].jawFoods[jaw.diet]);
      expect(card.textContent).toContain(jaw.diet === "meat" ? "🥩" : "🌿");
      expect(app.spoken.at(-1)).toEqual({ words: `${jaw.name[language]}. ${jaw.fact[language]}`, language });
      const close = within(card).getByRole("button");
      expect(document.activeElement).toBe(close);
      fireEvent.click(card);
      expect(scrim().hasAttribute("data-leaving")).toBe(false);
      fireEvent.click(scrim());
      expect(close.getAttribute("aria-disabled")).toBe("true");
      expect(document.querySelector(".whose-jaw-shelf-screen > div")!.hasAttribute("inert")).toBe(true);
      dismiss(app);
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(document.activeElement).toBe(opener);
    }
    expect(app.play.mock.calls.map(([sound]) => sound)).toEqual(JAWS.map(() => "chomp"));
    expect(new Set(app.play.mock.calls.map((call) => call[1])).size).toBe(16);
    expect(app.stopped).toEqual({ sound: 16, voice: 16 });
  });

  it.each(["light", "dark"] as const)("keeps shelf and card words readable in the %s theme", (theme) => {
    const app = shelf();
    app.rerender(<div data-theme={theme}><WhoseJawShelfScreen {...app.props} /></div>);
    const page = document.querySelector(".whose-jaw-shelf-screen")!;
    const style = getComputedStyle(page);
    expect(contrast(style.color, style.backgroundColor)).toBeGreaterThanOrEqual(4.5);
    expect(style.backgroundColor).toBe(theme === "dark" ? "rgb(15, 19, 32)" : "rgb(242, 239, 232)");
    fireEvent.click(place(JAWS[0]!.id));
    const card = getComputedStyle(screen.getByRole("dialog"));
    expect(contrast(card.color, card.backgroundColor)).toBeGreaterThanOrEqual(4.5);
  });

  it("supports keyboard opening, traps focus, and dismisses with Escape or BACK", async () => {
    const app = shelf();
    const user = userEvent.setup({ delay: null });
    place(JAWS[0]!.id).focus();
    await user.keyboard("{Enter}");
    const close = within(screen.getByRole("dialog")).getByRole("button");
    await user.tab(); expect(document.activeElement).toBe(close);
    await user.tab({ shift: true }); expect(document.activeElement).toBe(close);
    await user.keyboard("{Escape}"); dismiss(app);
    expect(document.activeElement).toBe(place(JAWS[0]!.id));
    await user.keyboard(" ");
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button")); dismiss(app);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it.each(["loading", "failed"] as const)("keeps %s pictures usable and waits for both pictures before media", (state) => {
    const pictures = manualPictures();
    const parts = jawGameParts();
    const view = render(<WhoseJawShelfScreen {...parts} language="en" earned={[JAWS[0]!.id]} startTimer={pictures.startTimer} onBack={() => {}} onHome={() => {}} />, withManualPictures(pictures));
    fireEvent.click(place(JAWS[0]!.id));
    if (state === "failed") act(() => { pictures.fail(`jaw-${JAWS[0]!.id}.webp`); pictures.fail(`gummy-${JAWS[0]!.id}.webp`); });
    const card = screen.getByRole("dialog");
    expect(card.querySelectorAll(`[data-picture="${state}"]`)).toHaveLength(2);
    expect(card.querySelector(".jaw-card-chomp")!.hasAttribute("data-ready")).toBe(false);
    if (state === "loading") {
      act(() => pictures.finish(`jaw-${JAWS[0]!.id}.webp`));
      expect(card.querySelector(".jaw-card-chomp")!.hasAttribute("data-ready")).toBe(false);
      expect(parts.spoken).toEqual([]);
      expect(parts.played).toEqual([]);
      expect(card.querySelector(".jaw-card-dinosaur")!.getAttribute("data-picture")).toBe("loading");
    }
    if (state === "loading") act(() => pictures.finish(`gummy-${JAWS[0]!.id}.webp`));
    expect(card.querySelector(".jaw-card-chomp")!.hasAttribute("data-ready")).toBe(state === "loading");
    expect(parts.spoken).toEqual([{ words: `${JAWS[0]!.name.en}. ${JAWS[0]!.fact.en}`, language: "en" }]);
    expect(parts.played).toEqual(["chomp"]);
    expect(within(card).getByRole("button")).toBeDefined();
    view.unmount();
    expect(parts.stopped).toEqual({ sound: 1, voice: 1 });
  });

  it("stops media and dismissal waits behind the turn gate and ignores cancelled callbacks after exit", () => {
    const app = shelf();
    fireEvent.click(place(JAWS[0]!.id));
    const show = (shown: boolean) => <OrientationGate shown={shown} screenUpright={true} language="en"><WhoseJawShelfScreen {...app.props} /></OrientationGate>;
    // Start a visit under the gate provider so changing its value preserves the card.
    app.rerender(show(false));
    fireEvent.click(place(JAWS[0]!.id));
    const before = { ...app.stopped };
    app.rerender(show(true));
    expect(app.stopped).toEqual({ sound: before.sound + 1, voice: before.voice + 1 });
    app.rerender(show(false));
    fireEvent.click(scrim());
    expect(app.timers.timers()).toContain(160);
    app.rerender(show(true));
    expect(app.timers.timers()).not.toContain(160);
    act(() => app.timers.deliverStopped(160));
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    app.rerender(show(false));
    expect(app.timers.timers()).toContain(160);
    app.unmount();
    expect(app.timers.timers()).not.toContain(160);
    render(<WhoseJawShelfScreen {...app.props} />, withPictures);
    fireEvent.click(place(JAWS[1]!.id));
    act(() => app.timers.deliverStopped(160));
    expect(screen.getByRole("dialog", { name: JAWS[1]!.name.en.toUpperCase() })).toBeDefined();
  });
});

describe("shelf navigation and collection storage", () => {
  it.each(["en", "ru"] as const)("opens from welcome and the home museum in %s without starting a game or changing progress", (language) => {
    const app = openWhoseJawApp({ language, storage: record([JAWS[0]!.id]) });
    fireEvent.click(homeTile(TEXTS[language].whoseJaw)); fireEvent.click(button(TEXTS[language].jawShelf));
    expect(document.querySelectorAll(".jaw-shelf-place")).toHaveLength(16);
    fireEvent.click(button(TEXTS[language].home)); fireEvent.click(button(TEXTS[language].museum));
    expect(screen.getByRole("group", { name: TEXTS[language].stands })).toBeDefined();
    fireEvent.click(button(TEXTS[language].jawShelf));
    expect(place(JAWS[0]!.id, language).disabled).toBe(false);
    expect(app.featured.history().timesStarted.get("whoseJaw")).toBeUndefined();
    expect(localWhoseJawProgress(() => app.storage, JAWS.map(({ id }) => id)).load()!.earned).toEqual([JAWS[0]!.id]);
  });

  it.each(AGE_LEVELS)("collects immediately at %s, rejects wrong tries, reloads and never duplicates a jaw", (level) => {
    let app = openWhoseJawApp({ setting: { level, revision: null } });
    const putFirst = (wrong: boolean) => {
      fireEvent.click(homeTile(TEXTS.en.whoseJaw)); fireEvent.click(button(TEXTS.en.play));
      act(() => app.timers.fire(JAW_TIMING.entering));
      if (wrong) {
        fireEvent.click(button(TEXTS.en.jawPick));
        const choices = within(screen.getByRole("group", { name: TEXTS.en.creatures })).getAllByRole("button");
        fireEvent.click(choices.find((choice) => choice.getAttribute("aria-label") !== JAWS[0]!.name.en.toUpperCase())!);
        expect(localWhoseJawProgress(() => app.storage, JAWS.map(({ id }) => id)).load()?.earned ?? []).toEqual([]);
        act(() => app.timers.fire(JAW_TIMING.wrong));
      }
      fireEvent.click(button(TEXTS.en.jawPick)); fireEvent.click(button(JAWS[0]!.name.en.toUpperCase()));
      fireEvent.click(button(TEXTS.en.home)); fireEvent.click(button(TEXTS.en.museum)); fireEvent.click(button(TEXTS.en.jawShelf));
      expect(place(JAWS[0]!.id).disabled).toBe(false);
      expect(screen.getByLabelText(TEXTS.en.jawCollection).textContent).toBe("🦷 1 / 16");
    };
    putFirst(true);
    app.unmount();
    app = openWhoseJawApp({ storage: app.storage, setting: { level: "paleontologist", revision: null } });
    putFirst(false);
    expect(localWhoseJawProgress(() => app.storage, JAWS.map(({ id }) => id)).load()!.earned).toEqual([JAWS[0]!.id]);
  });
});
