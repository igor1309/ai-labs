import { readFileSync } from "node:fs";

import { parsedRecord, tailOf, transcriptFiles } from "./claude-code-files.js";
import { byTime } from "./ordering.js";

export type RuntimeState = "working" | "waiting" | "idle";

export type ObservedSession = {
  id: string;
  agent: string;
  workspace: string;
  workspaceOnDisk: boolean;
  repository?: string;
  branch?: string;
  runtimeState?: RuntimeState;
  lastActivityAt: Date;
};

export type SessionSource = () => ObservedSession[];

// What a runtime can tell this adapter a session is doing. Undefined when the
// session is not running. Sessions start and stop while a source is held open,
// so the answer is only true of the moment it was asked for: the outer call
// takes that snapshot, and the type says where "now" is.
export type RuntimeStates = () => (sessionId: string) => RuntimeState | undefined;

type RuntimeSnapshot = ReturnType<RuntimeStates>;

export type WorkspaceFacts = (workspace: string) => {
  onDisk: boolean;
  repository?: string;
};

export function claudeCodeSessions(
  projectsDirectory: string,
  runtimeStates: RuntimeStates,
  workspaceFacts: WorkspaceFacts,
): SessionSource {
  return (): ObservedSession[] => {
    const snapshot = runtimeStates();

    return newestPerSession(
      transcriptFiles(projectsDirectory).flatMap((file) =>
        observedSession(file, snapshot, workspaceFacts),
      ),
    );
  };
}

function newestPerSession(sessions: ObservedSession[]): ObservedSession[] {
  const newest = new Map<string, ObservedSession>();

  for (const session of sessions) {
    const known = newest.get(session.id);

    if (known === undefined || newerFirst(session, known) < 0) {
      newest.set(session.id, session);
    }
  }

  return [...newest.values()];
}

const newerFirst = byTime((session: ObservedSession) => session.lastActivityAt, "newest-first");

type SessionContext = {
  sessionId: string;
  cwd: string;
  gitBranch: string;
  timestamp: string;
};

function observedSession(
  file: string,
  snapshot: RuntimeSnapshot,
  workspaceFacts: WorkspaceFacts,
): ObservedSession[] {
  const records = contextRecords(file);
  const context = records[records.length - 1];

  if (context === undefined) {
    return [];
  }

  const workspace = workspaceFacts(context.cwd);
  const runtimeState = snapshot(context.sessionId);

  return [
    {
      id: context.sessionId,
      agent: "claude",
      workspace: context.cwd,
      workspaceOnDisk: workspace.onDisk,
      ...(workspace.repository === undefined ? {} : { repository: workspace.repository }),
      ...(isBranch(context.gitBranch) ? { branch: context.gitBranch } : {}),
      ...(runtimeState === undefined ? {} : { runtimeState }),
      lastActivityAt: new Date(context.timestamp),
    },
  ];
}

function isBranch(gitBranch: string): boolean {
  return gitBranch !== "HEAD";
}

function contextRecords(file: string): SessionContext[] {
  const tail = tailOf(file);
  const found = contextIn(tail.text);

  return found.length > 0 || tail.whole ? found : contextIn(readFileSync(file, "utf8"));
}

function contextIn(text: string): SessionContext[] {
  return text.split("\n").flatMap(parsedRecord<Partial<SessionContext>>).filter(isContext);
}

function isContext(record: Partial<SessionContext>): record is SessionContext {
  return (
    record.sessionId !== undefined &&
    record.cwd !== undefined &&
    record.gitBranch !== undefined &&
    record.timestamp !== undefined
  );
}
