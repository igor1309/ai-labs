import { describe, it } from "vitest";
import { CASE_TITLE, casesOf, checkFullBasket } from "./sortBasketFitCases.tsx";

// sort-dinosaurs-basket-fit.feature at Explorer.

describe("a full basket", () => {
  it.each(casesOf("Explorer"))(CASE_TITLE, checkFullBasket);
});
