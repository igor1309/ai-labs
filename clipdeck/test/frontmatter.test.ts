import { describe, expect, test } from "vitest";

import { parse } from "../src/api/frontmatter";

describe("parse", () => {
  test("should return body after well formed front matter delimiter", () => {
    const result = parse("---\ntitle: Example\n---\n\n# Body\n");

    expect(result.body).toBe("\n# Body\n");
  });

  test("should return raw body when front matter has no closing delimiter", () => {
    const raw = "---\ntitle: Example\n# Body\n";

    const result = parse(raw);

    expect(result.body).toBe(raw);
  });

  test("should return raw body when front matter YAML is invalid", () => {
    const raw = "---\ntitle: [\n---\n# Body\n";

    let result = { body: "parser threw" };
    try {
      result = parse(raw);
    } catch {
      result = { body: "parser threw" };
    }

    expect(result.body).toBe(raw);
  });

  test("should return title from front matter", () => {
    const result = parse("---\ntitle: Example\n---\n# Body\n");

    expect(result.title).toBe("Example");
  });

  test("should return raw body when content has no front matter", () => {
    const result = parse("# Body\n");

    expect(result.body).toBe("# Body\n");
  });

  test("should preserve blank line after empty front matter", () => {
    const result = parse("---\n---\n\nbody\n");

    expect(result.body).toBe("\nbody\n");
  });

  test("should return description and summary from front matter", () => {
    const result = parse("---\ndescription: Details\nsummary: Short\n---\n# Body\n");

    expect([result.description, result.summary]).toEqual(["Details", "Short"]);
  });
});
