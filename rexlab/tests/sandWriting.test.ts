import { describe, expect, it } from "vitest";
import { sandWriting, TIP_WIDTHS, type SandSegment } from "../src/sandWriting.ts";

describe("sand writing's CSS strokes", () => {
  it.each(TIP_WIDTHS)("keeps the %i pixel tip and only draws each new segment once", (width) => {
    const drawn: SandSegment[] = [];
    const writing = sandWriting((segment) => drawn.push(segment));
    const a = { x: 12, y: 23 }, b = { x: 45, y: 67 }, c = { x: 89, y: 90 };
    writing.begin(1, a, width);
    writing.move(1, [a, b, c, c]);
    expect(drawn).toEqual([{ from: a, to: a, width }, { from: a, to: b, width }, { from: b, to: c, width }]);
    writing.end(1);
    writing.begin(2, b, 4);
    expect(drawn.at(-1)).toEqual({ from: b, to: b, width: 4 });
    const original = [...drawn];
    drawn.length = 0;
    writing.redraw();
    expect(drawn).toEqual(original);
  });

  it("keeps only the active pointer, ending without adding a cancellation point", () => {
    const drawn: SandSegment[] = [];
    const writing = sandWriting((segment) => drawn.push(segment));
    writing.begin(1, { x: 10, y: 20 }, 4);
    expect(writing.begin(2, { x: 700, y: 800 }, 8)).toBe(false);
    writing.move(2, [{ x: 900, y: 900 }]);
    writing.end(2);
    writing.move(1, [{ x: 30, y: 40 }]);
    writing.end(1);
    writing.move(1, [{ x: 99, y: 99 }]);
    expect(drawn).toEqual([
      { from: { x: 10, y: 20 }, to: { x: 10, y: 20 }, width: 4 },
      { from: { x: 10, y: 20 }, to: { x: 30, y: 40 }, width: 4 }
    ]);
    expect(writing.pointer).toBeUndefined();
    expect(writing.begin(2, { x: 70, y: 80 }, 2)).toBe(true);
  });

  it("clears retained and active strokes so neither a move nor a redraw restores them", () => {
    const drawn: SandSegment[] = [];
    const writing = sandWriting((segment) => drawn.push(segment));
    writing.begin(1, { x: 10, y: 20 }, 8);
    writing.clear();
    drawn.length = 0;
    writing.move(1, [{ x: 30, y: 40 }]);
    writing.redraw();
    expect(drawn).toEqual([]);
    writing.begin(2, { x: 50, y: 60 }, 8);
    expect(drawn).toEqual([{ from: { x: 50, y: 60 }, to: { x: 50, y: 60 }, width: 8 }]);
  });
});
