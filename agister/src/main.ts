import { resolve } from "node:path";
import { parseArgs } from "node:util";

import type { AgentProfile } from "./agents.js";
import { InputError, type Agister, type ProcessRun } from "./application.js";
import { formatMs } from "./config.js";
import { parseDuration } from "./duration.js";
import { formatReview, REVIEW_RESULT_SCHEMA_ID, type ReviewResult } from "./review-result.js";
import type { RunRecord } from "./run-store.js";
import type { RuntimeEvent } from "./runtime.js";

// The CLI: parses arguments, calls the application and presents results. It
// names no runtime; the application it drives is built by the injected
// composition function.

export const EXIT = { ok: 0, changesRequested: 1, runFailed: 2, usage: 64 } as const;

const USAGE = `agister — run agent-backed processes through provider runtimes

Usage:
  agister init [--force]                   Copy example agents, policies and processes into the state dir
  agister agent create <name> [--runtime <runtime>] [--model <m>] [--model-family <f>] [--effort <e>] [--command <path>] [--force]
  agister agent list
  agister process list
  agister process show <process> [--agent <name>]
  agister process run <process> [--agent <name>] [--base <rev>] [--candidate <rev>]
                     [--input <name>=<value|@file>]... [--timeout <d>] [--json]
  agister review [--process adversarial_review] [same options as process run]
  agister run <agent> [--prompt <text>] [--allow <capability,...>] [--timeout <d>] [--json]
  agister runs [list]
  agister runs show <run-id>

Options:
  --state-dir <dir>   Agister state directory (default: ./.agister, or $AGISTER_STATE_DIR)
  --runtime <name>    Runtime for a new agent (default: the first registered one)
  --timeout <d>       Shortens the effective timeout; it can never extend it
  --quiet             Do not print progress to stderr
  --debug             Print diagnostic logs to stderr (always kept in <state-dir>/logs/agister.jsonl)

Exit codes: 0 ok, 1 review requested changes, 2 run failed, 64 usage or configuration error.`;

export interface Io {
  cwd: string;
  env: Record<string, string | undefined>;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  stdin: () => Promise<string>;
  signal?: AbortSignal;
}

export interface CompositionConfig {
  stateDirectory: string;
  debug?: (line: string) => void;
}

export type Compose = (config: CompositionConfig) => Agister;

class UsageError extends Error {}

export async function main(argv: string[], io: Io, compose: Compose): Promise<number> {
  try {
    return await dispatch(argv, io, compose);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.stderr(`agister: ${message}\n`);
    if (error instanceof UsageError) io.stderr(`\n${USAGE}\n`);
    return error instanceof UsageError || error instanceof InputError ? EXIT.usage : EXIT.runFailed;
  }
}

