import { describe, expect, it } from "vitest";
import { basketLayout, type BasketRoom } from "../src/basketLayout.ts";

const room: BasketRoom = { width: 390, height: 120, count: 5, gap: 8, nameWidth: 191, nameHeight: 26, pictureAspect: 800 / 600, picturePadding: 8 };

describe("a basket's columns", () => {
  it.each([
    ["five cards in 390×120", {}, { columns: 3, namesShown: false }],
    ["six cards in 249×132", { width: 249, height: 132, count: 6 }, { columns: 3, namesShown: false }],
    ["three cards in a wide basket at 1506×807", { width: 629, height: 159, count: 3 }, { columns: 3, namesShown: true }],
    ["one card", { count: 1 }, { columns: 1, namesShown: true }],
    ["a width too small for any name", { width: 100, height: 240, count: 3 }, { columns: 1, namesShown: false }],
    ["no cards", { count: 0 }, { columns: 1, namesShown: false }],
    ["no room yet", { width: 0, height: 0 }, { columns: 1, namesShown: false }],
    ["a tall picture aspect", { pictureAspect: 0.5 }, { columns: 5, namesShown: false }],
    ["names with unpadded art", { nameWidth: 50, nameHeight: 10, picturePadding: 0 }, { columns: 5, namesShown: true }],
    ["names with padded art", { nameWidth: 50, nameHeight: 10 }, { columns: 3, namesShown: false }],
    ["exactly 48px of picture above a name", { width: 191, height: 90, count: 1 }, { columns: 1, namesShown: true }],
    ["less than 48px of picture above a name", { width: 191, height: 89, count: 1 }, { columns: 1, namesShown: false }],
    ["a narrow picture beside a wide enough name", { width: 79, nameWidth: 70, count: 1 }, { columns: 1, namesShown: false }],
    ["names before larger pictures alone", { width: 390, height: 190, count: 3 }, { columns: 2, namesShown: true }]
  ] as const)("%s", (_, change, expected) => {
    expect(basketLayout({ ...room, ...change })).toEqual(expected);
  });

  it.each([0, 8, 16])("maximises the picture for every feasible name layout, then picture-only layout, with %ipx gaps", (gap) => {
    for (const width of [100, 249, 390, 629, 1000]) {
      for (const height of [80, 120, 132, 240, 807]) {
        for (const count of [1, 3, 5, 6]) {
          const input = { ...room, width, height, count, gap };
          const chosen = basketLayout(input);
          const candidates = Array.from({ length: count }, (_, at) => {
            const columns = at + 1;
            const rows = Math.ceil(count / columns);
            const w = (width - gap * (columns - 1)) / columns;
            const h = (height - gap * (rows - 1)) / rows;
            return {
              columns,
              named: w >= input.nameWidth && h >= input.nameHeight + 2 * input.picturePadding + 48 && w >= 2 * input.picturePadding + 48 * input.pictureAspect,
              namedHeight: Math.min(h - input.nameHeight - 2 * input.picturePadding, (w - 2 * input.picturePadding) / input.pictureAspect),
              aloneHeight: Math.min(h, w / input.pictureAspect)
            };
          });
          const named = candidates.filter((candidate) => candidate.named);
          const eligible = named.length ? named : candidates;
          const picture = (candidate: typeof candidates[number]) => named.length ? candidate.namedHeight : candidate.aloneHeight;
          const selected = eligible.find((candidate) => candidate.columns === chosen.columns);
          expect(chosen.namesShown).toBe(named.length > 0);
          expect(selected).toBeDefined();
          expect(selected && picture(selected)).toBe(Math.max(...eligible.map(picture)));
        }
      }
    }
  });
});
