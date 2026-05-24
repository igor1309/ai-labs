#!/usr/bin/env node

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createReinixComposition } from "../../src/composition.js";

const DEMO_DIRECTORY = dirname(fileURLToPath(import.meta.url));

export function createDemoReviewFixPolicy(options = {}) {
  const maxRemediations = options.maxRemediations ?? 1;

  return {
    decide: async ({ session, verdict }) => {
      if (verdict.verdict === "accepted") {
        return { decision: "complete-ok", session };
      }

      const remediationCount = session?.remediationCount ?? 0;
      if (remediationCount < maxRemediations) {
        return {
          decision: "remediate",
          session: { remediationCount: remediationCount + 1 },
        };
      }

      return { decision: "complete-fail", session };
    },
  };
}

export async function runDemo(options = {}) {
  const homeDirectory = options.homeDirectory
    ?? await mkdtemp(join(tmpdir(), "reinix-local-demo-"));
  const composition = createReinixComposition({
    artifactExists: options.artifactExists,
    commandExists: options.commandExists,
    executeProviderCli: options.executeProviderCli,
    reviewFixPolicy: options.reviewFixPolicy ?? createDemoReviewFixPolicy({
      maxRemediations: options.maxRemediations,
    }),
    runStoreOptions: options.runStoreOptions,
  });

  return composition.runWorkflow({
    homeDirectory,
    task: options.task ?? "Create a concise local demo artifact.",
    taskFile: options.taskFile ?? join(DEMO_DIRECTORY, "task.md"),
    workingDirectory: options.workingDirectory ?? DEMO_DIRECTORY,
  });
}

export async function runFakeDemo(options = {}) {
  return runDemo({
    ...options,
    artifactExists: options.artifactExists ?? (async () => true),
    commandExists: options.commandExists ?? (async () => true),
    executeProviderCli: options.executeProviderCli ?? createDemoProviderCli(),
  });
}

function createDemoProviderCli() {
  return async (input) => {
    if (input.agentId === "producer") {
      return {
        exitStatus: 0,
        semanticResult: {
          artifact: "producer/result.json",
          verification: { ran: true },
        },
      };
    }

    if (input.agentId === "reviewer") {
      const verdict = input.executionInput.task.includes("remediated")
        ? "accepted"
        : "rejected";
      return {
        exitStatus: 0,
        semanticResult: {
          summary: `Demo reviewer summary: verdict=${verdict}.`,
          verdict,
          verification: { ran: true },
        },
      };
    }

    return {
      exitStatus: 0,
      semanticResult: { task: "Create a concise remediated local demo artifact." },
    };
  };
}

function parseArguments(argv) {
  return {
    fakeProviders: argv.includes("--fake-providers"),
  };
}

export function isMainModule(importUrl, argvPath) {
  if (typeof argvPath !== "string") {
    return false;
  }

  return importUrl === pathToFileURL(argvPath).href;
}

if (isMainModule(import.meta.url, process.argv[1])) {
  const parsedArguments = parseArguments(process.argv.slice(2));
  const result = parsedArguments.fakeProviders
    ? await runFakeDemo()
    : await runDemo();
  process.stdout.write(JSON.stringify({
    runDirectory: result.runDirectory,
    runId: result.runId,
    status: result.status,
  }, null, 2));
  process.stdout.write("\n");
  process.exitCode = result.exitCode ?? 0;
}
