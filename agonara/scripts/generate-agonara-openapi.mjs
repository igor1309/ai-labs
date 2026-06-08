#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { generateOpenApiYaml } from "../src/openapi-generator.js";

const openApiPath = process.env.AGONARA_OPENAPI_PATH
  ? new URL(process.env.AGONARA_OPENAPI_PATH, import.meta.url)
  : new URL("../docs/api/openapi.yml", import.meta.url);
const checkMode = process.argv.includes("--check");
const generated = generateOpenApiYaml();

if (checkMode) {
  const committed = readFileSync(openApiPath, "utf8");
  if (committed === generated) {
    process.exit(0);
  }

  console.error("Generated Agonara OpenAPI differs from docs/api/openapi.yml.");
  console.error("Run: node scripts/generate-agonara-openapi.mjs");
  process.exit(1);
}

writeFileSync(openApiPath, generated);
