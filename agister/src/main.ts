import { resolve } from "node:path";
import { parseArgs } from "node:util";

import type { AgentProfile } from "./agents.js";
import { InputError, type Agister } from "./application.js";
import { formatReview } from "./review.js";
import type { RunRecord } from "./run-store.js";
import type { RuntimeEvent } from "./runtime.js";

// The CLI: parses arguments, calls the application and presents results. It
// names no runtime; the application it drives is built by the injected
// composition function.

export const EXIT = { ok: 0, changesRequested: 1, runFailed: 2, usage: 64 } as const;

const USAGE = `agister — run agent-backed processes through provider runtimes

Usage:
  agister agent create <name> [--runtime <runtime>] [--model <m>] [--effort <e>] [--command <path>] [--force]
  agister agent list
  agister run <agent> [--prompt <text>] [--timeout 10m] [--json]
                     [--tools Read,Grep] [--allow <rule,...>]   (runtimes with a tool surface)
  agister review [--agent reviewer] [--base <rev>] [--candidate HEAD] [--timeout 20m] [--json]
  agister runs [list]
  agister runs show <run-id>

Options:
  --state-dir <dir>   Agister state directory (default: ./.agister, or $AGISTER_STATE_DIR)
  --quiet             Do not print progress to stderr
  --runtime <name>    Runtime for a new agent (default: the first registered one)
  --debug             Print diagnostic logs to stderr (always kept in <state-dir>/logs/agister.jsonl)

Exit codes: 0 ok, 1 review requested changes, 2 run failed, 64 usage error.`;

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
    if (error instanceof UsageError || error instanceof InputError) {
      io.stderr(`\n${USAGE}\n`);
      return EXIT.usage;
    }
    return EXIT.runFailed;
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
  const config: CompositionConfig = { stateDirectory };
  if (values.debug) config.debug = (line) => io.stderr(`${line}\n`);
  const app = compose(config);
  const progress = values.quiet ? () => {} : (event: RuntimeEvent) => {
    const line = describeEvent(event);
    if (line) io.stderr(`${line}\n`);
  };
  const [command, subcommand, ...rest] = positionals;

  switch (command) {
    case "agent": {
      if (subcommand === "create") {
        const name = rest[0] ?? usage("agent create needs a name");
        const profile: AgentProfile = { name, runtime: values.runtime ?? app.runtimes()[0]!, session: "fresh-only" };
        if (values.model) profile.model = values.model;
        if (values.effort) profile.effort = values.effort;
        if (values.command) profile.command = values.command;
        const path = await app.createAgent(profile, { overwrite: values.force });
        io.stdout(`created agent ${name}: ${path}\n`);
        return EXIT.ok;
      }
      if (subcommand === "list" || subcommand === undefined) {
        const profiles = await app.listAgents();
        if (profiles.length === 0) io.stdout("no agents; create one with `agister agent create <name>`\n");
        for (const profile of profiles) {
          io.stdout(`${profile.name}\t${profile.runtime}\t${profile.model ?? "(default model)"}\t${profile.effort ?? "-"}\n`);
        }
        return EXIT.ok;
      }
      return usage(`unknown agent command: ${subcommand}`);
    }

    case "run": {
      const agent = subcommand ?? usage("run needs an agent name");
      const prompt = values.prompt ?? (await io.stdin());
      if (prompt.trim() === "") usage("empty prompt; pass --prompt or pipe it on stdin");
      const run: Parameters<Agister["runPrompt"]>[0] = {
        agent,
        prompt,
        cwd: io.cwd,
        timeoutMs: parseDuration(values.timeout ?? "10m"),
        onEvent: progress,
      };
      if (io.signal) run.signal = io.signal;
      if (values.tools !== undefined || values.allow !== undefined) {
        run.tools = {};
        if (values.tools !== undefined) run.tools.expose = splitList(values.tools);
        if (values.allow !== undefined) run.tools.allow = splitList(values.allow);
      }

      const record = await app.runPrompt(run);
      if (values.json) io.stdout(`${JSON.stringify(record, null, 2)}\n`);
      else if (record.result?.text) io.stdout(`${record.result.text}\n`);
      reportOutcome(io, app, record);
      return record.result?.outcome === "completed" ? EXIT.ok : EXIT.runFailed;
    }

    case "review": {
      if (subcommand !== undefined) usage(`unexpected argument: ${subcommand}`);
      const run: Parameters<Agister["review"]>[0] = {
        agent: values.agent ?? "reviewer",
        cwd: io.cwd,
        candidate: values.candidate ?? "HEAD",
        timeoutMs: parseDuration(values.timeout ?? "20m"),
        onEvent: progress,
      };
      if (values.base) run.base = values.base;
      if (io.signal) run.signal = io.signal;
      if (!values.quiet) {
        run.onTarget = (target, profile) =>
          io.stderr(`reviewing ${short(target.candidate)} against ${short(target.mergeBase)} (${target.changedFiles.length} files) with agent ${profile.name}\n`);
      }

      const { record, review } = await app.review(run);
      if (values.json) io.stdout(`${JSON.stringify(record, null, 2)}\n`);
      reportOutcome(io, app, record);
      if (!review) return EXIT.runFailed;
      if (!values.json) io.stdout(`${formatReview(review)}\n`);
      return review.verdict === "request_changes" ? EXIT.changesRequested : EXIT.ok;
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
