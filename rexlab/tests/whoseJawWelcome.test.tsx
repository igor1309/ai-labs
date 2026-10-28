import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AGE_LEVELS } from "../src/ageLevel.ts";
import { TEXTS } from "../src/language/texts.ts";
import { PROGRESS_KEY } from "../src/localProgress.ts";
import { WhoseJawWelcomeScreen } from "../src/WhoseJawWelcomeScreen.tsx";
import { homeTile, memoryStorage, featuredCard, manualPictures } from "./support.ts";
import { withManualPictures } from "./pictures.tsx";
import { openWhoseJawApp } from "./whoseJawApp.tsx";

const button = (name: string) => screen.getByRole("button", { name });
const record = (entry: unknown, game = "compare") => JSON.stringify({ schemaVersion: 1, games: {
  "whose-jaw": entry, "home-featured": { starts: {}, featured: { day: "2026-10-28", game } }
} });
const choice = (name: string) => within(screen.getByRole("group", { name: TEXTS.en.ageLevelSwitch })).getByRole("button", { name });
const pressTwice = (target: Element) => act(() => { fireEvent.click(target); fireEvent.click(target); });

describe("Whose Jaw welcome", () => {
  it.each(["en", "ru"] as const)("opens in %s from a working home tile, with no invented best", (language) => {
    const text = TEXTS[language];
    const app = openWhoseJawApp({ language });
    fireEvent.click(homeTile(text.whoseJaw));
    expect(screen.getByRole("heading", { name: text.whoseJaw }).textContent).toContain("🦷");
    expect(document.querySelector(".whose-jaw-gummy")?.getAttribute("src")).toBe("gummy.webp");
    expect(document.querySelector(".whose-jaw-chomp img")?.getAttribute("src")).toBe("jaw.webp");
    expect(screen.queryByLabelText(text.bestScore)).toBeNull();
    expect(screen.getByLabelText(text.jawCollection).textContent).toContain("0 / 16");
    const switcher = screen.getByRole("group", { name: text.ageLevelSwitch });
    expect(within(switcher).getByRole("button", { name: text.ageLevels.explorer.name }).getAttribute("aria-pressed")).toBe("true");
    expect(button(text.play).querySelector("svg")).not.toBeNull();
    expect(button(text.jawShelf).querySelector("svg")).not.toBeNull();
    fireEvent.click(button(text.home));
    expect(homeTile(text.whoseJaw)).toBeDefined();
    expect(app.featured.history().timesStarted.get("whoseJaw")).toBeUndefined();
  });

  it.each(AGE_LEVELS)("starts at the parent's %s level", (level) => {
    openWhoseJawApp({ setting: { level, revision: "parent" } });
    fireEvent.click(homeTile(TEXTS.en.whoseJaw));
    expect(choice(TEXTS.en.ageLevels[level].name).getAttribute("aria-pressed")).toBe("true");
  });

  it("remembers a choice after reload and displays the selected level's best with a shared collection", () => {
    const storage = memoryStorage({ [PROGRESS_KEY]: record({
      best: { hatchling: 3, explorer: 2, paleontologist: null }, earned: ["tyrannosaurus", "triceratops"]
    }) });
    const app = openWhoseJawApp({ storage });
    fireEvent.click(homeTile(TEXTS.en.whoseJaw));
    expect(screen.getByLabelText(TEXTS.en.bestScore).textContent).toBe("🦷 2");
    fireEvent.click(choice("HATCHLING"));
    expect(screen.getByLabelText(TEXTS.en.bestScore).textContent).toBe("🦷 3");
    expect(screen.getByLabelText(TEXTS.en.jawCollection).textContent).toContain("2 / 16");
    app.unmount();
    const reloaded = openWhoseJawApp({ storage });
    fireEvent.click(homeTile(TEXTS.en.whoseJaw));
    expect(choice("HATCHLING").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(choice("PALEONTOLOGIST"));
    expect(screen.queryByLabelText(TEXTS.en.bestScore)).toBeNull();
    reloaded.unmount();
    openWhoseJawApp({ storage, setting: { level: "explorer", revision: "new-parent-setting" } });
    fireEvent.click(homeTile(TEXTS.en.whoseJaw));
    expect(choice("EXPLORER").getAttribute("aria-pressed")).toBe("true");
  });

  it.each(["tile", "featured"] as const)("opens from the %s and routes play, shelf, back and home without awarding progress", (door) => {
    const storage = memoryStorage({ [PROGRESS_KEY]: record({}, door === "featured" ? "whoseJaw" : "compare") });
    const app = openWhoseJawApp({ storage });
    pressTwice(door === "tile" ? homeTile(TEXTS.en.whoseJaw) : featuredCard());
    pressTwice(button(TEXTS.en.play));
    expect(document.querySelector(".whose-jaw-welcome")).toBeNull();
    expect(app.featured.history().timesStarted.get("whoseJaw")).toBe(1);
    fireEvent.click(button(TEXTS.en.back));
    fireEvent.click(button(TEXTS.en.jawShelf));
    expect(screen.getByRole("heading", { name: TEXTS.en.jawShelf })).toBeDefined();
    fireEvent.click(button(TEXTS.en.home));
    expect(app.featured.history().timesStarted.get("whoseJaw")).toBe(1);
    expect(JSON.parse(storage.items.get(PROGRESS_KEY)!).games["whose-jaw"]).toEqual({});
  });

  it.each([{ read: false }, { save: false }])("keeps a session choice when storage fails: %j", (failure) => {
    openWhoseJawApp({ storage: memoryStorage({}, failure) });
    fireEvent.click(homeTile(TEXTS.en.whoseJaw));
    fireEvent.click(choice("HATCHLING"));
    fireEvent.click(button(TEXTS.en.home));
    fireEvent.click(homeTile(TEXTS.en.whoseJaw));
    expect(choice("HATCHLING").getAttribute("aria-pressed")).toBe("true");
  });

  it("starts the entrance only when the jaw decodes, leaving the gummy picture free to load later", () => {
    const pictures = manualPictures();
    render(<WhoseJawWelcomeScreen language="en" level="explorer" best={null} collected={0} total={16}
      jawPicture="jaw.webp" gummyPicture="gummy.webp" onLevel={() => {}} onPlay={() => {}} onShelf={() => {}} onHome={() => {}} />,
      withManualPictures(pictures));
    const jaw = document.querySelector(".whose-jaw-chomp")!;
    expect(jaw.hasAttribute("data-ready")).toBe(false);
    act(() => pictures.finish("jaw.webp"));
    expect(jaw.hasAttribute("data-ready")).toBe(true);
    expect(document.querySelector('.whose-jaw-gummy')?.getAttribute("data-picture")).toBe("loading");
  });

  it("keeps controls usable through undecoded and failed pictures, including keyboard activation", async () => {
    const pictures = manualPictures();
    const onPlay = vi.fn();
    render(<WhoseJawWelcomeScreen language="en" level="explorer" best={null} collected={0} total={16}
      jawPicture="jaw.webp" gummyPicture="gummy.webp" onLevel={() => {}} onPlay={onPlay} onShelf={() => {}} onHome={() => {}} />,
      withManualPictures(pictures));
    expect(document.querySelectorAll('.whose-jaw-hero [data-picture="loading"]').length).toBe(2);
    act(() => pictures.fail("jaw.webp"));
    expect(document.querySelector('.whose-jaw-chomp [data-picture="failed"]')).not.toBeNull();
    button(TEXTS.en.play).focus();
    await userEvent.setup({ delay: null }).keyboard("{Enter}");
    expect(onPlay).toHaveBeenCalledTimes(1);
  });
});
