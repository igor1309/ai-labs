import { describe, expect, test } from "vitest";

import { discoverSkills, type SourceFolder } from "../src/api/discovery";

type ViteImportMeta = ImportMeta & {
  glob: (pattern: string, options: { eager: true; import: string; query: string }) => Record<string, string>;
};

const skillFiles = (import.meta as ViteImportMeta).glob("../../dev-skills/public/*/SKILL.md", {
  eager: true,
  import: "default",
  query: "?raw"
});

const realFolders: SourceFolder[] = Object.entries(skillFiles).map(([globPath, content]) => {
  const folderName = globPath.replace(/^.*\/dev-skills\/public\//, "").replace(/\/SKILL\.md$/, "");
  const folderPath = `dev-skills/public/${folderName}`;
  return {
    files: [{ content, path: `${folderPath}/SKILL.md` }],
    path: folderPath
  };
});

const namesByFolder = new Map(
  Object.entries(skillFiles).map(([globPath, content]) => {
    const folderName = globPath.replace(/^.*\/dev-skills\/public\//, "").replace(/\/SKILL\.md$/, "");
    const nameMatch = content.match(/^name:\s*(.+?)\s*$/m);
    return [folderName, nameMatch?.[1]] as const;
  })
);

describe("discoverSkills against real dev-skills/public/ SKILL.md files", () => {
  test("should discover at least one real skill folder", () => {
    expect(realFolders.length).toBeGreaterThan(0);
  });

  test("should produce one item per real SKILL.md", () => {
    const items = discoverSkills(realFolders);
    expect(items.length).toBe(realFolders.length);
  });

  test("should never emit the no-skill-name error for real skills", () => {
    const items = discoverSkills(realFolders);
    const broken = items.filter((item) => item.title === "error: no skill name");
    expect(broken.map((item) => item.id)).toEqual([]);
  });

  test("should set subtitle to the front matter name for every real skill", () => {
    const items = discoverSkills(realFolders);
    const mismatched = items.filter((item) => {
      const folderName = item.id.replace("dev-skills/public/", "").replace("/SKILL.md", "");
      return item.subtitle !== namesByFolder.get(folderName);
    });
    expect(mismatched.map((item) => item.id)).toEqual([]);
  });

  test("should populate non-empty descriptions for every real skill", () => {
    const items = discoverSkills(realFolders);
    const empty = items.filter((item) => item.description === undefined || item.description.length === 0);
    expect(empty.map((item) => item.id)).toEqual([]);
  });

  test("should never include the front matter name parenthetical in real skill titles", () => {
    const items = discoverSkills(realFolders);
    const titlesWithName = items.filter((item) => {
      return item.subtitle !== undefined && item.title.endsWith(`(${item.subtitle})`);
    });
    expect(titlesWithName.map((item) => item.id)).toEqual([]);
  });

  test("should strip front matter from real skill bodies", () => {
    const items = discoverSkills(realFolders);
    const leaked = items.filter((item) => item.body.startsWith("---"));
    expect(leaked.map((item) => item.id)).toEqual([]);
  });
});
