#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { createRegentaraComposition } from "./composition.js";
import { createDebugReporter } from "./debug-reporter.js";

export async function main(options = {}) {
  const argv = options.argv ?? process.argv.slice(2);
  const stderr = options.stderr ?? process.stderr;
  const composition = options.composition ?? createRegentaraComposition();
  const parsedArguments = parseArguments(argv);
  const debugReporter = createDebugReporter({
    enabled: parsedArguments.debug,
    stderr,
  });
  const task = parsedArguments.taskFile
    ? await readFile(parsedArguments.taskFile, "utf8")
    : parsedArguments.task;
  const result = await composition.runWorkflow({
    debugReporter,
    task,
    ...(parsedArguments.taskFile ? { taskFile: parsedArguments.taskFile } : {}),
  });

  if (result.status === "failed") {
    stderr.write(`${result.failureReason}\n`);
  }

  return result.exitCode ?? 0;
}

export function parseArguments(argv) {
  const parsed = {
    debug: false,
    task: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--debug") {
      parsed.debug = true;
      continue;
    }

    if (argument === "--task") {
      parsed.task = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (argument === "--task-file") {
      parsed.taskFile = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
  }

  return parsed;
}

export function isMainModule(importUrl, argvPath) {
  if (typeof argvPath !== "string") {
    return false;
  }

  return importUrl === pathToFileURL(argvPath).href;
}

if (isMainModule(import.meta.url, process.argv[1])) {
  const exitCode = await main();
  process.exitCode = exitCode;
}