async function dispatch(argv: string[], io: Io, compose: Compose): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      "state-dir": { type: "string" },
      quiet: { type: "boolean", default: false },
      debug: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      force: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
      model: { type: "string" },
      "model-family": { type: "string" },
      effort: { type: "string" },
      runtime: { type: "string" },
      command: { type: "string" },
      prompt: { type: "string" },
      allow: { type: "string" },
      timeout: { type: "string" },
      agent: { type: "string" },
      process: { type: "string" },
      base: { type: "string" },
      candidate: { type: "string" },
      input: { type: "string", multiple: true },
    },
  });

  if (values.help || positionals.length === 0) {
    io.stdout(`${USAGE}\n`);
    return values.help ? EXIT.ok : EXIT.usage;
  }

  const stateDirectory = resolve(io.cwd, values["state-dir"] ?? io.env["AGISTER_STATE_DIR"] ?? ".agister");
  const config: CompositionConfig = { stateDirectory };
  if (values.debug) config.debug = (line) => io.stderr(`${line}\n`);
  const app = compose(config);
  const progress = values.quiet ? () => {} : (event: RuntimeEvent) => {
    const line = describeEvent(event);
    if (line) io.stderr(`${line}\n`);
  };
  const [command, subcommand, ...rest] = positionals;

  const processRun = (name: string): ProcessRun => {
    const run: ProcessRun = { process: name, cwd: io.cwd, onEvent: progress, inputs: parseInputs(values.input ?? []) };
    if (values.agent) run.agent = values.agent;
    if (values.base) run.base = values.base;
    if (values.candidate) run.candidate = values.candidate;
    if (values.timeout) run.timeoutMs = parseDuration(values.timeout);
    if (io.signal) run.signal = io.signal;
    if (!values.quiet) {
      run.onCandidate = (candidate, agent) =>
        io.stderr(`${name}: ${short(candidate.candidate)} against ${short(candidate.mergeBase)} (${candidate.changedFiles.length} files) with agent ${agent.name}\n`);
    }
    return run;
  };

  const presentProcessRun = async (run: ProcessRun): Promise<number> => {
    const { record, output } = await app.runProcess(run);
    if (values.json) io.stdout(`${JSON.stringify(record, null, 2)}\n`);
    reportOutcome(io, app, record);
    if (record.result?.outcome !== "completed") return EXIT.runFailed;
    if (record.definition?.["outputSchema"] === REVIEW_RESULT_SCHEMA_ID) {
      const review = output as ReviewResult;
      if (!values.json) io.stdout(`${formatReview(review)}\n`);
      return review.verdict === "request_changes" ? EXIT.changesRequested : EXIT.ok;
    }
    if (!values.json) io.stdout(`${JSON.stringify(output, null, 2)}\n`);
    return EXIT.ok;
  };

  switch (command) {
    case "init": {
      const { created, skipped } = await app.init({ overwrite: values.force });
      for (const path of created) io.stdout(`created ${path}\n`);
      for (const path of skipped) io.stdout(`kept    ${path} (exists; --force replaces it)\n`);
      return EXIT.ok;
    }

    case "agent": {
      if (subcommand === "create") {
        const name = rest[0] ?? usage("agent create needs a name");
        const profile: AgentProfile = { name, runtime: values.runtime ?? app.runtimes()[0]!, session: "fresh-only" };
        if (values.model) profile.model = values.model;
        if (values["model-family"]) profile.modelFamily = values["model-family"];
        if (values.effort) profile.effort = values.effort;
        if (values.command) profile.command = values.command;
        const path = await app.createAgent(profile, { overwrite: values.force });
        io.stdout(`created agent ${name}: ${path}\n`);
        return EXIT.ok;
      }
      if (subcommand === "list" || subcommand === undefined) {
        const profiles = await app.listAgents();
        if (profiles.length === 0) io.stdout("no agents; run `agister init` or `agister agent create <name>`\n");
        for (const profile of profiles) {
          io.stdout(`${profile.name}\t${profile.runtime}\t${profile.model ?? "(default model)"}\t${profile.effort ?? "-"}\t${profile.modelFamily ?? "-"}\n`);
        }
        return EXIT.ok;
      }
      return usage(`unknown agent command: ${subcommand}`);
    }

    case "process": {
      if (subcommand === "list" || subcommand === undefined) {
        const processes = await app.listProcesses();
        if (processes.length === 0) io.stdout("no processes; run `agister init`\n");
        for (const process of processes) {
          io.stdout(`${process.name}\tagent:${process.agent}\t${process.policy ? `process-policy:${process.policy}` : "-"}\t${process.outputSchema}\n`);
        }
        return EXIT.ok;
      }
      if (subcommand === "show") {
        const view = await app.showProcess(rest[0] ?? usage("process show needs a process name"), values.agent);
        if (values.json) {
          io.stdout(`${JSON.stringify(view, null, 2)}\n`);
          return EXIT.ok;
        }
        const { definition, effective } = view;
        io.stdout([
          `process      ${definition.name} (${definition.source.path})`,
          `agent        ${view.agent.name} (${view.agent.runtime}${view.agent.model ? `, ${view.agent.model}` : ""})`,
          `policy       ${view.policy ?? "(none)"}`,
          `inputs       ${definition.required.join(", ") || "(none)"}`,
          `output       ${definition.outputSchema}`,
          `capabilities ${effective.capabilities.join(", ") || "(none)"}`,
          `  allowed    ${effective.allow.join(", ") || "(none)"}`,
          `  denied     ${effective.deny.join(", ") || "(none)"}`,
          `workspace    ${effective.access}, scope ${effective.scope}`,
          `timeout      ${formatMs(effective.timeoutMs)}; attempts ${effective.maxAttempts}`,
          `constraints  ${effective.constraints.map((constraint) => `${constraint.subject} != ${constraint.notEqual}`).join("; ") || "(none)"}`,
          `resources    ${effective.resources.join(", ") || "(none)"}`,
          `retain       ${effective.retain.join(", ") || "(none)"}`,
          `runtime      ${view.runtimeProblems.length === 0 ? "can enforce this policy" : `CANNOT enforce this policy:\n  ${view.runtimeProblems.join("\n  ")}`}`,
        ].join("\n") + "\n");
        return EXIT.ok;
      }
      if (subcommand === "run") {
        return presentProcessRun(processRun(rest[0] ?? usage("process run needs a process name")));
      }
      return usage(`unknown process command: ${subcommand}`);
    }

    case "review": {
      if (subcommand !== undefined) usage(`unexpected argument: ${subcommand}`);
      return presentProcessRun(processRun(values.process ?? "adversarial_review"));
    }

    case "run": {
      const agent = subcommand ?? usage("run needs an agent name");
      const prompt = values.prompt ?? (await io.stdin());
      if (prompt.trim() === "") usage("empty prompt; pass --prompt or pipe it on stdin");
      const run: Parameters<Agister["runPrompt"]>[0] = { agent, prompt, cwd: io.cwd, onEvent: progress };
      if (values.allow !== undefined) run.allow = splitList(values.allow);
      if (values.timeout) run.timeoutMs = parseDuration(values.timeout);
      if (io.signal) run.signal = io.signal;

      const record = await app.runPrompt(run);
      if (values.json) io.stdout(`${JSON.stringify(record, null, 2)}\n`);
      else if (record.result?.text) io.stdout(`${record.result.text}\n`);
      reportOutcome(io, app, record);
      return record.result?.outcome === "completed" ? EXIT.ok : EXIT.runFailed;
    }

    case "runs": {
      if (subcommand === "show") {
        const id = rest[0] ?? usage("runs show needs a run ID");
        io.stdout(`${JSON.stringify(app.readRun(id), null, 2)}\n`);
        return EXIT.ok;
      }
      if (subcommand !== undefined && subcommand !== "list") return usage(`unknown runs command: ${subcommand}`);
      for (const run of app.listRuns()) {
        io.stdout(`${run.id}\t${run.process}\t${run.agent}\t${run.result?.outcome ?? "unfinished"}\t${run.result?.reason ?? ""}\n`);
      }
      return EXIT.ok;
    }

    default:
      return usage(`unknown command: ${command}`);
  }
}

