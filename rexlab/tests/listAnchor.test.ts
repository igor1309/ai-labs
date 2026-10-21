import { describe, expect, it } from "vitest";
import { catalogueColumns } from "../src/catalogueColumns.ts";
import records from "../src/data/dinosaurs.json";
import { anchoredListScroll, listAnchor, type ListAnchor, type ListRows } from "../src/listAnchor.ts";

// The list of every dinosaur, in its order.
const IDS = records.map(({ id }) => id);
const GAP = 20;
// The list's padding under its last row.
const BOTTOM = 48;

// A card's height at `width`: its picture's band, 317 by 200, then its
// footer, 14 pixels above the name and 18 under the chips, 10 between
// them, the name's line Lexend's 1.25 of its size, at most 20 and 7% of
// the card, and the chips 32 tall.
const cardHeight = (width: number) => (width * 200) / 317 + 14 + 1.25 * Math.min(20, 0.07 * width) + 10 + 32 + 18;

type Layout = { height: number; scrollHeight: number; rows: ListRows };

// The list of `count` cards in a window `windowWidth` by `windowHeight`
// with no safe areas, `bar` pixels of it above the list: 40 above "HOME",
// then the bar, and the list 28 under it.
function layoutOf(windowWidth: number, windowHeight: number, sizeClass: "wide" | "tall", bar: number, count = IDS.length): Layout {
  const columns = catalogueColumns(windowWidth, sizeClass, { left: 0, right: 0 });
  const row = cardHeight((windowWidth - 112 - (columns - 1) * GAP) / columns);
  const rowCount = Math.ceil(count / columns);
  return { height: windowHeight - 40 - bar - 28, scrollHeight: rowCount * row + (rowCount - 1) * GAP + BOTTOM, rows: { columns, row, gap: GAP } };
}

// 1180 by 820: "HOME" and the chips in one bar, 56 tall.
const LANDSCAPE = layoutOf(1180, 820, "wide", 56);
// 820 by 1180: "HOME", then the chips in one row 24 under it.
const UPRIGHT = layoutOf(820, 1180, "tall", 56 + 24 + 56);

const endOf = ({ height, scrollHeight }: Layout) => scrollHeight - height;
const rowTop = ({ rows: { row, gap } }: Layout, at: number) => at * (row + gap);
const rowOf = ({ rows: { columns } }: Layout, index: number) => Math.floor(index / columns);
const indexOf = (id: string) => IDS.indexOf(id);
const anchorIn = (layout: Layout, scroll: number, returning?: number) => listAnchor({ scroll, height: layout.height, scrollHeight: layout.scrollHeight }, layout.rows, returning);
const scrollIn = (layout: Layout, anchor: ListAnchor) => anchoredListScroll(anchor, layout, layout.rows);

// The cards of the row standing exactly at the list's top at `scroll`.
function topRow(layout: Layout, scroll: number): string[] {
  const at = scroll / (layout.rows.row + layout.rows.gap);
  if (!Number.isInteger(at)) throw new Error(`no row at the top at ${scroll}`);
  return IDS.slice(at * layout.rows.columns, (at + 1) * layout.rows.columns);
}

// Whether the card `index` shows whole in the list scrolled to `scroll`.
function isWhole(layout: Layout, index: number, scroll: number) {
  const top = rowTop(layout, rowOf(layout, index));
  return top >= scroll && top + layout.rows.row <= scroll + layout.height;
}

// Where a turn leaves the list: at its end with its last card whole, or
// the card `id` at `place` in its top row.
type Kept = "end" | readonly [id: string, place: number];

function expectKept(layout: Layout, scroll: number, kept: Kept) {
  if (kept === "end") {
    expect(scroll).toBe(endOf(layout));
    expect(isWhole(layout, IDS.length - 1, scroll)).toBe(true);
  } else {
    expect(topRow(layout, scroll)[kept[1]]).toBe(kept[0]);
  }
}

