import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const SUPABASE_SDK_IMPORT = "@supabase/supabase-js";
const SUPABASE_SDK_ALLOWED_PATHS = [
  "src/auth/SupabaseAuthSession.ts",
  "src/browse/SupabaseBrowseItemsReader.ts",
  "src/main.ts"
];

describe("local browser testing import boundaries", () => {
  it("supabaseSdkImports shouldStayWithinAllowlist_onFrontendSource", () => {
    expect(findFilesContaining("src", SUPABASE_SDK_IMPORT)).toEqual(SUPABASE_SDK_ALLOWED_PATHS);
  });

  it("supabaseSdkImports shouldStayOutOfLocalBrowserTestingAdapters", () => {
    expect(findFilesContaining("src/local-browser-testing", SUPABASE_SDK_IMPORT)).toEqual([]);
  });

  it("serviceRoleConfig shouldStayOutOfFrontendFiles", () => {
    const serviceRolePatterns = [
      ["SERVICE", "ROLE"].join("_"),
      ["service", "role"].join("_"),
      ["VITE", "SUPABASE", "SERVICE"].join("_")
    ];

    expect(serviceRolePatterns.flatMap(($0) => findFilesContaining(".", $0))).toEqual([]);
  });
});

function findFilesContaining(root: string, text: string): string[] {
  if (!existsSync(root)) {
    return [];
  }

  return listFiles(root)
    .filter(($0) => readFileSync($0, "utf8").includes(text))
    .sort();
}

function listFiles(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      if ([".svelte-kit", ".vite", "dist", "node_modules"].includes(name)) {
        return [];
      }

      return listFiles(path);
    }
    if (!/\.(svelte|ts|js|json|toml|yml|yaml)$/.test(path)) {
      return [];
    }

    return [path];
  });
}
