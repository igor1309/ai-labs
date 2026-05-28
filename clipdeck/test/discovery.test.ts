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

  test("should ignore nested prompts and unsupported extensions", () => {
    const items = discoverPrompts([
      {
        content: "# Nested\n",
        path: "prompts/sub/bar.md"
      },
      {
        content: "{}",
        path: "prompts/data.json"
      }
    ]);

    expect(items.map((item) => item.id)).toEqual([]);
  });

  test("should accept .txt prompts with title from filename and description from body prefix", () => {
    const items = discoverPrompts([
      {
        content: "Just some text.\n",
        path: "prompts/note.txt"
      }
    ]);

    expect(items.map((item) => [item.id, item.title, item.description])).toEqual([
      ["prompts/note.txt", "note", "Just some text."]
    ]);
  });

  test("should derive prompt title from front matter name when present, then title, then filename", () => {
    const items = discoverPrompts([
      {
        content: "---\nname: Display Name\n---\n# Body\n",
        path: "prompts/named.md"
      },
      {
        content: "---\ntitle: Front Title\n---\n# Body\n",
        path: "prompts/front.md"
      },
      {
        content: "# Body\n",
        path: "prompts/fallback.md"
      }
    ]);

    expect(items.map((item) => item.title)).toEqual(["Display Name", "Front Title", "fallback"]);
  });

  test("should expose prompt subtitle as filename slug when a display name is present", () => {
    const items = discoverPrompts([
      {
        content: "---\nname: Friendly Name\n---\nBody\n",
        path: "prompts/named.md"
      },
      {
        content: "---\ntitle: Titled\n---\nBody\n",
        path: "prompts/titled.md"
      },
      {
        content: "# Body\n",
        path: "prompts/anonymous.md"
      }
    ]);

    expect(items.map((item) => item.subtitle)).toEqual(["named", "titled", undefined]);
  });

  test("should expose prompt description prefix from front matter description, summary, or body fallback", () => {
    const items = discoverPrompts([
      {
        content: "---\ndescription: Detail line\n---\nBody\n",
        path: "prompts/detailed.md"
      },
      {
        content: "---\nsummary: Summary line\n---\nBody\n",
        path: "prompts/summarized.md"
      },
      {
        content: "# Body\n\nMore content here\n",
        path: "prompts/body-fallback.md"
      },
      {
        content: "---\ntitle: Empty\n---\n",
        path: "prompts/empty.md"
      }
    ]);

    expect(items.map((item) => item.description)).toEqual([
      "Detail line",
      "Summary line",
      "# Body\n\nMore content here",
      undefined
    ]);
  });

  test("should expose prompt version from front matter when present", () => {
    const items = discoverPrompts([
      {
        content: "---\nname: With Version\nversion: 0.0.2\n---\nBody\n",
        path: "prompts/versioned.md"
      },
      {
        content: "---\nname: No Version\n---\nBody\n",
        path: "prompts/unversioned.md"
      }
    ]);

    expect(items.map((item) => item.version)).toEqual(["0.0.2", undefined]);
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

  test("should expose skill subtitle from front matter name", () => {
    const items = discoverSkills([
      {
        files: [
          {
            content: "---\nname: example\n---\n# Skill\n",
            path: "dev-skills/public/example/SKILL.md"
          }
        ],
        path: "dev-skills/public/example"
      }
    ]);

    expect(items[0]?.subtitle).toBe("example");
  });

  test("should expose skill description from front matter description or summary", () => {
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

    expect(items[0]?.description).toBe("Short");
  });

  test("should set skill title to the SKILL.md H1 when present", () => {
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

    expect(items[0]?.title).toBe("Pretty Skill Heading");
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

  test("should report missing skill name only when both H1 and name are absent", () => {
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
      "Pretty Skill Heading",
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

    expect(items[0]?.title).toBe("Real Heading");
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
            content: `---\nname: example\ndescription: ${longDescription}\n---\n# Skill\n`,
            path: "dev-skills/public/example/SKILL.md"
          }
        ],
        path: "dev-skills/public/example"
      }
    ]);

    const description = items[0]?.description ?? "";

    expect([description.length, description.endsWith("…"), description.startsWith("aaaa")]).toEqual([
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
            content: "---\nname: example\ndescription: Short detail\n---\n# Skill\n",
            path: "dev-skills/public/example/SKILL.md"
          }
        ],
        path: "dev-skills/public/example"
      }
    ]);

    expect(items[0]?.description).toBe("Short detail");
  });
});
