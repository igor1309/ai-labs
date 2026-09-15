import {
  closeSync,
  existsSync,
  fstatSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";

import type { ObservedSession, RuntimeState, SessionSource } from "./sessions.js";

// What the adapter needs to know about a session that a transcript cannot say:
// whether it is running now, and what it is doing. Undefined when the session
// is not running.
export type RuntimeStates = (sessionId: string) => RuntimeState | undefined;

// Reads the sessions Claude Code leaves on disk: one JSONL transcript per
// session, under one directory per project. That directory's name is the
// workspace path with its separators replaced, which is lossy — the workspace
// is read from the records instead.
export function claudeCodeSessions(
  projectsDirectory: string,
  runtimeStates: RuntimeStates,
): SessionSource {
  return (): ObservedSession[] =>
    transcriptFiles(projectsDirectory).flatMap((file) =>
      observedSession(file, runtimeStates),
    );
}

// What a record has to carry to describe its session. Records that do not —
// mode changes, attachments, titles — say nothing about where it is working.
type SessionContext = {
  sessionId: string;
  cwd: string;
  gitBranch: string;
  timestamp: string;
};

// The newest record describes the session now: its branch moves with the
// checkout, and its timestamp is the last thing the session did.
function observedSession(
  file: string,
  runtimeStates: RuntimeStates,
): ObservedSession[] {
  const records = contextRecords(file);
  const context = records[records.length - 1];

  if (context === undefined) {
    return [];
  }

  return [
    {
      id: context.sessionId,
      agent: "claude",
      workspace: context.cwd,
      workspaceOnDisk: existsSync(context.cwd),
      ...(isBranch(context.gitBranch) ? { branch: context.gitBranch } : {}),
      ...runtimeStateOf(runtimeStates(context.sessionId)),
      lastActivityAt: new Date(context.timestamp),
    },
  ];
}

// A session that is not running carries no runtime state at all, which is what
// makes it inactive.
function runtimeStateOf(state: RuntimeState | undefined): { runtimeState?: RuntimeState } {
  return state === undefined ? {} : { runtimeState: state };
}

// Claude Code writes "HEAD" when the workspace has no branch checked out: it is
// not in a repository, or its HEAD is detached.
function isBranch(gitBranch: string): boolean {
  return gitBranch !== "HEAD";
}

// The newest context record sits at the end of a transcript, and transcripts
// run to megabytes, so only the tail is read. The whole file is read only when
// the tail holds no context record at all.
function contextRecords(file: string): SessionContext[] {
  const tail = tailOf(file);
  const found = contextIn(tail.text);

  return found.length > 0 || tail.whole ? found : contextIn(readFileSync(file, "utf8"));
}

const tailBytes = 64 * 1024;

// A tail that starts inside the file starts inside a line, so that first
// fragment is dropped rather than left to parse by accident.
function tailOf(file: string): { text: string; whole: boolean } {
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

function contextIn(text: string): SessionContext[] {
  return text.split("\n").flatMap(parsedRecord).filter(isContext);
}

// A running session is appended to while it is read, so its last line can be
// half written. One unreadable line is not a reason to lose the session.
function parsedRecord(line: string): Partial<SessionContext>[] {
  try {
    return [JSON.parse(line) as Partial<SessionContext>];
  } catch {
    return [];
  }
}

function isContext(record: Partial<SessionContext>): record is SessionContext {
  return (
    record.sessionId !== undefined &&
    record.cwd !== undefined &&
    record.gitBranch !== undefined &&
    record.timestamp !== undefined
  );
}

function transcriptFiles(projectsDirectory: string): string[] {
  return readdirSync(projectsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((project) => transcriptsIn(join(projectsDirectory, project.name)));
}

function transcriptsIn(project: string): string[] {
  return readdirSync(project)
    .filter((file) => file.endsWith(".jsonl"))
    .map((file) => join(project, file));
}
