import { render } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { FitText } from "../src/FitText.tsx";

const proto = Element.prototype;
const original = {
  clientWidth: Object.getOwnPropertyDescriptor(proto, "clientWidth")!,
  scrollWidth: Object.getOwnPropertyDescriptor(proto, "scrollWidth")!
};
const sheet = document.head.appendChild(document.createElement("style"));
sheet.textContent = ".word { font-size: 20px; }";
afterEach(() => {
  Object.defineProperty(proto, "clientWidth", original.clientWidth);
  Object.defineProperty(proto, "scrollWidth", original.scrollWidth);
});

// The word's width does not scale in proportion to its size: it keeps 2 px
// that plain scaling misses, as a fallback face's glyphs and rounding do.
function measure(room: number, width: (size: number) => number) {
  Object.defineProperty(proto, "clientWidth", { configurable: true, get(this: HTMLElement) { return this.classList.contains("word") ? room : 0; } });
  Object.defineProperty(proto, "scrollWidth", { configurable: true, get(this: HTMLElement) {
    return this.classList.contains("word") ? Math.ceil(width(parseFloat(this.style.fontSize || "20"))) : 0;
  } });
}

test("a word still too wide after one shrink is measured again until it fits", () => {
  measure(193, (size) => size * 11 + 2);
  const { container } = render(<FitText className="word" text="ПОЛКА ЧЕЛЮСТЕЙ" />);
  const word = container.querySelector<HTMLElement>(".word")!;
  expect(word.style.fontSize).not.toBe("");
  expect(word.scrollWidth).toBeLessThanOrEqual(word.clientWidth);
});

test("a word that fits keeps its own size", () => {
  measure(300, (size) => size * 11);
  const { container } = render(<FitText className="word" text="JAW SHELF" />);
  expect(container.querySelector<HTMLElement>(".word")!.style.fontSize).toBe("");
});
