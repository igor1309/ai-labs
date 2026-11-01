import { describe, it } from "vitest";
import { CASE_TITLE, casesOf, checkFullBasket } from "./sortBasketFitCases.tsx";

// sort-dinosaurs-basket-fit.feature at Paleontologist.

describe("a full basket", () => {
  it.each(casesOf("Paleontologist"))(CASE_TITLE, checkFullBasket);
});
