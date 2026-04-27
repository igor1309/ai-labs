import { spawn } from "node:child_process";

import { RuntimeFailure } from "./errors.js";

export async function executeProviderCli(input, dependencies = {}) {
  const spawnProvider = dependencies.spawnProvider ?? spawnProviderCli;
  const execution = await spawnProvider({
    args: ["--model", input.model],
    command: input.runner,
    cwd: input.workingDirectory,
    stdin: JSON.stringify(input.executionInput ?? {}),
  });

  const result = {
    exitStatus: execution.exitStatus,
    jsonOutput: parseJsonOutput(execution.stdout),
    runnerReference: execution.runnerReference,
    sessionReference: execution.sessionReference,
    stderrReference: summarizeOutput(execution.stderr),
    stdoutReference: summarizeOutput(execution.stdout),
  };

  if (execution.exitStatus !== 0) {
    throw new RuntimeFailure(`provider CLI exited non-zero: ${execution.exitStatus}`, {
      cause: result,
    });
  }

  return result;
}

function spawnProviderCli({ args, command, cwd, stdin }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (exitStatus) => {
      resolve({
        exitStatus,
        stderr,
        stdout,
      });
    });
    child.stdin.end(stdin);
  });
}

function parseJsonOutput(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    return undefined;
  }
}

function summarizeOutput(output) {
  if (!output) {
    return undefined;
  }

  return output.slice(0, 4096);
}