function parseInputs(pairs: string[]): Record<string, string> {
  const inputs: Record<string, string> = {};
  for (const pair of pairs) {
    const equals = pair.indexOf("=");
    if (equals <= 0) usage(`--input expects <name>=<value|@file>, got: ${pair}`);
    inputs[pair.slice(0, equals)] = pair.slice(equals + 1);
  }
  return inputs;
}

function reportOutcome(io: Io, app: Agister, record: RunRecord): void {
  const result = record.result;
  if (!result) return;
  const parts = [`run ${record.id}: ${result.outcome}`];
  if (result.reason) parts.push(`(${result.reason})`);
  if (result.costUsd !== undefined) parts.push(`$${result.costUsd.toFixed(4)}`);
  if (result.durationMs !== undefined) parts.push(`${(result.durationMs / 1000).toFixed(1)}s`);
  if (result.permissionDenials?.length) parts.push(`${result.permissionDenials.length} permission denial(s)`);
  io.stderr(`${parts.join(" ")}\n`);
  const resume = app.resumeHint(record);
  if (result.providerSessionId) io.stderr(`  provider session: ${result.providerSessionId}${resume ? ` (${resume})` : ""}\n`);
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
    case "CAPABILITIES_WITHHELD":
      return `· withheld ${(data["capabilities"] as string[]).join(", ")} (${data["reason"]})`;
    case "CONSTRAINT_CHECKED":
      return `${data["satisfied"] ? "·" : "!"} constraint ${data["subject"]}: ${data["satisfied"] ? "satisfied" : "unsatisfied"} (${data["basis"]})`;
    default:
      return undefined;
  }
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
