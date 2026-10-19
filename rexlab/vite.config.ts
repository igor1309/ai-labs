import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { stampVersion } from "./src/release.ts";

const PACKAGE_JSON = new URL("package.json", import.meta.url);
const VERSION = `v${JSON.parse(readFileSync(PACKAGE_JSON, "utf8")).version}`;

// The version is written into the static HTML, so the deploy smoke check
// can read it with a plain fetch, without running the page's scripts.
export default defineConfig({
  build: {
    outDir: "dist",
    // The care mission prototype (LAB-281) is a page of its own, linked
    // from nowhere in the game.
    rolldownOptions: {
      input: {
        main: "index.html",
        careMission: "prototypes/care-mission.html"
      }
    }
  },
  plugins: [
    react(),
    {
      name: "rexlab-version",
      transformIndexHtml: (html) => stampVersion(html, VERSION)
    }
  ],
  test: {
    projects: [
      {
        extends: true,
        test: { name: "node", include: ["tests/**/*.test.ts"], environment: "node" }
      },
      {
        extends: true,
        test: { name: "dom", include: ["tests/**/*.test.tsx"], environment: "jsdom", setupFiles: ["tests/setup.ts"] }
      }
    ]
  }
});
