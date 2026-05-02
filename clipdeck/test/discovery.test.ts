import { describe, expect, test } from "vitest";

import { discoverPrompts, discoverSkills } from "../src/api/discovery";

describe("discoverPrompts", () => {
  test("should return direct markdown prompt items", () => {
    const items = discoverPrompts([
      {
        content: "# Prompt\n",
        path: "prompts/foo.md"
      }
    ]);

    expect(items.map((item) => item.id)).toEqual(["prompts/foo.md"]);
  });

  test("should ignore nested prompts and non markdown prompt files", () => {
    const items = discoverPrompts([
      {
        content: "# Nested\n",
        path: "prompts/sub/bar.md"
      },
      {
        content: "# Text\n",
        path: "prompts/readme.txt"
      }
    ]);

    expect(items.map((item) => item.id)).toEqual([]);
  });

  test("should derive prompt title and subtitle from front matter or filename", () => {
    const items = discoverPrompts([
      {
        content: "---\ntitle: Front Title\ndescription: Details\n---\n# Body\n",
        path: "prompts/front.md"
      },
      {
        content: "# Body\n",
        path: "prompts/fallback.md"
      }
    ]);

    expect(items.map((item) => [item.title, item.subtitle])).toEqual([
      ["Front Title", "Details"],
      ["fallback", ""]
    ]);
  });
});

describe("discoverSkills", () => {
  test("should return standalone skill items for folders containing only SKILL markdown", () => {
    const items = discoverSkills([
      {
        files: [
          {
            content: "# Example\n",
            path: "dev-skills/public/example/SKILL.md"
          }
        ],
        path: "dev-skills/public/example"
      }
    ]);

    expect(items.map((item) => item.skillShape)).toEqual(["standalone"]);
  });

  test("should return resource backed skill items when skill folder has sibling files", () => {
    const items = discoverSkills([
      {
        files: [
          {
            content: "# Example\n",
            path: "dev-skills/public/example/SKILL.md"
          },
          {
            content: "print('helper')\n",
            path: "dev-skills/public/example/helper.py"
          }
        ],
        path: "dev-skills/public/example"
      }
    ]);

    expect(items.map((item) => item.skillShape)).toEqual(["resource-backed"]);
  });

  test("should ignore skill folders without SKILL markdown", () => {
    const items = discoverSkills([
      {
        files: [
          {
            content: "# Notes\n",
            path: "dev-skills/public/example/README.md"
          }
        ],
        path: "dev-skills/public/example"
      }
    ]);

    expect(items.map((item) => item.id)).toEqual([]);
  });

  test("should derive skill subtitle from front matter description or summary", () => {
    const items = discoverSkills([
      {
        files: [
          {
            content: "---\nname: example\nsummary: Short\n---\n# Skill\n",
            path: "dev-skills/public/example/SKILL.md"
          }
        ],
        path: "dev-skills/public/example"
      }
    ]);

    expect(items.map((item) => item.subtitle)).toEqual(["Short"]);
  });

  test("should compose skill title as '<H1> (<name>)' when both are present", () => {
    const items = discoverSkills([
      {
        files: [
          {
            content: "---\nname: example\n---\n# Pretty Skill Heading\n\nbody\n",
            path: "dev-skills/public/example/SKILL.md"
          }
        ],
        path: "dev-skills/public/example"
      }
    ]);

    expect(items[0]?.title).toBe("Pretty Skill Heading (example)");
  });

  test("should fall back to front matter name when SKILL.md H1 is missing", () => {
    const items = discoverSkills([
      {
        files: [
          {
            content: "---\nname: example\n---\n## Subheading only\n\nbody without h1\n",
            path: "dev-skills/public/example/SKILL.md"
          }
        ],
        path: "dev-skills/public/example"
      }
    ]);

    expect(items[0]?.title).toBe("example");
  });

  test("should report missing skill name regardless of H1", () => {
    const items = discoverSkills([
      {
        files: [
          {
            content: "---\nversion: \"1.0.0\"\n---\n# Pretty Skill Heading\n",
            path: "dev-skills/public/no-name-but-h1/SKILL.md"
          }
        ],
        path: "dev-skills/public/no-name-but-h1"
      },
      {
        files: [
          {
            content: "no front matter and no h1\n",
            path: "dev-skills/public/totally-empty/SKILL.md"
          }
        ],
        path: "dev-skills/public/totally-empty"
      }
    ]);

    expect(items.map((item) => item.title)).toEqual([
      "error: no skill name",
      "error: no skill name"
    ]);
  });

  test("should pick the first H1 when the body contains multiple headings", () => {
    const items = discoverSkills([
      {
        files: [
          {
            content: "---\nname: example\n---\n## Subheading\n\n# Real Heading\n\n# Second Heading\n",
            path: "dev-skills/public/example/SKILL.md"
          }
        ],
        path: "dev-skills/public/example"
      }
    ]);

    expect(items[0]?.title).toBe("Real Heading (example)");
  });

  test("should expose skill version from front matter", () => {
    const items = discoverSkills([
      {
        files: [
          {
            content: "---\nname: example\nversion: \"1.2.3\"\ndescription: Details\n---\n# Skill\n",
            path: "dev-skills/public/example/SKILL.md"
          }
        ],
        path: "dev-skills/public/example"
      },
      {
        files: [
          {
            content: "---\nname: noversion\ndescription: Details\n---\n# Skill\n",
            path: "dev-skills/public/noversion/SKILL.md"
          }
        ],
        path: "dev-skills/public/noversion"
      }
    ]);

    expect(items.map((item) => item.version)).toEqual(["1.2.3", undefined]);
  });

  test("should truncate long descriptions to a reasonably long prefix with ellipsis", () => {
    const longDescription = "a".repeat(250);
    const items = discoverSkills([
      {
        files: [
          {
            content: `---\ndescription: ${longDescription}\n---\n# Skill\n`,
            path: "dev-skills/public/example/SKILL.md"
          }
        ],
        path: "dev-skills/public/example"
      }
    ]);

    const subtitle = items[0]?.subtitle ?? "";

    expect([subtitle.length, subtitle.endsWith("…"), subtitle.startsWith("aaaa")]).toEqual([
      201,
      true,
      true
    ]);
  });

  test("should leave short descriptions untouched", () => {
    const items = discoverSkills([
      {
        files: [
          {
            content: "---\ndescription: Short detail\n---\n# Skill\n",
            path: "dev-skills/public/example/SKILL.md"
          }
        ],
        path: "dev-skills/public/example"
      }
    ]);

    expect(items[0]?.subtitle).toBe("Short detail");
  });
});
