import { randomUUID } from "node:crypto";

import { listProfiles, loadProfile, saveProfile, type AgentProfile, type RuntimeVocabulary } from "./agents.js";
import {
  defaultBase,
  resolveReviewTarget,
  REVIEW_INSTRUCTION,
  REVIEW_OUTPUT_SCHEMA,
  reviewPolicy,
  reviewPrompt,
  validateReviewResult,
  withCandidateWorktree,
  type ReviewResult,
  type ReviewTarget,
} from "./review.js";
import { createRun, listRuns, newRunId, readRun, type RunRecord } from "./run-store.js";
import type { ExecutionPolicy, RuntimeAdapter, RuntimeEvent, TurnRequest, TurnResult } from "./runtime.js";

// Agister's use cases, independent of any concrete runtime. Runtimes arrive
// through the catalog; which ones exist, how they are built and what wraps
// them is decided by the composition root.

export interface RuntimeProvider {
  readonly runtime: string;
  readonly efforts: readonly string[];
  create(options: { command?: string }): RuntimeAdapter;
}

export type RuntimeCatalog = ReadonlyMap<string, RuntimeProvider>;

// Caller mistakes (unknown runtime, unsupported option for a runtime), as
// opposed to failures while doing the work.
export class InputError extends Error {}

export interface AgisterDependencies {
  stateDirectory: string;
  runtimes: RuntimeCatalog;
  // Runs `body` with correlation fields attached to diagnostics.
  scope?: <T>(fields: Record<string, unknown>, body: () => Promise<T>) => Promise<T>;
  newId?: () => string;
  now?: () => Date;
}

export interface TurnOptions {
  agent: string;
  timeoutMs: number;
  onEvent?: (event: RuntimeEvent) => void;
  signal?: AbortSignal;
}

export interface PromptRun extends TurnOptions {
  prompt: string;
  cwd: string;
  tools?: { expose?: string[]; allow?: string[] };
}

export interface ReviewRun extends TurnOptions {
  cwd: string;
  base?: string;
  candidate: string;
  onTarget?: (target: ReviewTarget, profile: AgentProfile) => void;
}

export interface Agister {
  runtimes(): string[];
  createAgent(profile: AgentProfile, options?: { overwrite?: boolean }): Promise<string>;
  listAgents(): Promise<AgentProfile[]>;
  runPrompt(run: PromptRun): Promise<RunRecord>;
  review(run: ReviewRun): Promise<{ record: RunRecord; review?: ReviewResult }>;
  listRuns(): RunRecord[];
  readRun(id: string): RunRecord;
  resumeHint(record: RunRecord): string | undefined;
}

