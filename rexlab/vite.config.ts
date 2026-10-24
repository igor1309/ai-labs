import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { WORKER_FILE } from "./src/offline/registerWorker.ts";
import { releaseFiles, workerCode } from "./src/offline/workerBuild.ts";
import { stampVersion } from "./src/release.ts";

const PACKAGE_JSON = new URL("package.json", import.meta.url);
const VERSION = `v${JSON.parse(readFileSync(PACKAGE_JSON, "utf8")).version}`;
const PUBLIC = fileURLToPath(new URL("public/", import.meta.url));

// The files of the public directory, which the build copies as they are.
const publicFiles = () => readdirSync(PUBLIC, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => relative(PUBLIC, join(entry.parentPath, entry.name)));

// The version is written into the static HTML, so the deploy smoke check
// can read it with a plain fetch, without running the page's scripts.
export default defineConfig({
  build: {
    outDir: "dist",
    // The hatch and grow care prototype (LAB-387) is a page of its own,
    // linked from nowhere in the game.
    rolldownOptions: {
      input: {
        main: "index.html",
        careHatch: "prototypes/care-hatch.html",
        sw: "src/offline/sw.ts"
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === "sw" ? WORKER_FILE : "assets/[name]-[hash].js")
      }
    }
  },
  plugins: [
    react(),
    {
      name: "rexlab-version",
      transformIndexHtml: (html) => stampVersion(html, VERSION)
    },
    // The service worker learns the release's version and every file it
    // keeps offline once the build has named them.
    {
      name: "rexlab-offline",
      apply: "build",
      generateBundle(_, bundle) {
        const worker = bundle[WORKER_FILE];
        if (worker?.type !== "chunk") throw new Error(`The build wrote no ${WORKER_FILE}`);
        if (worker.imports.length > 0) throw new Error(`${WORKER_FILE} imports ${worker.imports.join(", ")}: a worker must be one file`);
        worker.code = workerCode(worker.code, VERSION, releaseFiles([...Object.keys(bundle), ...publicFiles()]));
      }
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
