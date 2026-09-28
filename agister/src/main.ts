import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { EFFORTS, listProfiles, loadProfile, RUNTIMES, saveProfile, type AgentProfile, type Runtime } from "./agents.js";
import { claudeCodeAdapter } from "./claude-code.js";
import { codexAdapter } from "./codex.js";
import {
  defaultBase,
  formatReview,
  resolveReviewTarget,
  REVIEW_INSTRUCTION,
  REVIEW_OUTPUT_SCHEMA,
  reviewPolicy,
  reviewPrompt,
  validateReviewResult,
  withCandidateWorktree,
} from "./review.js";
import { createRun, listRuns, newRunId, readRun, type RunRecord } from "./run-store.js";
import type { ExecutionPolicy, RuntimeAdapter, RuntimeEvent, TurnRequest, TurnResult } from "./runtime.js";

export const EXIT = { ok: 0, changesRequested: 1, runFailed: 2, usage: 64 } as const;

const USAGE = `agister — run agent-backed processes through provider runtimes

Usage:
  agister agent create <name> [--runtime claude-code|codex] [--model <m>] [--effort <e>] [--command <path>] [--force]
  agister agent list
  agister run <agent> [--prompt <text>] [--timeout 10m] [--json]
                     [--tools Read,Grep] [--allow <rule,...>]   (claude-code only)
  agister review [--agent reviewer] [--base <rev>] [--candidate HEAD] [--timeout 20m] [--json]
  agister runs [list]
  agister runs show <run-id>

Options:
  --state-dir <dir>   Agister state directory (default: ./.agister, or $AGISTER_STATE_DIR)
  --quiet             Do not print progress to stderr

Exit codes: 0 ok, 1 review requested changes, 2 run failed, 64 usage error.`;

export interface Io {
  cwd: string;
  env: Record<string, string | undefined>;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  stdin: () => Promise<string>;
  signal?: AbortSignal;
}

class UsageError extends Error {}

export async function main(argv: string[], io: Io): Promise<number> {
  try {
    return await dispatch(argv, io);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.stderr(`agister: ${message}\n`);
    if (error instanceof UsageError) {
      io.stderr(`\n${USAGE}\n`);
      return EXIT.usage;
    }
    return EXIT.runFailed;
  }
}

