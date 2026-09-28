import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

import type { TurnObserver, TurnResult } from "./runtime.js";

// Runs one provider CLI process and collects transport evidence. Shared by
// every CLI-based adapter; the adapter supplies arguments and interprets the
// stdout protocol line by line.

const KILL_GRACE_MS = 5_000;
const STDERR_TAIL_BYTES = 4_096;

export interface ProcessEvidence {
  exit?: { code: number | null; signal: string | null };
  spawnError?: string;
  timedOut: boolean;
  aborted: boolean;
  stderrTail?: string;
}

export interface SupervisedProcess {
  command: string;
  args: string[];
  cwd: string;
  stdin: string;
  timeoutMs: number;
  signal?: AbortSignal;
  killGraceMs?: number;
}

export function superviseProcess(
  spec: SupervisedProcess,
  observer: TurnObserver,
  onLine: (line: string) => void,
): Promise<ProcessEvidence> {
  const evidence: ProcessEvidence = { timedOut: false, aborted: false };
  const killGraceMs = spec.killGraceMs ?? KILL_GRACE_MS;

  return new Promise((resolve) => {
    // Own process group, so termination reaches everything the CLI spawned.
    const child = spawn(spec.command, spec.args, { cwd: spec.cwd, detached: true, stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";
    let settled = false;
    let killTimer: NodeJS.Timeout | undefined;

    const terminate = () => {
      if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
      signalGroup(child.pid, "SIGTERM");
      killTimer = setTimeout(() => signalGroup(child.pid!, "SIGKILL"), killGraceMs);
      killTimer.unref();
    };

    const timeout = setTimeout(() => {
      evidence.timedOut = true;
      observer.event({ source: "adapter", kind: "TIMEOUT", data: { timeoutMs: spec.timeoutMs } });
      terminate();
    }, spec.timeoutMs);

    const onAbort = () => {
      evidence.aborted = true;
      observer.event({ source: "adapter", kind: "ABORT_REQUESTED" });
      terminate();
    };
    spec.signal?.addEventListener("abort", onAbort, { once: true });

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      spec.signal?.removeEventListener("abort", onAbort);
      if (stderr.trim() !== "") evidence.stderrTail = stderr.trim();
      resolve(evidence);
    };

    child.on("error", (error) => {
      evidence.spawnError = error.message;
      observer.event({ source: "process", kind: "SPAWN_FAILED", data: { error: error.message } });
      if (child.pid === undefined) finish();
    });

    if (child.pid === undefined) return;
    observer.event({ source: "process", kind: "PROCESS_STARTED", data: { pid: child.pid, command: spec.command, args: spec.args } });

    child.stdin.on("error", () => {});
    child.stdin.end(spec.stdin);

    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString("utf8")).slice(-STDERR_TAIL_BYTES);
    });

    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    lines.on("line", (line) => {
      observer.raw?.(line);
      onLine(line);
    });

    child.on("close", (code, signal) => {
      evidence.exit = { code, signal };
      observer.event({ source: "process", kind: "PROCESS_EXITED", data: { code, signal } });
      finish();
    });
  });
}

// Outcome when the provider never reported a terminal turn event. Agister's
// own timeout or abort comes first, then spawn failure, then the exit status.
// A clean exit without a terminal event is lost: nothing proves what happened.
export function reconcileWithoutTerminal(base: TurnResult, evidence: ProcessEvidence, lastError?: string): TurnResult {
  const detail = lastError ? `: ${lastError}` : "";
  if (evidence.timedOut) return { ...base, outcome: "interrupted", reason: "timeout" };
  if (evidence.aborted) return { ...base, outcome: "interrupted", reason: "aborted" };
  if (evidence.spawnError) return { ...base, outcome: "failed", reason: `spawn_failed: ${evidence.spawnError}` };
  const code = evidence.exit?.code;
  if (code !== null && code !== undefined && code !== 0) {
    return { ...base, outcome: "failed", reason: `exit_code_${code}${detail}` };
  }
  if (evidence.exit?.signal) return { ...base, outcome: "lost", reason: `killed_by_${evidence.exit.signal}${detail}` };
  return { ...base, outcome: "lost", reason: `exited_without_result${detail}` };
}

export function baseResult(evidence: ProcessEvidence): TurnResult {
  const base: TurnResult = { outcome: "lost" };
  if (evidence.exit) base.exit = evidence.exit;
  if (evidence.stderrTail) base.stderrTail = evidence.stderrTail;
  return base;
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

function signalGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {
    // Already gone.
  }
}
