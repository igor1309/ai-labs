import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Button } from "../src/Button.tsx";
import { openHomeApp } from "./skeletonsApp.tsx";

// window-fit.feature: "A pointer that can hover is shown what it can press".

const SRC = join(import.meta.dirname, "../src");

const brightness = (element: Element) => {
  const match = /brightness\(([\d.]+)\)/.exec(getComputedStyle(element).filter);
  return match?.[1] === undefined ? 1 : Number(match[1]);
};

// The kinds of pointer a browser reports: a trackpad's or a mouse's, a
// pencil's, and a finger's, which has no hover.
const HOVERING = ["mouse", "pen"] as const;

describe("every button of the app", () => {
  it("is a Button, so it brightens by the pointer's own kind", () => {
    const sources = readdirSync(SRC, { recursive: true, encoding: "utf8" })
      .filter((file) => file.endsWith(".tsx"))
      .map((file) => [file, readFileSync(join(SRC, file), "utf8")] as const);

    expect(sources.filter(([file, source]) => file !== "Button.tsx" && /<button\b/.test(source)).map(([file]) => file)).toEqual([]);
    expect(sources.filter(([, source]) => /<Button\b/.test(source)).length).toBeGreaterThan(20);
  });

  it("on the home page brightens under a hovering pointer and goes back as it leaves, never under a finger", async () => {
    const { user } = openHomeApp();
    const buttons = screen.getAllByRole("button");
    const name = (button: HTMLElement) => button.getAttribute("aria-label") ?? button.textContent;
    const seen: Array<[string | null, number, number, number]> = [];

    for (const button of buttons) {
      fireEvent.pointerEnter(button, { pointerType: "touch" });
      const touched = brightness(button);
      fireEvent.pointerLeave(button, { pointerType: "touch" });
      await user.hover(button);
      const hovered = brightness(button);
      await user.unhover(button);
      seen.push([name(button), touched, Math.sign(hovered - 1), brightness(button)]);
    }

    expect(buttons.length).toBeGreaterThan(8);
    expect(seen).toEqual(buttons.map((button) => [name(button), 1, 1, 1]));
  });
});

describe("a button", () => {
  it.each(HOVERING)("brightens under a hovering %s and goes back as it leaves", (pointerType) => {
    render(<Button>GO</Button>);
    const button = screen.getByRole("button", { name: "GO" });

    fireEvent.pointerEnter(button, { pointerType });
    expect(brightness(button)).toBeGreaterThan(1);
    fireEvent.pointerLeave(button, { pointerType });
    expect(brightness(button)).toBe(1);
  });

  it("never brightens under a finger, even on a device whose trackpad has just left it", async () => {
    const user = userEvent.setup();
    const taps: string[] = [];
    render(<Button onClick={() => taps.push("GO")}>GO</Button>);
    const button = screen.getByRole("button", { name: "GO" });
    fireEvent.pointerEnter(button, { pointerType: "mouse" });
    fireEvent.pointerLeave(button, { pointerType: "mouse" });

    await user.pointer({ keys: "[TouchA>]", target: button });
    expect([button.hasAttribute("data-hovered"), button.hasAttribute("data-pressed")]).toEqual([false, true]);
    await user.pointer({ keys: "[/TouchA]", target: button });

    expect([brightness(button), button.hasAttribute("data-pressed"), taps]).toEqual([1, false, ["GO"]]);
  });

  it.each([
    ["disabled", { disabled: true }],
    ["marked as not responding", { "aria-disabled": true }]
  ])("shows neither hover nor press when %s", (_, props) => {
    render(<Button {...props}>GO</Button>);
    const button = screen.getByRole("button", { name: "GO" });

    fireEvent.pointerEnter(button, { pointerType: "mouse" });
    fireEvent.pointerDown(button, { pointerType: "mouse" });

    expect([brightness(button), button.hasAttribute("data-hovered"), button.hasAttribute("data-pressed")]).toEqual([1, false, false]);
  });

  it("runs the pointer handlers it is given beside its own", () => {
    const seen: string[] = [];
    const record = (name: string) => () => seen.push(name);
    render(
      <Button
        onPointerEnter={record("enter")}
        onPointerDown={record("down")}
        onPointerUp={record("up")}
        onPointerCancel={record("cancel")}
        onPointerLeave={record("leave")}
      >
        GO
      </Button>
    );
    const button = screen.getByRole("button", { name: "GO" });

    fireEvent.pointerEnter(button, { pointerType: "mouse" });
    fireEvent.pointerDown(button, { pointerType: "mouse" });
    const held = [button.hasAttribute("data-hovered"), button.hasAttribute("data-pressed")];
    fireEvent.pointerUp(button, { pointerType: "mouse" });
    fireEvent.pointerDown(button, { pointerType: "mouse" });
    fireEvent.pointerCancel(button, { pointerType: "mouse" });
    fireEvent.pointerLeave(button, { pointerType: "mouse" });

    expect([held, seen, button.hasAttribute("data-hovered"), button.hasAttribute("data-pressed")]).toEqual([
      [true, true],
      ["enter", "down", "up", "down", "cancel", "leave"],
      false,
      false
    ]);
  });

  it("is a plain button, never a form's submit, unless it is given a type", () => {
    render(
      <>
        <Button>GO</Button>
        <Button type="submit">SEND</Button>
      </>
    );

    expect([screen.getByRole("button", { name: "GO" }).getAttribute("type"), screen.getByRole("button", { name: "SEND" }).getAttribute("type")]).toEqual(["button", "submit"]);
  });
});
