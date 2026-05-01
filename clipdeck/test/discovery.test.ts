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

  test("should derive skill title and subtitle from front matter or folder name", () => {
    const items = discoverSkills([
      {
        files: [
          {
            content: "---\ntitle: Skill Title\nsummary: Short\n---\n# Skill\n",
            path: "dev-skills/public/example/SKILL.md"
          }
        ],
        path: "dev-skills/public/example"
      },
      {
        files: [
          {
            content: "# Skill\n",
            path: "dev-skills/public/fallback/SKILL.md"
          }
        ],
        path: "dev-skills/public/fallback"
      }
    ]);

    expect(items.map((item) => [item.title, item.subtitle])).toEqual([
      ["Skill Title", "Short"],
      ["fallback", ""]
    ]);
  });
});