async function dispatch(argv: string[], io: Io): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      "state-dir": { type: "string" },
      quiet: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      force: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
      model: { type: "string" },
      effort: { type: "string" },
      runtime: { type: "string" },
      command: { type: "string" },
      prompt: { type: "string" },
      tools: { type: "string" },
      allow: { type: "string" },
      timeout: { type: "string" },
      agent: { type: "string" },
      base: { type: "string" },
      candidate: { type: "string" },
    },
  });

  if (values.help || positionals.length === 0) {
    io.stdout(`${USAGE}\n`);
    return values.help ? EXIT.ok : EXIT.usage;
  }

  const stateDirectory = resolve(io.cwd, values["state-dir"] ?? io.env["AGISTER_STATE_DIR"] ?? ".agister");
  const progress = values.quiet ? () => {} : (event: RuntimeEvent) => {
    const line = describeEvent(event);
    if (line) io.stderr(`${line}\n`);
  };
  const [command, subcommand, ...rest] = positionals;

  switch (command) {
    case "agent": {
      if (subcommand === "create") {
        const name = rest[0] ?? usage("agent create needs a name");
        const runtime = (values.runtime ?? "claude-code") as Runtime;
        if (!(RUNTIMES as readonly string[]).includes(runtime)) usage(`unsupported runtime: ${runtime}`);
        if (values.effort && !EFFORTS[runtime].includes(values.effort)) {
          usage(`unsupported ${runtime} effort: ${values.effort} (supported: ${EFFORTS[runtime].join(", ")})`);
        }
        const profile: AgentProfile = { name, runtime, session: "fresh-only" };
        if (values.model) profile.model = values.model;
        if (values.effort) profile.effort = values.effort;
        if (values.command) profile.command = values.command;
        const path = await saveProfile(stateDirectory, profile, { overwrite: values.force });
        io.stdout(`created agent ${name}: ${path}\n`);
        return EXIT.ok;
      }
      if (subcommand === "list" || subcommand === undefined) {
        const profiles = await listProfiles(stateDirectory);
        if (profiles.length === 0) io.stdout("no agents; create one with `agister agent create <name>`\n");
        for (const profile of profiles) {
          io.stdout(`${profile.name}\t${profile.runtime}\t${profile.model ?? "(default model)"}\t${profile.effort ?? "-"}\n`);
        }
        return EXIT.ok;
      }
      return usage(`unknown agent command: ${subcommand}`);
    }

    case "run": {
      const agentName = subcommand ?? usage("run needs an agent name");
      const profile = await loadProfile(stateDirectory, agentName);
      const prompt = values.prompt ?? (await io.stdin());
      if (prompt.trim() === "") usage("empty prompt; pass --prompt or pipe it on stdin");
      const policy: ExecutionPolicy = {
        workspace: "read-only",
        isolateConfig: true,
        timeoutMs: parseDuration(values.timeout ?? "10m"),
      };
      if (values.tools !== undefined || values.allow !== undefined) {
        if (profile.runtime !== "claude-code") usage(`--tools/--allow apply to claude-code agents only; ${profile.name} is ${profile.runtime}`);
        const tools = values.tools !== undefined ? splitList(values.tools) : ["Read", "Grep", "Glob"];
        // Exposed tools are allowed unless the caller narrows them with --allow.
        policy.claude = { tools, allowedTools: values.allow !== undefined ? splitList(values.allow) : tools };
      }

      const { record } = await runProcess({
        io, stateDirectory, profile, progress,
        process: "ad-hoc",
        inputs: { prompt: truncate(prompt, 2_000) },
        prompt,
        policy,
        cwd: io.cwd,
      });
      if (values.json) io.stdout(`${JSON.stringify(record, null, 2)}\n`);
      else if (record.result?.text) io.stdout(`${record.result.text}\n`);
      reportOutcome(io, record);
      return record.result?.outcome === "completed" ? EXIT.ok : EXIT.runFailed;
    }

    case "review": {
      if (subcommand !== undefined) usage(`unexpected argument: ${subcommand}`);
      const profile = await loadProfile(stateDirectory, values.agent ?? "reviewer");
      const base = values.base ?? (await defaultBase(io.cwd));
      const target = await resolveReviewTarget(io.cwd, base, values.candidate ?? "HEAD");
      const policy = reviewPolicy(profile.runtime, parseDuration(values.timeout ?? "20m"));
      if (!values.quiet) {
        io.stderr(`reviewing ${short(target.candidate)} against ${short(target.mergeBase)} (${target.changedFiles.length} files) with agent ${profile.name}\n`);
      }

      const { record } = await withCandidateWorktree(target, (workspace) =>
        runProcess({
          io, stateDirectory, profile, progress,
          process: "review",
          inputs: {
            repository: target.repository,
            base: target.base,
            mergeBase: target.mergeBase,
            candidate: target.candidate,
            changedFiles: target.changedFiles,
            diffTruncated: target.diffTruncated,
          },
          prompt: reviewPrompt(target),
          appendSystemPrompt: REVIEW_INSTRUCTION,
          outputSchema: REVIEW_OUTPUT_SCHEMA,
          policy,
          cwd: workspace,
          interpret: validateReviewResult,
        }),
      );

      if (values.json) io.stdout(`${JSON.stringify(record, null, 2)}\n`);
      reportOutcome(io, record);
      if (record.result?.outcome !== "completed") return EXIT.runFailed;
      const review = validateReviewResult(record.output);
      if (!values.json) io.stdout(`${formatReview(review)}\n`);
      return review.verdict === "request_changes" ? EXIT.changesRequested : EXIT.ok;
    }

    case "runs": {
      if (subcommand === "show") {
        const id = rest[0] ?? usage("runs show needs a run ID");
        io.stdout(`${JSON.stringify(readRun(stateDirectory, id), null, 2)}\n`);
        return EXIT.ok;
      }
      if (subcommand !== undefined && subcommand !== "list") return usage(`unknown runs command: ${subcommand}`);
      for (const run of listRuns(stateDirectory)) {
        io.stdout(`${run.id}\t${run.process}\t${run.agent}\t${run.result?.outcome ?? "unfinished"}\t${run.result?.reason ?? ""}\n`);
      }
      return EXIT.ok;
    }

    default:
      return usage(`unknown command: ${command}`);
  }
}

interface ProcessRun {
  io: Io;
  stateDirectory: string;
  profile: AgentProfile;
  progress: (event: RuntimeEvent) => void;
  process: string;
  inputs: Record<string, unknown>;
  prompt: string;
  appendSystemPrompt?: string;
  outputSchema?: object;
  policy: ExecutionPolicy;
  cwd: string;
  interpret?: (output: unknown) => unknown;
}

