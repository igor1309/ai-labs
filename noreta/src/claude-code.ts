import { readFileSync } from "node:fs";

import { parsedRecord, tailOf, transcriptFiles } from "./claude-code-files.js";

// The states this adapter tells apart, and nothing besides. Narrower than the
// states a reader can show: a runtime knows a session is blocked without
// knowing what on — Claude Code's registry reports that it is waiting and never
// which answer it wants — so the two waiting kinds are not among these. What a
// runtime can supply is what this admits, and it widens when one arrives that
// can tell them apart.
// Every word here is something a running session is doing, so there is none for
// not running: that is the absence of a state, and the field is absent for it.
// These are this adapter's words, not a vocabulary its readers share: a
// runtime's own words are put to them in composition —
// `compose-claude-code-runtime-states.ts` — and a reader names what it shows
// for each.
export type RuntimeState = "working" | "waiting" | "idle";

// What this adapter reports about a session it found on disk. Its own record:
// another source describes its sessions in its own terms, and a consumer takes
// the records it was handed rather than a shape the sources agree on.
export type ObservedSession = {
  id: string;
  agent: string;
  // Where the session is working: its directory, which for a worktree is the
  // worktree's own path rather than the repository root. A deleted worktree
  // keeps its path — the session stays associated with where it ran — and is
  // reported as gone rather than collapsed into the repository root.
  workspace: string;
  workspaceOnDisk: boolean;
  // Present when that directory is in a repository, and when that repository
  // has a branch checked out.
  repository?: string;
  branch?: string;
  // Present while the session is running. Absent is the source saying it is
  // not — there is nothing it could be doing.
  runtimeState?: RuntimeState;
  lastActivityAt: Date;
};

export type SessionSource = () => ObservedSession[];

// What a runtime can tell this adapter a session is doing. Undefined when the
// session is not running. Sessions start and stop while a source is held open,
// so the answer is only true of the moment it was asked for: the outer call
// takes that snapshot, and the type says where "now" is.
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
  // A session the runtime says nothing about is not running, and carries no
  // state rather than a word standing in for its absence.
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
