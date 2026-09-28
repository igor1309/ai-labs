// Provider-neutral contract between Agister and a runtime adapter.
//
// One call runs one provider turn in a fresh process. The adapter owns every
// provider detail (arguments, stream format, exit semantics) and reports a
// normalized outcome plus ordered events. It never decides whether the task
// itself succeeded; that belongs to the process or workflow above it.

export type TurnOutcome = "completed" | "failed" | "interrupted" | "lost";

// Capabilities an agent may be granted, in Agister's own vocabulary. A
// policy states them once; each adapter maps them onto its runtime's
// enforcement mechanism, or refuses the policy if it cannot.
export const CAPABILITIES = [
  "repository.read",          // read files
  "repository.search",        // search file contents
  "repository.diff",          // compare revisions
  "repository.history.read",  // inspect commits and history
  "repository.write",         // modify files in the workspace
  "repository.history.write", // create commits, move refs
  "process.execute",          // run arbitrary commands
  "network",                  // reach the network
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export interface ExecutionPolicy {
  // The effective capability set: granted minus isolation denials, already
  // composed by Agister. An adapter must not let the agent do anything
  // outside it; if its runtime cannot prevent that, it refuses the policy.
  capabilities: Capability[];
  // Ignore user/project runtime configuration (settings, hooks, MCP servers,
  // rules) so the run depends only on what Agister passes.
  isolateConfig: boolean;
  timeoutMs: number;
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
}

export interface RuntimeAdapter {
  readonly runtime: string;
  readonly capabilities: RuntimeCapabilities;
  // Problems enforcing `policy` on this runtime; empty when it can. Checked
  // before a run is created; runTurn refuses the same policies.
  checkPolicy(policy: ExecutionPolicy): string[];
  runTurn(request: TurnRequest, observer: TurnObserver): Promise<TurnResult>;
  // How a person reopens the provider session natively.
  resumeHint(providerSessionId: string): string;
}
