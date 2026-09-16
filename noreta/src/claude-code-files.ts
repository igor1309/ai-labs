import {
  closeSync,
  existsSync,
  fstatSync,
  openSync,
  readSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";

export function transcriptFiles(projectsDirectory: string): string[] {
  return projectDirectories(projectsDirectory).flatMap(transcriptsIn);
}

export function transcriptFilesOf(projectsDirectory: string, sessionId: string): string[] {
  return projectDirectories(projectsDirectory)
    .map((project) => join(project, `${sessionId}.jsonl`))
    .filter((file) => existsSync(file));
}

function projectDirectories(projectsDirectory: string): string[] {
  return readdirSync(projectsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(projectsDirectory, entry.name));
}

function transcriptsIn(project: string): string[] {
  return readdirSync(project)
    .filter((file) => file.endsWith(".jsonl"))
    .map((file) => join(project, file));
}

export function parsedRecord<T>(line: string): T[] {
  try {
    return [JSON.parse(line) as T];
  } catch {
    return [];
  }
}

const tailBytes = 64 * 1024;

// A tail that starts inside the file starts inside a line, so that first
// fragment is dropped rather than left to parse by accident.
export function tailOf(file: string): { text: string; whole: boolean } {
  const handle = openSync(file, "r");

  try {
    const size = fstatSync(handle).size;
    const start = Math.max(0, size - tailBytes);
    const buffer = Buffer.alloc(size - start);

    readSync(handle, buffer, 0, buffer.length, start);

    const text = buffer.toString("utf8");

    return start === 0
      ? { text, whole: true }
      : { text: text.slice(text.indexOf("\n") + 1), whole: false };
  } finally {
    closeSync(handle);
  }
}
