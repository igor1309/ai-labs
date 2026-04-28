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
      "--model",
      input.model,
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

  const wrapper = parseOptionalJson(execution.stdout);
  Object.assign(execution, extractProviderDiagnostics({
    stderr: execution.stderr,
    stdout: execution.stdout,
    wrapper,
  }));
  assertZeroExitStatus(execution);
  const semanticWrapper = wrapper ?? parseSemanticJson(execution.stdout, input.runner);
  if (!Object.prototype.hasOwnProperty.call(semanticWrapper, "structured_output")) {
    throw new RuntimeFailure(`provider semantic result missing for runner: ${input.runner}`);
  }

  return makeResult(execution, {
    semanticResult: validateRuntimeOutput(input.agentId, semanticWrapper.structured_output, input.outputSchema),
    sessionReference: semanticWrapper.session_id ?? execution.sessionReference,
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
      "--model",
      input.model,
      ...codexConfigArguments(input),
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

  execution.sessionReference ??= extractCodexSessionReference(execution.stderr);
  Object.assign(execution, extractProviderDiagnostics({
    stderr: execution.stderr,
    stdout: execution.stdout,
  }));
  assertZeroExitStatus(execution);
  const semanticOutput = await readSemanticOutputFile(outputPath, input.runner);

  return makeResult(execution, {
    semanticResult: validateRuntimeOutput(input.agentId, semanticOutput, input.outputSchema),
    sessionReference: execution.sessionReference,
  });
}

function codexConfigArguments(input) {
  if (!input.reasoningEffort) {
    return [];
  }

  return ["--config", `model_reasoning_effort="${input.reasoningEffort}"`];
}

function extractCodexSessionReference(stderr) {
  const match = stderr?.match(/^session id: ([^\s]+)$/m);

  return match?.[1];
}

function assertZeroExitStatus(execution) {
  if (execution.exitStatus === 0) {
    return;
  }

  execution.providerError ??= "provider_cli_error";
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
  return compact({
    costUsd: execution.costUsd,
    durationMs: execution.durationMs,
    exitStatus: execution.exitStatus,
    providerError: execution.providerError,
    providerStatus: execution.providerStatus,
    rawStdout: execution.stdout,
    runnerReference: execution.runnerReference,
    sessionReference: overrides.sessionReference,
    stderrReference: summarizeOutput(execution.stderr),
    stdoutReference: summarizeOutput(execution.stdout),
    semanticResult: overrides.semanticResult,
  });
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

function parseOptionalJson(output) {
  try {
    return JSON.parse(output);
  } catch {
    return undefined;
  }
}

function extractProviderDiagnostics({ stderr = "", stdout = "", wrapper }) {
  const output = `${stdout}\n${stderr}\n${typeof wrapper?.result === "string" ? wrapper.result : ""}`;
  const costUsd = extractCostUsd(wrapper, output);
  const durationMs = numberOrUndefined(wrapper?.duration_ms);
  const providerStatus = numberOrUndefined(wrapper?.api_error_status) ?? extractHttpStatus(output);
  const providerError = extractProviderError(wrapper, output);

  return compact({
    costUsd,
    durationMs,
    providerError,
    providerStatus,
  });
}

function extractCostUsd(wrapper, output) {
  const wrapperCost = numberOrUndefined(wrapper?.total_cost_usd)
    ?? sumModelUsageCost(wrapper?.modelUsage);
  if (wrapperCost !== undefined) {
    return wrapperCost;
  }

  const patterns = [
    /"total_cost_usd"\s*:\s*([0-9.]+)/i,
    /"costUSD"\s*:\s*([0-9.]+)/,
    /total cost(?: usd)?\s*[:=]\s*\$?([0-9.]+)/i,
    /cost\s*[:=]\s*\$([0-9.]+)/i,
  ];

  for (const pattern of patterns) {
    const match = output.match(pattern);
    const cost = numberOrUndefined(match?.[1]);
    if (cost !== undefined) {
      return cost;
    }
  }

  return undefined;
}

function sumModelUsageCost(modelUsage) {
  if (!modelUsage || typeof modelUsage !== "object") {
    return undefined;
  }

  let total = 0;
  let found = false;
  for (const usage of Object.values(modelUsage)) {
    const cost = numberOrUndefined(usage?.costUSD);
    if (cost !== undefined) {
      total += cost;
      found = true;
    }
  }

  return found ? total : undefined;
}

function extractProviderError(wrapper, output) {
  const typedError = output.match(/"type"\s*:\s*"([a-z_]+_error)"/i)?.[1];
  if (typedError) {
    return typedError;
  }

  const nestedTypedError = output.match(/"error"\s*:\s*\{[^}]*"type"\s*:\s*"([a-z_]+_error)"/i)?.[1];
  if (nestedTypedError) {
    return nestedTypedError;
  }

  const wrapperError = firstString(
    wrapper?.error?.type,
    wrapper?.error_type,
    wrapper?.is_error ? "provider_error" : undefined,
  );
  if (wrapperError) {
    return wrapperError;
  }

  const httpStatus = extractHttpStatus(output);
  if (httpStatus !== undefined) {
    return `http_${httpStatus}`;
  }

  if (/timed?\s*out|timeout/i.test(output)) {
    return "timeout";
  }

  if (/permission|forbidden|unauthorized|authentication/i.test(output)) {
    return "auth_or_permission";
  }

  if (/rate.?limit/i.test(output)) {
    return "rate_limit";
  }

  return undefined;
}

function extractHttpStatus(output) {
  const match = output.match(/\b(?:status|error|API Error)[:\s]+([45][0-9]{2})\b/i)
    ?? output.match(/\b([45][0-9]{2})\s+(?:Forbidden|Unauthorized|Too Many Requests|Internal Server Error|Bad Gateway|Service Unavailable)\b/i);
  return numberOrUndefined(match?.[1]);
}

function numberOrUndefined(value) {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.length > 0);
}

function compact(fields) {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
}
