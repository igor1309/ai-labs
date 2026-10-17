import { describe, expect, it } from "vitest";
import { documentVisibility } from "../src/documentVisibility.ts";
import { browserDocument } from "./support.ts";

describe("documentVisibility", () => {
  it("reads hidden from the document's visibility and reports each change until unwatched", () => {
    const page = browserDocument("visible");
    const visibility = documentVisibility(page.document);
    const seen: boolean[] = [];
    expect(visibility.hidden()).toBe(false);

    const unwatch = visibility.watch(() => seen.push(visibility.hidden()));
    page.switchTo("hidden");
    page.switchTo("visible");
    unwatch();
    page.switchTo("hidden");

    expect(seen).toEqual([true, false]);
    expect(visibility.hidden()).toBe(true);
  });
});
