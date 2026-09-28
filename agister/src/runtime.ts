// Provider-neutral contract between Agister and a runtime adapter.
//
// One call runs one provider turn in a fresh process. The adapter owns every
// provider detail (arguments, stream format, exit semantics) and reports a
// normalized outcome plus ordered events. It never decides whether the task
// itself succeeded; that belongs to the process or workflow above it.

export type TurnOutcome = "completed" | "failed" | "interrupted" | "lost";

export interface ExecutionPolicy {
  // What the agent may do to the workspace. Each adapter maps this onto its
  // runtime's own mechanism (Claude Code: tool set; Codex: OS sandbox).
  workspace: "read-only" | "workspace-write";
  // Ignore user/project runtime configuration (settings, hooks, MCP servers,
  // rules) so the run depends only on what Agister passes.
  isolateConfig: boolean;
  timeoutMs: number;
  // Explicit tool surface, for runtimes with the `toolSurface` capability.
  // Absent means the adapter's default for `workspace`. Runtimes without the
  // capability reject it rather than silently ignoring it.
  tools?: {
    // Tools exposed to the agent. An empty list exposes none.
    expose: string[];
    // Permission rules that run without asking, e.g. "Bash(git diff:*)".
    // Anything else is denied: turns are unattended.
    allow: string[];
  };
}

export interface TurnRequest {
  prompt: string;
  cwd: string;
  // Agister-minted provider session ID. Only honoured by adapters with the
  // `presetSessionId` capability; others report the provider's own ID.
  sessionId?: string;
  model?: string;
  effort?: string;
  appendSystemPrompt?: string;
  outputSchema?: object;
  policy: ExecutionPolicy;
  signal?: AbortSignal;
}

export type EventSource = "protocol" | "process" | "adapter";

export interface RuntimeEvent {
  source: EventSource;
  kind: string;
  data?: Record<string, unknown>;
}

export interface TurnResult {
  outcome: TurnOutcome;
  reason?: string;
  providerSessionId?: string;
  model?: string;
  structuredOutput?: unknown;
  text?: string;
  costUsd?: number;
  usage?: Record<string, unknown>;
  durationMs?: number;
  numTurns?: number;
  permissionDenials?: unknown[];
  exit?: { code: number | null; signal: string | null };
  stderrTail?: string;
}

export interface TurnObserver {
  event(event: RuntimeEvent): void;
  // Raw provider output, kept verbatim for diagnosis.
  raw?(line: string): void;
}

export interface RuntimeCapabilities {
  // The caller can choose the provider session ID before the turn starts.
  presetSessionId: boolean;
  // The workspace policy is enforced through a named tool surface that the
  // caller may narrow (`ExecutionPolicy.tools`), rather than an OS sandbox.
  toolSurface: boolean;
}

export interface RuntimeAdapter {
  readonly runtime: string;
  readonly capabilities: RuntimeCapabilities;
  runTurn(request: TurnRequest, observer: TurnObserver): Promise<TurnResult>;
  // How a person reopens the provider session natively.
  resumeHint(providerSessionId: string): string;
}
