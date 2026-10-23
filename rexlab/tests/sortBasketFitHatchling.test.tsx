import { describe, it } from "vitest";
import { CASE_TITLE, casesOf, checkFullBasket } from "./sortBasketFitCases.tsx";

// sort-dinosaurs-basket-fit.feature at Hatchling.

describe("a full basket", () => {
  it.each(casesOf("Hatchling"))(CASE_TITLE, checkFullBasket);
});
