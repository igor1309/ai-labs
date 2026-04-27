#!/usr/bin/env node

import { createRegentaraComposition } from "./composition.js";

export async function main(options = {}) {
  const argv = options.argv ?? process.argv.slice(2);
  const stderr = options.stderr ?? process.stderr;
  const composition = options.composition ?? createRegentaraComposition();
  const parsedArguments = parseArguments(argv);
  const result = await composition.runWorkflow({
    task: parsedArguments.task,
    workingDirectory: parsedArguments.workingDirectory,
  });

  if (result.status === "failed") {
    stderr.write(`${result.failureReason}\n`);
  }

  return result.exitCode ?? 0;
}

export function parseArguments(argv) {
  const parsed = {
    task: "",
    workingDirectory: process.cwd(),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--task") {
      parsed.task = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (argument === "--working-directory") {
      parsed.workingDirectory = argv[index + 1] ?? process.cwd();
      index += 1;
    }
  }

  return parsed;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const exitCode = await main();
  process.exitCode = exitCode;
}