export function createAgister(dependencies: AgisterDependencies): Agister {
  const { stateDirectory, runtimes } = dependencies;
  const scope = dependencies.scope ?? ((_fields, body) => body());
  const newId = dependencies.newId ?? (() => randomUUID());
  const now = dependencies.now ?? (() => new Date());
  const vocabulary: RuntimeVocabulary = new Map([...runtimes].map(([name, provider]) => [name, provider.efforts]));

  const provider = (runtime: string): RuntimeProvider =>
    runtimes.get(runtime) ?? inputError(`unsupported runtime: ${runtime} (supported: ${[...runtimes.keys()].join(", ")})`);

  const adapterFor = (profile: AgentProfile): RuntimeAdapter =>
    provider(profile.runtime).create(profile.command ? { command: profile.command } : {});

  async function execute(invocation: {
    profile: AgentProfile;
    adapter: RuntimeAdapter;
    process: string;
    inputs: Record<string, unknown>;
    prompt: string;
    cwd: string;
    policy: ExecutionPolicy;
    options: TurnOptions;
    appendSystemPrompt?: string;
    outputSchema?: object;
    interpret?: (output: unknown) => unknown;
  }): Promise<RunRecord> {
    const { profile, adapter, options } = invocation;
    const sessionId = adapter.capabilities.presetSessionId ? newId() : undefined;
    const record: Parameters<typeof createRun>[1] = {
      id: newRunId(now(), () => newId().replace(/-/g, "")),
      process: invocation.process,
      agent: profile.name,
      runtime: adapter.runtime,
      workspace: invocation.cwd,
      inputs: invocation.inputs,
    };
    if (sessionId) record.requestedSessionId = sessionId;

    return scope({ runId: record.id, process: invocation.process, agent: profile.name }, async () => {
      const handle = createRun(stateDirectory, record, now);
      const request: TurnRequest = { prompt: invocation.prompt, cwd: invocation.cwd, policy: invocation.policy };
      if (sessionId) request.sessionId = sessionId;
      if (profile.model) request.model = profile.model;
      if (profile.effort) request.effort = profile.effort;
      if (invocation.appendSystemPrompt) request.appendSystemPrompt = invocation.appendSystemPrompt;
      if (invocation.outputSchema) request.outputSchema = invocation.outputSchema;
      if (options.signal) request.signal = options.signal;

      let result: TurnResult = await adapter.runTurn(request, {
        event: (event) => {
          handle.event(event);
          options.onEvent?.(event);
        },
        raw: (line) => handle.raw(line),
      });

      // The turn completing is not the process succeeding: the process still
      // has to accept the output against its own contract.
      let output: unknown;
      if (result.outcome === "completed" && invocation.interpret) {
        try {
          output = invocation.interpret(result.structuredOutput);
        } catch (error) {
          result = { ...result, outcome: "failed", reason: error instanceof Error ? error.message : String(error) };
        }
      }
      return handle.finish(result, output);
    });
  }

  return {
    runtimes: () => [...runtimes.keys()],

    async createAgent(profile, options = {}) {
      const { efforts } = provider(profile.runtime);
      if (profile.effort && !efforts.includes(profile.effort)) {
        inputError(`unsupported ${profile.runtime} effort: ${profile.effort} (supported: ${efforts.join(", ")})`);
      }
      return saveProfile(stateDirectory, profile, vocabulary, options);
    },

    listAgents: () => listProfiles(stateDirectory, vocabulary),

    async runPrompt(run) {
      const profile = await loadProfile(stateDirectory, run.agent, vocabulary);
      const adapter = adapterFor(profile);
      const policy: ExecutionPolicy = { workspace: "read-only", isolateConfig: true, timeoutMs: run.timeoutMs };
      if (run.tools) {
        if (!adapter.capabilities.toolSurface) {
          inputError(`agent ${profile.name} (${profile.runtime}) is sandboxed and takes no tool list`);
        }
        const expose = run.tools.expose ?? ["Read", "Grep", "Glob"];
        // Exposed tools are allowed unless the caller narrows them.
        policy.tools = { expose, allow: run.tools.allow ?? expose };
      }
      return execute({
        profile, adapter, policy,
        process: "ad-hoc",
        inputs: { prompt: truncate(run.prompt, 2_000) },
        prompt: run.prompt,
        cwd: run.cwd,
        options: run,
      });
    },

    async review(run) {
      const profile = await loadProfile(stateDirectory, run.agent, vocabulary);
      const adapter = adapterFor(profile);
      const target = await resolveReviewTarget(run.cwd, run.base ?? (await defaultBase(run.cwd)), run.candidate);
      run.onTarget?.(target, profile);

      const record = await withCandidateWorktree(target, (workspace) =>
        execute({
          profile, adapter,
          process: "review",
          inputs: {
            repository: target.repository,
            base: target.base,
            mergeBase: target.mergeBase,
            candidate: target.candidate,
            changedFiles: target.changedFiles,
            diffTruncated: target.diffTruncated,
          },
          prompt: reviewPrompt(target),
          appendSystemPrompt: REVIEW_INSTRUCTION,
          outputSchema: REVIEW_OUTPUT_SCHEMA,
          policy: reviewPolicy(adapter.capabilities, run.timeoutMs),
          cwd: workspace,
          options: run,
          interpret: validateReviewResult,
        }),
      );
      return record.result?.outcome === "completed"
        ? { record, review: record.output as ReviewResult }
        : { record };
    },

    listRuns: () => listRuns(stateDirectory),
    readRun: (id) => readRun(stateDirectory, id),

    resumeHint(record) {
      const sessionId = record.result?.providerSessionId;
      if (!sessionId) return undefined;
      const known = runtimes.get(record.runtime);
      return known ? known.create({}).resumeHint(sessionId) : undefined;
    },
  };
}

function inputError(message: string): never {
  throw new InputError(message);
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}
