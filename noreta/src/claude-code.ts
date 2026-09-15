import { readFileSync } from "node:fs";

import { parsedRecord, tailOf, transcriptFiles } from "./claude-code-files.js";
import type { ObservedSession, RuntimeState, SessionSource } from "./sessions.js";

// What the adapter needs to know about a session that a transcript cannot say:
// whether it is running now, and what it is doing. Undefined when the session
// is not running. Sessions start and stop while a source is held open, so the
// answer is only true of the moment it was asked for: the outer call takes that
// snapshot, and the type says where "now" is.
export type RuntimeStates = () => (sessionId: string) => RuntimeState | undefined;

// One such snapshot, answering for every session in one read.
type RuntimeSnapshot = ReturnType<RuntimeStates>;

// What the adapter needs to know about the directory a session works in that
// the transcript cannot say: whether it is still there, and which repository
// holds it. A transcript records the path a session was given — a workspace can
// be deleted under it, and only the file system knows where it belongs.
export type WorkspaceFacts = (workspace: string) => {
  onDisk: boolean;
  repository?: string;
};

// Reads the sessions Claude Code leaves on disk, one per transcript. Where a
// session is working is read from its records, never from where its file sits.
export function claudeCodeSessions(
  projectsDirectory: string,
  runtimeStates: RuntimeStates,
  workspaceFacts: WorkspaceFacts,
): SessionSource {
  return (): ObservedSession[] => {
    // One snapshot for the whole read, not one per session: the registry is a
    // directory scan, and a read covers every session on the machine.
    const snapshot = runtimeStates();

    return transcriptFiles(projectsDirectory).flatMap((file) =>
      observedSession(file, snapshot, workspaceFacts),
    );
  };
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
  snapshot: RuntimeSnapshot,
  workspaceFacts: WorkspaceFacts,
): ObservedSession[] {
  const records = contextRecords(file);
  const context = records[records.length - 1];

  if (context === undefined) {
    return [];
  }

  // Not taken from the record's branch: a workspace can be in a repository with
  // no branch checked out, and only the file system says which repository.
  const workspace = workspaceFacts(context.cwd);

  return [
    {
      id: context.sessionId,
      agent: "claude",
      workspace: context.cwd,
      workspaceOnDisk: workspace.onDisk,
      ...(workspace.repository === undefined ? {} : { repository: workspace.repository }),
      ...(isBranch(context.gitBranch) ? { branch: context.gitBranch } : {}),
      runtimeState: runtimeStateOf(snapshot(context.sessionId)),
      lastActivityAt: new Date(context.timestamp),
    },
  ];
}

// A session the registry says nothing about is not running, and the adapter says
// so rather than leaving the session with no state for a reader to interpret.
function runtimeStateOf(state: RuntimeState | undefined): RuntimeState {
  return state ?? "inactive";
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
