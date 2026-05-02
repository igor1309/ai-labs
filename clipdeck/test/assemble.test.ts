import { describe, expect, test } from "vitest";

import { assembleSections } from "../src/api/assemble";
import type { Item } from "../src/api/discovery";

describe("assembleSections", () => {
  test("should return prompts section before skills section", () => {
    const sections = assembleSections([], []);

    expect(sections.map((section) => section.id)).toEqual(["prompts", "skills"]);
  });

  test("should sort items inside each section by id", () => {
    const sections = assembleSections([
      makeItem("prompts/zeta.md", "prompt"),
      makeItem("prompts/alpha.md", "prompt")
    ], []);

    expect(sections[0]?.items.map((item) => item.id)).toEqual([
      "prompts/alpha.md",
      "prompts/zeta.md"
    ]);
  });

  test("should sort items by byte order for punctuation and case", () => {
    const sections = assembleSections([
      makeItem("prompts/_a.md", "prompt"),
      makeItem("prompts/B.md", "prompt"),
      makeItem("prompts/.a.md", "prompt"),
      makeItem("prompts/-a.md", "prompt")
    ], []);

    expect(sections[0]?.items.map((item) => item.id)).toEqual([
      "prompts/-a.md",
      "prompts/.a.md",
      "prompts/B.md",
      "prompts/_a.md"
    ]);
  });

  test("should emit empty items arrays for empty sections", () => {
    const sections = assembleSections([], []);

    expect(sections.map((section) => section.items)).toEqual([[], []]);
  });
});

function makeItem(id: string, kind: Item["kind"]): Item {
  return {
    body: "",
    id,
    kind,
    subtitle: "",
    title: id
  };
}
