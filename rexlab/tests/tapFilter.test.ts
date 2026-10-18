import { describe, expect, it } from "vitest";
import { tapFilter, type TapInput } from "../src/tapFilter.ts";

type At = { x?: number; y?: number; pointer?: number };

const press = (time: number, { x = 0, y = 0, pointer = 1 }: At = {}): TapInput => ({ kind: "press", pointer, x, y, time });
const move = (time: number, { x = 0, y = 0, pointer = 1 }: At = {}): TapInput => ({ kind: "move", pointer, x, y, time });
const release = (time: number, { x = 0, y = 0, pointer = 1 }: At = {}): TapInput => ({ kind: "release", pointer, x, y, time });
const cancel = (time: number, { x = 0, y = 0, pointer = 1 }: At = {}): TapInput => ({ kind: "cancel", pointer, x, y, time });
const TAP: TapInput = { kind: "tap", byKey: false };
const KEY: TapInput = { kind: "tap", byKey: true };

// A whole tap, pressed at `time` and released 50 ms later on the same spot.
const tap = (time: number, at: At = {}) => [press(time, at), release(time + 50, at), TAP];

// What the filter lets through of each input, in order.
function through(inputs: TapInput[]) {
  const filter = tapFilter();
  return inputs.map(filter);
}

// Whether each tap's input all went through, for inputs made of whole taps.
const taps = (inputs: TapInput[]) => {
  const kept = through(inputs);
  return Array.from({ length: kept.length / 3 }, (_, i) => kept.slice(i * 3, i * 3 + 3));
};

describe("the double-tap filter", () => {
  it("lets a single tap through, and swallows the whole second tap of a double tap", () => {
    expect(taps([...tap(0), ...tap(250)])).toEqual([
      [true, true, true],
      [false, false, false]
    ]);
  });

  it("swallows the moves of a second tap's touch too", () => {
    expect(through([...tap(0), press(250), move(260, { x: 30 }), release(300, { x: 30 }), TAP])).toEqual([true, true, true, false, false, false, false]);
  });

  it.each([
    [549, false],
    [550, true]
  ])("times the window from the release: a press %i ms after the press before it, 50 ms held, goes through: %s", (later, kept) => {
    expect(through([...tap(0), press(later)])[3]).toBe(kept);
  });

  it.each([
    [99, false],
    [100, true]
  ])("measures the reach from the release: a press %i CSS pixels from it goes through: %s", (away, kept) => {
    expect(through([press(0, { x: 4 }), release(50), TAP, press(200, { x: away * 0.6, y: away * 0.8 })])[3]).toBe(kept);
  });

  it("measures by the event times it is given, not when it is asked: a late handler changes nothing", () => {
    const filter = tapFilter();
    [...tap(0)].forEach(filter);
    // The second press reaches the filter long after it happened.
    expect(filter(press(300))).toBe(false);
    expect(filter(press(10_000, { pointer: 2 }))).toBe(true);
  });

  it("keeps the window open from a swallowed press's release, so a burst counts once", () => {
    expect(taps([...tap(0), ...tap(300), ...tap(600), ...tap(1200)]).map((kept) => kept[0])).toEqual([true, false, false, true]);
  });

  it("keeps the window open from a swallowed drag's release", () => {
    expect(through([...tap(0), press(250), move(260, { x: 40 }), release(300), TAP, press(500)]).at(-1)).toBe(false);
  });

  it("opens no window for a drag", () => {
    expect(through([press(0), move(20, { x: 40 }), release(60, { x: 40 }), TAP, press(100, { x: 40 })]).at(-1)).toBe(true);
  });

  it("counts a touch that moved no more than 8 CSS pixels as a tap, and one that moved further as a drag", () => {
    expect(through([press(0), move(20, { x: 8 }), release(40, { x: 8 }), TAP, press(100, { x: 8 })]).at(-1)).toBe(false);
    expect(through([press(0), move(20, { x: 9 }), release(40, { x: 9 }), TAP, press(100, { x: 9 })]).at(-1)).toBe(true);
    expect(through([press(0), release(40, { x: 9 }), TAP, press(100, { x: 9 })]).at(-1)).toBe(true);
  });

  it("opens no window for a cancelled touch", () => {
    expect(through([...tap(0), press(600), cancel(650), press(700)]).at(-1)).toBe(true);
  });

  it("lets two taps far apart through", () => {
    expect(taps([...tap(0), ...tap(200, { x: 150 })]).map((kept) => kept[0])).toEqual([true, true]);
  });

  it("never filters a tap made by a key", () => {
    expect(through([...tap(0), press(200), release(250), KEY])).toEqual([true, true, true, false, false, true]);
    expect(through([KEY, KEY])).toEqual([true, true]);
  });

  it("swallows only the tap its own touch would make", () => {
    // The swallowed touch ended off its control, so made no tap: the next
    // touch's tap still goes through.
    expect(through([...tap(0), press(200), release(250), press(900), release(950), TAP]).at(-1)).toBe(true);
  });

  it("tells fingers apart: a second finger does not end the first's touch", () => {
    expect(through([press(0), press(10, { x: 300, pointer: 2 }), move(20, { x: 300, pointer: 2 }), release(40), TAP, press(100)]).at(-1)).toBe(false);
  });
});
