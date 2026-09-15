import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type RegistryEntry = {
  pid: number;
  sessionId: string;
  status?: string;
  waitingFor?: string;
};

// Claude Code registers each running session as `<pid>.json`, so the file name
// is the claim that the session is live and the contents say what it is doing.
export function registryDirectoryOf(...entries: RegistryEntry[]): string {
  const directory = mkdtempSync(join(tmpdir(), "noreta-registry-"));

  register(directory, ...entries);

  return directory;
}

// A session is started by whatever launched the agent, so it can register long
// after the registry directory was made.
export function register(directory: string, ...entries: RegistryEntry[]): void {
  for (const entry of entries) {
    writeFileSync(join(directory, `${entry.pid}.json`), JSON.stringify(entry));
  }
}

// A machine where no session has ever registered has no registry at all, so the
// path names a directory Claude Code has not created.
export function absentRegistryDirectory(): string {
  return join(mkdtempSync(join(tmpdir(), "noreta-registry-")), "sessions");
}

// A registration is written by the live process it names, so a snapshot can
// catch one part way through and read only the bytes written so far.
export function registerHalfWritten(directory: string, pid: number): void {
  writeFileSync(join(directory, `${pid}.json`), `{"pid":${pid},"sessionI`);
}

export const livePid = process.pid;

// Above macOS's maximum process id, so no process can ever hold it.
export const deadPid = 999_999;

// A second live process id, so two registrations can both pass the liveness
// check. The parent always exists: if it exits, the process is reparented.
export const otherLivePid = process.ppid;
