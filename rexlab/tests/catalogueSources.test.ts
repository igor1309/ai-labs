import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TEXTS } from "../src/language/texts.ts";

describe("the catalogue sources", () => {
  it("names in its note every source of docs/sources.md", () => {
    const sources = readFileSync(join(import.meta.dirname, "../docs/sources.md"), "utf8");
    // Each source is named on its numbered line, before its address or
    // the part of it the facts come from.
    const names = [...sources.matchAll(/^\d+\.\s+(.+)$/gm)].map((match) => (match[1] ?? "").replace(/,?\s*https?:\S+$/, "").replace(/:.*$/, "").replace(/,$/, ""));

    expect(names).toHaveLength(5);
    expect(names.filter((name) => !TEXTS.en.sourceNote.includes(name ?? ""))).toEqual([]);
  });
});
