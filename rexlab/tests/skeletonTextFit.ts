// jsdom lays nothing out, so the width of the words on each skeleton
// button and chip is given here in ems of its bold face, rounded up:
// Lexend's for the Latin words and the numbers, and the iPad's own face,
// at its smallest optical size, for the Cyrillic words, which Lexend has
// no letters for. Words missing here fail the test that reads them.
export const WORD_EMS: Record<string, number> = {
  HOME: 3.2,
  ДОМОЙ: 4.1,
  BACK: 2.9,
  НАЗАД: 3.7,
  MUSEUM: 4.6,
  МУЗЕЙ: 3.8,
  "BUILD ANOTHER": 8.9,
  "СОБРАТЬ ДРУГОЙ": 9.7,
  BUILD: 3.5,
  СОБРАТЬ: 5.1,
  REBUILD: 4.8,
  "СОБРАТЬ ЗАНОВО": 9.8,
  CONTINUE: 5.8,
  ДОСТРОИТЬ: 6.7,
  "0/3": 1.9,
  "1/3": 1.8,
  "2/3": 1.8,
  "3/3": 1.8,
  "0/4": 2.0,
  "1/4": 1.9,
  "2/4": 1.9,
  "3/4": 1.9,
  "4/4": 2.0,
  "0/5": 2.0,
  "1/5": 1.9,
  "2/5": 2.0,
  "3/5": 2.0,
  "4/5": 2.0,
  "5/5": 2.0
};

const px = (value: string) => Number.parseFloat(value) || 0;

// jsdom keeps a gap as it is written, unexpanded.
export const columnGapOf = (style: CSSStyleDeclaration) => px(style.gap.split(" ").at(-1) ?? "");

const sidesOf = (style: CSSStyleDeclaration) => px(style.paddingLeft) + px(style.paddingRight) + px(style.borderLeftWidth) + px(style.borderRightWidth);

export const widthOf = (element: Element) => sidesOf(getComputedStyle(element));

// The words an element shows itself, beside its symbols.
export const wordsOf = (element: Element) =>
  [...element.childNodes]
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent)
    .join("")
    .trim();

// An element's font size in pixels, in a container `container` pixels
// wide: as app.css gives it, or, for one worked out from the container's
// width, at most a cap, otherwise the container's width less a length
// over a width in ems, which jsdom keeps as a multiplication by its
// inverse.
export function sizeOf(element: Element, container?: number) {
  const { fontSize } = getComputedStyle(element);
  if (/^[\d.]+px$/.test(fontSize)) return px(fontSize);
  const shrinking = /^min\(([\d.]+)px, ([\d.]+) \* \(100cqi - ([\d.]+)px\)\)$/.exec(fontSize);
  if (!shrinking || container === undefined) throw new Error(`A size of ${fontSize} cannot be worked out here`);
  return Math.min(Number(shrinking[1]), Number(shrinking[2]) * (container - Number(shrinking[3])));
}

// The width a button or chip needs for its words on one line at `size`,
// beside its symbols: its sides, its symbols as wide as they are drawn,
// the gaps between them and its words, and the words, their letters
// spaced; NaN for words with no width in ems here.
export function neededBy(element: Element, size: number) {
  const style = getComputedStyle(element);
  const words = wordsOf(element);
  const symbols = [...element.children].filter((child) => child.tagName.toLowerCase() === "svg");
  const parts = symbols.length + (words ? 1 : 0);
  return (
    widthOf(element) +
    symbols.reduce((sum, symbol) => sum + px(symbol.getAttribute("width") ?? ""), 0) +
    columnGapOf(style) * Math.max(parts - 1, 0) +
    (words ? (WORD_EMS[words] ?? Number.NaN) * size + px(style.letterSpacing) * [...words].length : 0)
  );
}

