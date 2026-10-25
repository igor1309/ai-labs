import { describe, expect, it, onTestFinished } from "vitest";
import { inCard } from "./catalogueCards.ts";

// A list of three cards, each a footer, under `css`.
function list(css: string) {
  const sheet = Object.assign(document.createElement("style"), { textContent: css });
  const grid = document.createElement("div");
  grid.className = "catalogue-grid";
  grid.innerHTML = ["a", "b", "c"].map((id) => `<button class="catalogue-card" data-id="${id}" aria-label="${id}"><span class="catalogue-footer"></span></button>`).join("");
  document.head.append(sheet);
  document.body.append(grid);
  onTestFinished(() => {
    sheet.remove();
    grid.remove();
  });
  return [...grid.querySelectorAll(".catalogue-footer")];
}

describe("a card part's value, shared between cards shaped alike", () => {
  it("is each card's own where a rule tells the cards apart by their places", () => {
    const footers = list(".catalogue-footer { padding-inline: 12px; padding-left: 12px; } .catalogue-card:last-child .catalogue-footer { padding-inline: 150px; } .catalogue-card + .catalogue-card .catalogue-footer { padding-left: 4px; }");
    expect(footers.map((footer) => inCard(footer, 200, "padding-inline"))).toEqual(["12px", "12px", "150px"]);
    expect(footers.map((footer) => inCard(footer, 200, "padding-left"))).toEqual(["12px", "4px", "4px"]);
  });

  it("is worked out afresh once the page may have changed", async () => {
    const footers = list(".catalogue-footer { padding-inline: 12px; } html[data-size=\"tall-narrow\"] .catalogue-footer { padding-inline: 20px; }");
    delete document.documentElement.dataset.size;
    expect(footers.map((footer) => inCard(footer, 200, "padding-inline"))).toEqual(["12px", "12px", "12px"]);
    document.documentElement.dataset.size = "tall-narrow";
    onTestFinished(() => void delete document.documentElement.dataset.size);
    // The root's attributes are in a part's shape, so even within one turn
    // a change there is seen; and the next turn starts afresh.
    expect(inCard(footers[0]!, 200, "padding-inline")).toBe("20px");
    await Promise.resolve();
    expect(footers.map((footer) => inCard(footer, 200, "padding-inline"))).toEqual(["20px", "20px", "20px"]);
  });
});
