import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type RegistryEntry = {
  pid: number;
  sessionId: string;
  status?: string;
  waitingFor?: string;
};

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

export function absentRegistryDirectory(): string {
  return join(mkdtempSync(join(tmpdir(), "noreta-registry-")), "sessions");
}

export function registerHalfWritten(directory: string, pid: number): void {
  writeFileSync(join(directory, `${pid}.json`), `{"pid":${pid},"sessionI`);
}

export const livePid = process.pid;

// Above macOS's maximum process id, so no process can ever hold it.
export const deadPid = 999_999;

// A second live process id, so two registrations can both pass the liveness
// check. The parent always exists: if it exits, the process is reparented.
export const otherLivePid = process.ppid;
