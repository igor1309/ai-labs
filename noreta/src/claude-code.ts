import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import type { ObservedSession, SessionSource } from "./sessions.js";

// Reads the sessions Claude Code leaves on disk: one JSONL transcript per
// session, under one directory per project. That directory's name is the
// workspace path with its separators replaced, which is lossy — the workspace
// is read from the records instead.
export function claudeCodeSessions(projectsDirectory: string): SessionSource {
  return (): ObservedSession[] =>
    transcriptFiles(projectsDirectory).flatMap(observedSession);
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
function observedSession(file: string): ObservedSession[] {
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
      lastActivityAt: new Date(context.timestamp),
    },
  ];
}

// Claude Code writes "HEAD" when the workspace has no branch checked out: it is
// not in a repository, or its HEAD is detached.
function isBranch(gitBranch: string): boolean {
  return gitBranch !== "HEAD";
}

function contextRecords(file: string): SessionContext[] {
  return readFileSync(file, "utf8").split("\n").flatMap(parsedRecord).filter(isContext);
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
