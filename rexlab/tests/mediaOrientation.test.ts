import { describe, expect, it } from "vitest";
import { mediaOrientation } from "../src/mediaOrientation.ts";

// A media query list whose match the test sets.
function portraitQuery(matches: boolean) {
  const target = new EventTarget();
  const queries: string[] = [];
  const list = Object.assign(target, { matches, media: "" }) as unknown as MediaQueryList;
  return {
    queries,
    list,
    matchMedia: (query: string) => {
      queries.push(query);
      return list;
    },
    change: (to: boolean) => {
      (list as { matches: boolean }).matches = to;
      target.dispatchEvent(new Event("change"));
    }
  };
}

describe("mediaOrientation", () => {
  it("reads portrait from the orientation media query and reports each change until unsubscribed", () => {
    const media = portraitQuery(false);
    const orientation = mediaOrientation(media.matchMedia);
    const seen: boolean[] = [];

    const unsubscribe = orientation.subscribe(() => seen.push(orientation.isPortrait()));
    media.change(true);
    media.change(false);
    unsubscribe();
    media.change(true);

    expect(media.queries).toEqual(["(orientation: portrait)"]);
    expect(seen).toEqual([true, false]);
    expect(orientation.isPortrait()).toBe(true);
  });
});
