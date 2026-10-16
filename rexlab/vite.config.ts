import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import { stampVersion } from "./src/release.ts";

const PACKAGE_JSON = new URL("package.json", import.meta.url);
const VERSION = `v${JSON.parse(readFileSync(PACKAGE_JSON, "utf8")).version}`;

// The version is written into the static HTML, so the deploy smoke check
// can read it with a plain fetch, without running the page's scripts.
export default defineConfig({
  build: {
    outDir: "dist"
  },
  plugins: [
    {
      name: "rexlab-version",
      transformIndexHtml: (html) => stampVersion(html, VERSION)
    }
  ]
});
