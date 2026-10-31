import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, onTestFinished, vi } from "vitest";
import { browserInput } from "../src/root.ts";
import { appStylesheet, NO_SAFE_AREA } from "./stylesheet.ts";

it("protects text, pictures, canvas and controls across replaced screens without cancelling their contacts", () => {
  const input = browserInput(window);
  onTestFinished(input.stop);
  const activate = vi.fn();
  const page = (name: string) => <main key={name}><h1>{name}</h1><p>WORDS</p><img alt="DINOSAUR" /><canvas /><button onClick={activate}>OPEN</button><a href="#next">NEXT</a></main>;
  const view = render(page("FIRST"));
  for (const name of ["FIRST", "NEXT"]) {
    view.rerender(page(name));
    for (const element of view.container.querySelectorAll("main, h1, p, img, canvas, button, a")) {
      const style = getComputedStyle(element);
      expect([style.userSelect, style.getPropertyValue("-webkit-user-select"), style.touchAction]).toEqual(["none", "none", "manipulation"]);
      for (const type of ["contextmenu", "selectstart"]) expect(fireEvent(element, new Event(type, { bubbles: true, cancelable: true }))).toBe(false);
      for (const type of ["touchstart", "touchmove", "touchend", "wheel"]) expect(fireEvent(element, new Event(type, { bubbles: true, cancelable: true }))).toBe(true);
    }
    fireEvent.click(screen.getByRole("button", { name: "OPEN" }), { detail: 0 });
  }
  // jsdom drops Safari's callout declaration, so check its source rule.
  expect(appStylesheet(NO_SAFE_AREA)).toMatch(/:where\(html, body, body \*\)\s*\{[^}]*-webkit-touch-callout: none;/);
  expect(activate).toHaveBeenCalledTimes(2);
});