describe("where the list of every dinosaur stands", () => {
  const gallimimus = rowOf(LANDSCAPE, indexOf("gallimimus"));

  it("turns from four cards to a row to three", () => {
    expect([LANDSCAPE.rows.columns, UPRIGHT.rows.columns]).toEqual([4, 3]);
  });

  it.each<[string, number, Kept, Kept]>([
    ["the row of Gallimimus at its top", rowTop(LANDSCAPE, gallimimus), ["gallimimus", 0], ["gallimimus", 0]],
    ["60 pixels of the row of Gallimimus hidden", rowTop(LANDSCAPE, gallimimus) + 60, ["gallimimus", 0], ["gallimimus", 0]],
    ["200 pixels of the row before Gallimimus hidden", rowTop(LANDSCAPE, gallimimus - 1) + 200, ["gallimimus", 0], ["gallimimus", 0]],
    ["the row of Parasaurolophus at its top", rowTop(LANDSCAPE, rowOf(LANDSCAPE, indexOf("parasaurolophus"))), ["parasaurolophus", 2], ["spinosaurus", 2]],
    ["at its end", endOf(LANDSCAPE), "end", "end"]
  ])("with %s is kept through a turn to 820 by 1180 and back", (_, scrolled, upright, back) => {
    const uprightScroll = scrollIn(UPRIGHT, anchorIn(LANDSCAPE, scrolled));
    const backScroll = scrollIn(LANDSCAPE, anchorIn(UPRIGHT, uprightScroll));

    expectKept(UPRIGHT, uprightScroll, upright);
    expectKept(LANDSCAPE, backScroll, back);
  });

  it("stands at the first card of the topmost row showing at least half of itself, past any gap", () => {
    const { row, gap } = LANDSCAPE.rows;

    expect([row / 2, row / 2 + 1, row, row + gap, row + gap + row / 2, row + gap + row / 2 + 1].map((scroll) => anchorIn(LANDSCAPE, scroll))).toEqual([0, 4, 4, 4, 4, 8]);
  });

  it("stands at its end less than a pixel short of it, where its scroll is a fraction", () => {
    const end = endOf(LANDSCAPE);

    expect([end - 0.5, end - 1].map((scroll) => anchorIn(LANDSCAPE, scroll))).toEqual(["end", "end"]);
    expect(anchorIn(LANDSCAPE, end - 1.5)).not.toBe("end");
  });

  it("puts a card's row at the top only as far as the list scrolls", () => {
    expect(scrollIn(UPRIGHT, indexOf("gallimimus"))).toBe(rowTop(UPRIGHT, 4));
    expect(scrollIn(UPRIGHT, IDS.length - 1)).toBe(endOf(UPRIGHT));
  });

  it("stands at its first card where the list does not scroll, however it was scrolled", () => {
    // "BOTH" chosen: its three cards in one row upright.
    const both = layoutOf(820, 1180, "tall", 56 + 24 + 56, 3);

    expect(endOf(both)).toBeLessThan(0);
    expect([0, 40].map((scroll) => anchorIn(both, scroll))).toEqual([0, 0]);
    expect([0, 2, "end" as const].map((anchor) => scrollIn(both, anchor))).toEqual([0, 0, 0]);
  });

  // Back from a page, the list shows the card at its bottom edge or its
  // top, wherever it was scrolled; at its end, the last rows' cards.
  it("keeps the card come back to whole through a turn and back, wherever it shows", () => {
    const shownAt = (layout: Layout, index: number) => {
      const top = rowTop(layout, rowOf(layout, index));
      return [top, top + layout.rows.row - layout.height, endOf(layout)].filter((scroll) => scroll >= 0 && scroll <= endOf(layout) && isWhole(layout, index, scroll));
    };
    const broken = IDS.flatMap((id, index) =>
      shownAt(LANDSCAPE, index).flatMap((scroll) => {
        const upright = scrollIn(UPRIGHT, anchorIn(LANDSCAPE, scroll, index));
        const back = scrollIn(LANDSCAPE, anchorIn(UPRIGHT, upright, index));
        return isWhole(UPRIGHT, index, upright) && isWhole(LANDSCAPE, index, back) ? [] : [`${id} at ${scroll}: ${upright}, then ${back}`];
      })
    );

    expect(broken).toEqual([]);
  });

  it("stands at the card come back to even at its end, and where it does not scroll", () => {
    expect(anchorIn(LANDSCAPE, endOf(LANDSCAPE), 44)).toBe(44);
    expect(anchorIn(layoutOf(820, 1180, "tall", 56 + 24 + 56, 3), 0, 2)).toBe(2);
  });
});
