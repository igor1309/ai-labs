import { describe, expect, it } from "vitest";
import { first, layoutMeasurements, measureBasket, openBasket } from "./sortBasketFitCases.tsx";

// sort-dinosaurs-basket-fit.feature: a basket's names rechecked as it
// resizes; each level's full baskets are in their own files.

describe("a full basket", () => {
  it("rechecks the basket's width, height and every name's natural size on resize", () => {
    const layout = layoutMeasurements();
    openBasket(["plants", "meat"], 0, 6, "en");
    const area = first(".basket-cards") as HTMLElement;
    const cards = [...area.querySelectorAll<HTMLElement>(".sorted-card")];
    const size = [1920, 1080] as const;
    for (const [room, shown] of [
      [[800, 100], true],
      [[390, 120], false],
      [[800, 100], true],
      [[800, 80], false],
      [[800, 100], true]
    ] as const) {
      measureBasket(layout, area, room, size);
      expect(cards.map((card) => card.hasAttribute("data-name-fits"))).toEqual(cards.map(() => shown));
    }
    // A font can change a strip's natural width without changing the basket.
    const strip = first(".sorted-footer", cards[cards.length - 1] ?? area) as HTMLElement;
    layout.set(strip, [220, 25]);
    layout.resized(strip);
    expect(cards.every((card) => getComputedStyle(first(".sorted-footer", card)).visibility === "hidden")).toBe(true);
    layout.set(strip, [100, 25]);
    layout.resized(strip);
    expect(cards.every((card) => getComputedStyle(first(".sorted-footer", card)).visibility === "visible")).toBe(true);
  });
});
