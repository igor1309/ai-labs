import type { ChildProcess } from "node:child_process";
import { join } from "node:path";
import {
  experimental_killPortableProcess as killPortableProcess,
  experimental_spawnPortableProcess as spawnPortableProcess,
} from "@get-bb/plugin-sdk/provider-bridge";
import { z } from "zod";
import {
  AGISTER_EXECUTABLE,
  AGISTER_PROMPT_PARAM,
  AGISTER_WORKFLOW,
} from "./vocabulary.js";

// The variables Agister is given. Everything else the bridge inherited
// from the daemon (provider API keys, proxy tokens, bb's own) stays out:
// Agister's runtimes sign in with their own logins under HOME.
const AGISTER_ENV_ALLOWLIST = [
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TMPDIR",
  "TERM",
  "AGISTER_HOME",
] as const;

const STDOUT_LIMIT_BYTES = 4 * 1024 * 1024;
const STDERR_TAIL_BYTES = 16 * 1024;
const PROGRESS_LINE_LIMIT = 2_000;

export function agisterEnv(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const name of AGISTER_ENV_ALLOWLIST) {
    const value = source[name];
    if (value !== undefined) env[name] = value;
  }
  return env;
}

// The argument array of one turn. The prompt is one argv element, the
// value of the fixed param; it is never parsed by a shell.
export function agisterArgs(prompt: string): string[] {
  return [
    "run",
    AGISTER_WORKFLOW,
    "--param",
    `${AGISTER_PROMPT_PARAM}=${prompt}`,
  ];
}

// Where Agister keeps a run's record (docs/run-implementation.md,
// "Records"): `<home>/runs/<run id>/record.json`. Agister does not promise
// this path; `agister runs export <run id>` is its stable way out.
export function recordPathFor(
  runId: string,
  env: NodeJS.ProcessEnv,
): string | null {
  const home =
    env.AGISTER_HOME ??
    (env.HOME === undefined ? undefined : join(env.HOME, ".agister"));
  return home === undefined ? null : join(home, "runs", runId, "record.json");
}

// Agister's printed result (cli/run.go, `printed`), read leniently.
export const agisterResultSchema = z
  .object({
    run_id: z.string(),
    status: z.string(),
    class: z.string().nullable(),
    output: z.unknown(),
    reason: z.string().nullable(),
    warnings: z.array(z.string()).default([]),
  })
  .passthrough();
export type AgisterResult = z.infer<typeof agisterResultSchema>;

export interface AgisterRunEnd {
  code: number | null;
  signal: NodeJS.Signals | null;
  // Agister's result JSON, or null when it printed none (a refusal, a bad
  // command, a kill).
  result: AgisterResult | null;
  stderrTail: string;
  spawnError: NodeJS.ErrnoException | null;
}

export interface AgisterRun {
  pid: number | undefined;
  done: Promise<AgisterRunEnd>;
  // SIGTERM, which Agister answers by cancelling its steps and recording
  // the run interrupted/cancelled; SIGKILL only when graceMs passes.
  terminate(graceMs: number): Promise<"exited" | "killed">;
}

export interface StartAgisterRunArgs {
  cwd: string;
  prompt: string;
  env: NodeJS.ProcessEnv;
  onProgressLine: (line: string) => void;
}

export function startAgisterRun(args: StartAgisterRunArgs): AgisterRun {
  let child: ChildProcess;
  try {
    child = spawnPortableProcess({
      command: AGISTER_EXECUTABLE,
      args: agisterArgs(args.prompt),
      cwd: args.cwd,
      env: args.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    // A prompt holding a NUL byte cannot be an argv element.
    const spawnError = error as NodeJS.ErrnoException;
    return {
      pid: undefined,
      done: Promise.resolve({
        code: null,
        signal: null,
        result: null,
        stderrTail: "",
        spawnError,
      }),
      terminate: async () => "exited",
    };
  }

  const stdoutChunks: Buffer[] = [];
  let stdoutBytes = 0;
  child.stdout?.on("data", (chunk: Buffer) => {
    if (stdoutBytes >= STDOUT_LIMIT_BYTES) return;
    stdoutChunks.push(chunk);
    stdoutBytes += chunk.length;
  });

  let stderrTail = "";
  let partial = "";
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (text: string) => {
    stderrTail = (stderrTail + text).slice(-STDERR_TAIL_BYTES);
    const lines = (partial + text).split("\n");
    partial = lines.pop() ?? "";
    for (const line of lines) {
      args.onProgressLine(line.slice(0, PROGRESS_LINE_LIMIT));
    }
  });

  let spawnError: NodeJS.ErrnoException | null = null;
  const done = new Promise<AgisterRunEnd>((resolve) => {
    child.once("error", (error: NodeJS.ErrnoException) => {
      spawnError = error;
      if (child.pid === undefined) {
        resolve({ code: null, signal: null, result: null, stderrTail, spawnError });
      }
    });
    child.once("close", (code, signal) => {
      if (partial !== "") {
        args.onProgressLine(partial.slice(0, PROGRESS_LINE_LIMIT));
        partial = "";
      }
      resolve({
        code,
        signal,
        result: parseResult(Buffer.concat(stdoutChunks).toString("utf8")),
        stderrTail,
        spawnError,
      });
    });
  });

  let exited = false;
  void done.then(() => {
    exited = true;
  });

  return {
    pid: child.pid,
    done,
    async terminate(graceMs) {
      if (exited) return "exited";
      killPortableProcess(child, "SIGTERM");
      const inTime = await Promise.race([
        done.then(() => true),
        delay(graceMs).then(() => false),
      ]);
      if (inTime) return "exited";
      killPortableProcess(child, "SIGKILL");
      await Promise.race([done, delay(1_000)]);
      return "killed";
    },
  };
}

function parseResult(stdout: string): AgisterResult | null {
  const text = stdout.trim();
  if (text === "") return null;
  try {
    const parsed = agisterResultSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms).unref());
}