async function runProcess(run: ProcessRun): Promise<{ record: RunRecord }> {
  const adapter = adapterFor(run.profile);
  const sessionId = adapter.capabilities.presetSessionId ? randomUUID() : undefined;
  const record: Parameters<typeof createRun>[1] = {
    id: newRunId(new Date(), () => randomUUID().replace(/-/g, "")),
    process: run.process,
    agent: run.profile.name,
    runtime: adapter.runtime,
    workspace: run.cwd,
    inputs: run.inputs,
  };
  if (sessionId) record.requestedSessionId = sessionId;
  const handle = createRun(run.stateDirectory, record);

  const request: TurnRequest = {
    prompt: run.prompt,
    cwd: run.cwd,
    policy: run.policy,
  };
  if (sessionId) request.sessionId = sessionId;
  if (run.profile.model) request.model = run.profile.model;
  if (run.profile.effort) request.effort = run.profile.effort;
  if (run.appendSystemPrompt) request.appendSystemPrompt = run.appendSystemPrompt;
  if (run.outputSchema) request.outputSchema = run.outputSchema;
  if (run.io.signal) request.signal = run.io.signal;

  let result: TurnResult = await adapter.runTurn(request, {
    event: (event) => {
      handle.event(event);
      run.progress(event);
    },
    raw: (line) => handle.raw(line),
  });

  // The turn completing is not the process succeeding: the process still has
  // to accept the output against its own contract.
  let output: unknown;
  if (result.outcome === "completed" && run.interpret) {
    try {
      output = run.interpret(result.structuredOutput);
    } catch (error) {
      result = { ...result, outcome: "failed", reason: error instanceof Error ? error.message : String(error) };
    }
  }

  return { record: handle.finish(result, output) };
}

function adapterFor(profile: AgentProfile): RuntimeAdapter {
  switch (profile.runtime) {
    case "claude-code":
      return claudeCodeAdapter(profile.command ? { command: profile.command } : {});
    case "codex":
      return codexAdapter(profile.command ? { command: profile.command } : {});
  }
}

function reportOutcome(io: Io, record: RunRecord): void {
  const result = record.result;
  if (!result) return;
  const parts = [`run ${record.id}: ${result.outcome}`];
  if (result.reason) parts.push(`(${result.reason})`);
  if (result.costUsd !== undefined) parts.push(`$${result.costUsd.toFixed(4)}`);
  if (result.durationMs !== undefined) parts.push(`${(result.durationMs / 1000).toFixed(1)}s`);
  if (result.permissionDenials?.length) parts.push(`${result.permissionDenials.length} permission denial(s)`);
  io.stderr(`${parts.join(" ")}\n`);
  if (result.providerSessionId) {
    const resume = record.runtime === "codex" ? "codex resume" : "claude --resume";
    io.stderr(`  provider session: ${result.providerSessionId} (${resume} ${result.providerSessionId})\n`);
  }
  if (result.outcome !== "completed" && result.stderrTail) io.stderr(`  stderr: ${truncate(result.stderrTail, 500)}\n`);
}

function describeEvent(event: RuntimeEvent): string | undefined {
  const data = event.data ?? {};
  switch (event.kind) {
    case "PROCESS_STARTED":
      return `· started pid ${data["pid"]}`;
    case "PROVIDER_SESSION_BOUND":
      return `· session ${data["providerSessionId"]} (${data["model"]})`;
    case "SESSION_ID_MISMATCH":
      return `! provider reported session ${data["reported"]}, requested ${data["requested"]}`;
    case "TOOL_REQUESTED":
      return `· ${data["name"]} ${data["input"]}`;
    case "TOOL_RESULT":
      return data["isError"] ? `  ↳ tool error` : undefined;
    case "PROVIDER_RETRY":
    case "PROVIDER_ERROR":
    case "RATE_LIMITED":
    case "TIMEOUT":
    case "ABORT_REQUESTED":
    case "SPAWN_FAILED":
    case "STREAM_PARSE_ERROR":
    case "TURN_FAILED":
      return `! ${event.kind} ${JSON.stringify(data)}`;
    default:
      return undefined;
  }
}

export function parseDuration(text: string): number {
  const match = /^(\d+)(ms|s|m|h)?$/.exec(text.trim());
  if (!match) throw new UsageError(`invalid duration: ${text} (use e.g. 90s, 10m, 1h)`);
  const unit = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000 }[(match[2] ?? "s") as "ms" | "s" | "m" | "h"];
  const value = Number(match[1]) * unit;
  if (value <= 0) throw new UsageError(`duration must be positive: ${text}`);
  return value;
}

function splitList(text: string): string[] {
  return text.split(",").map((item) => item.trim()).filter((item) => item !== "");
}

function usage(message: string): never {
  throw new UsageError(message);
}

function short(sha: string): string {
  return sha.slice(0, 12);
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const controller = new AbortController();
  process.on("SIGINT", () => {
    if (controller.signal.aborted) process.exit(130);
    controller.abort();
  });
  const code = await main(process.argv.slice(2), {
    cwd: process.cwd(),
    env: process.env,
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
    stdin: readStdin,
    signal: controller.signal,
  });
  process.exitCode = code;
}
