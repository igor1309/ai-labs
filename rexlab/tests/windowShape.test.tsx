import { act, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SizeClass } from "../src/App.tsx";
import { TEXTS } from "../src/language/texts.ts";
import { openMenu } from "./menus.ts";
import { hints, openHomeApp, openPuzzle } from "./skeletonsApp.tsx";
import { gameDoor, manualViewport } from "./support.ts";

const gate = () => document.querySelector<HTMLElement>(".orientation-gate")!;
const behind = () => document.querySelector<HTMLElement>(".gated-screen")!;

describe("the window's shape through app props", () => {
  it.each<SizeClass>(["wide", "wide-short", "tall", "tall-narrow"])("renders and updates %s without remounting the screen or its state", async (size) => {
    const viewport = manualViewport("landscape");
    const app = openHomeApp({ viewport });
    await openMenu(app.user, "Language");
    const home = document.querySelector("main");
    const menu = screen.getByRole("menu", { name: "Language" });

    act(() => viewport.resize(size, false));

    expect(document.documentElement.dataset.size).toBe(size);
    expect(document.querySelector("main")).toBe(home);
    expect(menu.isConnected).toBe(true);
    expect(behind().hasAttribute("inert")).toBe(size.startsWith("tall"));

    act(() => viewport.resize("wide", false));
    expect(screen.getByRole("menu", { name: "Language" })).toBe(menu);
    expect(behind().hasAttribute("inert")).toBe(false);
    app.unmount();
    expect(document.documentElement.hasAttribute("data-size")).toBe(false);
  });

  it.each([
    ["en", true, "TURN SIDEWAYS", "A portrait layout for this screen is on its way."],
    ["ru", true, "ПОВЕРНИ БОКОМ", "Вертикальный вид этого экрана уже в пути."],
    ["en", false, "MAKE THE WINDOW WIDER", "A portrait layout for this screen is on its way."],
    ["ru", false, "СДЕЛАЙ ОКНО ШИРЕ", "Вертикальный вид этого экрана уже в пути."]
  ] as const)("names no device in %s, with an upright screen %s", (language, upright, instruction, footnote) => {
    const viewport = manualViewport("landscape");
    viewport.resize("tall-narrow", upright);
    openHomeApp({ viewport, deviceLanguage: language });
    const picture = screen.getByRole("img", { name: instruction });

    expect(picture.textContent).toBe(instruction);
    expect(picture.querySelectorAll("svg")).toHaveLength(upright ? 3 : 2);
    expect(picture.querySelector(upright ? ".lucide-rotate-cw" : ".lucide-move-horizontal")).not.toBeNull();
    const note = screen.getByText(footnote);
    expect([getComputedStyle(note).fontSize, getComputedStyle(note).fontWeight, getComputedStyle(note).color]).toEqual(["13px", "400", "rgb(92, 100, 122)"]);
    expect(behind().hasAttribute("inert")).toBe(true);
    expect(screen.queryAllByRole("button")).toEqual([]);

    act(() => viewport.resize("tall", !upright));
    expect(screen.getByRole("img", { name: upright ? TEXTS[language].makeWindowWider : TEXTS[language].turnSideways })).toBeDefined();
    act(() => viewport.resize("wide", !upright));
    expect(screen.queryByRole("img", { name: instruction })).toBeNull();
    expect(gameDoor(TEXTS[language].quizCard)).toBeDefined();
  });

  it("fades over the full screen in both directions while keeping both layers mounted", () => {
    const app = openHomeApp();
    const overlay = gate();
    const home = document.querySelector("main");
    const style = () => getComputedStyle(overlay);
    expect([style().opacity, style().visibility]).toEqual(["0", "hidden"]);
    expect(style().transition).toBe("opacity var(--motion-screen) var(--ease-out), visibility var(--motion-screen) var(--ease-out)");

    act(() => app.viewport.turn("portrait"));
    expect(gate()).toBe(overlay);
    expect([style().position, style().inset, style().zIndex, style().opacity, style().visibility, style().pointerEvents]).toEqual(["fixed", "0px", "100", "1", "visible", "auto"]);
    expect(style().animation).toBe("fade-in var(--motion-screen) var(--ease-out) both");
    expect(behind().hasAttribute("inert")).toBe(true);

    act(() => app.viewport.turn("landscape"));
    expect(gate()).toBe(overlay);
    expect(document.querySelector("main")).toBe(home);
    expect([style().opacity, style().visibility, style().pointerEvents]).toEqual(["0", "hidden", "none"]);
    expect(overlay.hasAttribute("inert")).toBe(true);
  });

  it.each<SizeClass>(["tall", "tall-narrow"])("allows only the named screen's portrait layout in %s", async (size) => {
    const viewport = manualViewport("landscape");
    viewport.resize(size, true);
    const app = openHomeApp({ viewport, portraitLayouts: new Set(["home"]) });
    expect(gate().hasAttribute("data-shown")).toBe(false);
    await app.user.click(gameDoor("COMPARE"));
    expect(gate().hasAttribute("data-shown")).toBe(true);
    expect(behind().hasAttribute("inert")).toBe(true);
    act(() => viewport.turn("landscape"));
    expect(screen.getByLabelText("PROGRESS").textContent).toBe("1/10");
  });

  it("keeps help running for a game with a portrait layout and still pauses for a hidden page", async () => {
    const app = await openPuzzle("TYRANNOSAURUS", { portraitLayouts: new Set(["skeletons"]) });
    act(() => app.viewport.turn("portrait"));
    expect(gate().hasAttribute("data-shown")).toBe(false);
    for (let second = 0; second < 4; second++) act(() => app.pictures.fire(1000));
    act(() => app.visibility.switchTo("hidden"));
    expect(app.pictures.timers()).toEqual([]);
    act(() => app.visibility.switchTo("visible"));
    for (let second = 0; second < 6; second++) act(() => app.pictures.fire(1000));
    expect(hints()).toEqual(["slot skull", "spot skull"]);
  });
});
