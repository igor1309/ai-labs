#!/usr/bin/env node

import { createRegentaraComposition } from "./composition.js";

export async function main() {
  const { runWorkflow } = createRegentaraComposition();
  const result = await runWorkflow();

  if (result.status === "failed") {
    console.error(result.failureReason);
  }

  return result.exitCode ?? 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const exitCode = await main();
  process.exitCode = exitCode;
}
