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

  for (const entry of entries) {
    writeFileSync(join(directory, `${entry.pid}.json`), JSON.stringify(entry));
  }

  return directory;
}

export const livePid = process.pid;

// Above macOS's maximum process id, so no process can ever hold it.
export const deadPid = 999_999;

// A second live process id, so two registrations can both pass the liveness
// check. The parent always exists: if it exits, the process is reparented.
export const otherLivePid = process.ppid;
