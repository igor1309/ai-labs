import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type TranscriptRecord = Record<string, unknown>;

export type WrittenSession = { id: string; records: TranscriptRecord[] };

// Writes a Claude Code projects directory — one subdirectory holding one JSONL
// transcript per session — and returns its path. The subdirectory's name is the
// workspace path with its separators replaced, which is lossy, so nothing here
// or in the adapter reads it.
export function projectsDirectoryOf(...sessions: WrittenSession[]): string {
  const root = mkdtempSync(join(tmpdir(), "noreta-projects-"));

  writeProject(root, "-a-project", ...sessions);

  return root;
}

// Adds another project subdirectory, for sessions that ran somewhere else.
export function writeProject(
  projectsDirectory: string,
  name: string,
  ...sessions: WrittenSession[]
): void {
  const project = join(projectsDirectory, name);

  mkdirSync(project);

  for (const session of sessions) {
    writeFileSync(join(project, `${session.id}.jsonl`), asJsonl(session.records));
  }
}

// Not every entry beside the projects is a project: macOS leaves a `.DS_Store`
// wherever a window has been opened.
export function writeStrayFile(projectsDirectory: string, name: string): void {
  writeFileSync(join(projectsDirectory, name), "");
}

export function existingDirectory(): string {
  return mkdtempSync(join(tmpdir(), "noreta-workspace-"));
}

function asJsonl(records: TranscriptRecord[]): string {
  return records.map((record) => `${JSON.stringify(record)}\n`).join("");
}

// The shape Claude Code writes for a record that carries session context.
export function userRecord(session: {
  id: string;
  workspace?: string;
  branch?: string;
  at: Date;
}): TranscriptRecord {
  return {
    type: "user",
    sessionId: session.id,
    cwd: session.workspace ?? unspecifiedWorkspace,
    gitBranch: session.branch ?? unspecifiedBranch,
    timestamp: session.at.toISOString(),
  };
}

const unspecifiedWorkspace = "/nowhere/a-workspace";
const unspecifiedBranch = "trunk";

// A live session is appended to while it is read, so its last line can be half
// written. Reproduces that without racing a writer.
export function appendPartialRecord(projectsDirectory: string, session: string): void {
  appendFileSync(
    join(projectsDirectory, "-a-project", `${session}.jsonl`),
    '{"type":"user","sessionId":"',
  );
}
