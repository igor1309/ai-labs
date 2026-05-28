import { svelte } from "@sveltejs/vite-plugin-svelte";
import { svelteTesting } from "@testing-library/svelte/vite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

const REQUIRED_BUILD_ENV = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"] as const;
const ENV_DIR = fileURLToPath(new URL(".", import.meta.url));
const PACKAGE_JSON_PATH = fileURLToPath(new URL("package.json", import.meta.url));
const FRONTEND_VERSION = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8")).version;

export default defineConfig(({ command, mode }) => {
  if (command === "build") {
    validateRequiredBuildEnv(loadEnv(mode, ENV_DIR, "VITE_"));
  }

  return {
    build: {
      outDir: "dist"
    },
    define: {
      __NOTIO_FRONTEND_VERSION__: JSON.stringify(FRONTEND_VERSION)
    },
    plugins: [svelte(), svelteTesting()],
    test: {
      environment: "jsdom"
    }
  };
});

function validateRequiredBuildEnv(env: Record<string, string>): void {
  const missingNames = REQUIRED_BUILD_ENV.filter((name) => {
    const value = env[name];
    return typeof value !== "string" || value.trim().length === 0;
  });

  if (missingNames.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missingNames.join(", ")}`);
  }
}
