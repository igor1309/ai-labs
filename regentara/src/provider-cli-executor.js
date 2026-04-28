import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { RuntimeFailure } from "./errors.js";
import { validateRuntimeOutput } from "./runtime-output.js";

export async function executeProviderCli(input, dependencies = {}) {
  const runnerAdapters = dependencies.runnerAdapters ?? DEFAULT_RUNNER_ADAPTERS;
  const runnerAdapter = runnerAdapters.get?.(input.runner) ?? runnerAdapters[input.runner];

  if (!runnerAdapter) {
    throw new RuntimeFailure(`no provider structured result adapter for runner: ${input.runner}`);
  }

  return runnerAdapter(input, dependencies);
}

const DEFAULT_RUNNER_ADAPTERS = new Map([
  ["claude-code", executeClaudeCode],
  ["codex", executeCodex],
]);

async function executeClaudeCode(input, dependencies = {}) {
  const spawnProvider = dependencies.spawnProvider ?? spawnProviderCli;
  const execution = await spawnProvider({
    args: [
      "-p",
      "--output-format",
      "json",
      "--json-schema",
      JSON.stringify(input.outputSchema),
      input.prompt,
    ],
    command: "claude",
    cwd: process.cwd(),
    model: input.model,
    stdin: "",
  });

  assertZeroExitStatus(execution);
  const wrapper = parseSemanticJson(execution.stdout, input.runner);
  if (!Object.prototype.hasOwnProperty.call(wrapper, "structured_output")) {
    throw new RuntimeFailure(`provider semantic result missing for runner: ${input.runner}`);
  }

  return makeResult(execution, {
    semanticResult: validateRuntimeOutput(input.agentId, wrapper.structured_output, input.outputSchema),
    sessionReference: wrapper.session_id ?? execution.sessionReference,
  });
}

async function executeCodex(input, dependencies = {}) {
  const spawnProvider = dependencies.spawnProvider ?? spawnProviderCli;
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "regentara-codex-"));
  const outputPath = join(temporaryDirectory, "last-message.json");
  const schemaPath = join(temporaryDirectory, "output-schema.json");

  await writeFile(schemaPath, JSON.stringify(input.outputSchema));
  const execution = await spawnProvider({
    args: [
      "exec",
      "--output-schema",
      schemaPath,
      "--output-last-message",
      outputPath,
      input.prompt,
    ],
    command: "codex",
    cwd: process.cwd(),
    model: input.model,
    stdin: "",
  });

  assertZeroExitStatus(execution);
  const semanticOutput = await readSemanticOutputFile(outputPath, input.runner);

  return makeResult(execution, {
    semanticResult: validateRuntimeOutput(input.agentId, semanticOutput, input.outputSchema),
    sessionReference: execution.sessionReference,
  });
}

function assertZeroExitStatus(execution) {
  if (execution.exitStatus === 0) {
    return;
  }

  throw new RuntimeFailure(`provider CLI exited non-zero: ${execution.exitStatus}`, {
    cause: execution,
  });
}

async function readSemanticOutputFile(outputPath, runner) {
  let output;

  try {
    output = await readFile(outputPath, "utf8");
  } catch (error) {
    throw new RuntimeFailure(`provider semantic result missing for runner: ${runner}`, { cause: error });
  }

  return parseSemanticJson(output, runner);
}

function parseSemanticJson(output, runner) {
  try {
    return JSON.parse(output);
  } catch (error) {
    throw new RuntimeFailure(`provider semantic result is not valid JSON for runner: ${runner}`, { cause: error });
  }
}

function makeResult(execution, overrides = {}) {
  return {
    exitStatus: execution.exitStatus,
    rawStdout: execution.stdout,
    runnerReference: execution.runnerReference,
    sessionReference: overrides.sessionReference,
    stderrReference: summarizeOutput(execution.stderr),
    stdoutReference: summarizeOutput(execution.stdout),
    semanticResult: overrides.semanticResult,
  };
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

function summarizeOutput(output) {
  if (!output) {
    return undefined;
  }

  return output.slice(0, 4096);
}
