import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import { listProfiles, loadProfile, saveProfile, type AgentProfile, type RuntimeVocabulary } from "./agents.js";
import { candidateInputs, defaultBase, resolveCandidate, withCandidateWorktree, type Candidate } from "./candidate.js";
import {
  composePolicy,
  listProcesses,
  loadPolicy,
  loadProcess,
  type EffectivePolicy,
  type ProcessDefinition,
  type ServiceCeiling,
} from "./config.js";
import { InputError } from "./errors.js";
import { OUTPUT_SCHEMAS, type OutputSchema } from "./output-schemas.js";
import { createRun, listRuns, newRunId, readRun, type RunRecord } from "./run-store.js";
import { CAPABILITIES, type Capability, type ExecutionPolicy, type RuntimeAdapter, type RuntimeEvent, type TurnRequest, type TurnResult } from "./runtime.js";

export { InputError } from "./errors.js";

// Agister's use cases, independent of any concrete runtime. Runtimes arrive
// through the catalog; which ones exist, how they are built and what wraps
// them is decided by the composition root. Processes and policies are
// configuration files, composed here into one effective definition per run.

export interface RuntimeProvider {
  readonly runtime: string;
  readonly efforts: readonly string[];
  create(options: { command?: string }): RuntimeAdapter;
}

export type RuntimeCatalog = ReadonlyMap<string, RuntimeProvider>;

// Provenance Agister itself recorded for a revision it produced. Absent for
// anything Agister did not write.
export interface Provenance {
  writer?: { agent: string; modelFamily: string; runId: string };
}

export interface AgisterDependencies {
  stateDirectory: string;
  runtimes: RuntimeCatalog;
  ceiling: ServiceCeiling;
  // Example definitions copied by `init`.
  templatesDirectory?: string;
  // Runs `body` with correlation fields attached to diagnostics.
  scope?: <T>(fields: Record<string, unknown>, body: () => Promise<T>) => Promise<T>;
  provenance?: (revision: string) => Promise<Provenance | undefined>;
  newId?: () => string;
  now?: () => Date;
}

export interface TurnOptions {
  timeoutMs?: number;
  onEvent?: (event: RuntimeEvent) => void;
  signal?: AbortSignal;
}

export interface PromptRun extends TurnOptions {
  agent: string;
  prompt: string;
  cwd: string;
  allow?: string[];
}

export interface ProcessRun extends TurnOptions {
  process: string;
  cwd: string;
  // Replaces the process's `uses:` agent for this run (recorded).
  agent?: string;
  base?: string;
  candidate?: string;
  // Named inputs; a value "@path" is read from that file.
  inputs?: Record<string, string>;
  onCandidate?: (candidate: Candidate, agent: AgentProfile) => void;
}

export interface ProcessView {
  definition: ProcessDefinition;
  policy?: string;
  effective: EffectivePolicy;
  agent: AgentProfile;
  // Why the agent's runtime cannot enforce the effective policy, if it cannot.
  runtimeProblems: string[];
}

export interface Agister {
  runtimes(): string[];
  init(options?: { overwrite?: boolean }): Promise<{ created: string[]; skipped: string[] }>;
  createAgent(profile: AgentProfile, options?: { overwrite?: boolean }): Promise<string>;
  listAgents(): Promise<AgentProfile[]>;
  listProcesses(): Promise<ProcessDefinition[]>;
  showProcess(name: string, agent?: string): Promise<ProcessView>;
  runProcess(run: ProcessRun): Promise<{ record: RunRecord; output?: unknown }>;
  runPrompt(run: PromptRun): Promise<RunRecord>;
  listRuns(): RunRecord[];
  readRun(id: string): RunRecord;
  resumeHint(record: RunRecord): string | undefined;
}

// Inputs derived from a candidate; requiring any of them makes a process
// candidate-bound.
const CANDIDATE_INPUTS = ["base_revision", "merge_base", "candidate_revision", "changed_files", "diff"];
const INLINE_INPUT_CHARS = 2_000;

export function createAgister(dependencies: AgisterDependencies): Agister {
  const { stateDirectory, runtimes, ceiling } = dependencies;
  const scope = dependencies.scope ?? ((_fields, body) => body());
  const newId = dependencies.newId ?? (() => randomUUID());
  const now = dependencies.now ?? (() => new Date());
  const provenance = dependencies.provenance ?? ((revision) => readProvenance(stateDirectory, revision));
  const vocabulary: RuntimeVocabulary = new Map([...runtimes].map(([name, provider]) => [name, provider.efforts]));

  const provider = (runtime: string): RuntimeProvider =>
    runtimes.get(runtime) ?? inputError(`unsupported runtime: ${runtime} (supported: ${[...runtimes.keys()].join(", ")})`);

  const adapterFor = (profile: AgentProfile): RuntimeAdapter =>
    provider(profile.runtime).create(profile.command ? { command: profile.command } : {});

  const agentProfile = (name: string) => loadProfile(stateDirectory, name, vocabulary);

  async function resolveProcess(name: string, agentOverride?: string) {
    const definition = await loadProcess(stateDirectory, name);
    const policy = definition.policy ? await loadPolicy(stateDirectory, definition.policy) : undefined;
    const effective = composePolicy(definition, policy, ceiling);
    const schema = OUTPUT_SCHEMAS.get(definition.outputSchema)
      ?? inputError(`process ${name}: unknown output schema ${definition.outputSchema} (known: ${[...OUTPUT_SCHEMAS.keys()].join(", ")})`);
    const profile = await agentProfile(agentOverride ?? definition.agent);
    const adapter = adapterFor(profile);
    return { definition, policy, effective, schema, profile, adapter };
  }

  function enforceable(adapter: RuntimeAdapter, profile: AgentProfile, policy: ExecutionPolicy, subject: string): void {
    const problems = adapter.checkPolicy(policy);
    if (problems.length > 0) {
      inputError(`agent ${profile.name} (${profile.runtime}) cannot enforce ${subject}:\n  ${problems.join("\n  ")}`);
    }
  }

  async function execute(invocation: {
    profile: AgentProfile;
    adapter: RuntimeAdapter;
    process: string;
    inputs: Record<string, unknown>;
    definition?: Record<string, unknown>;
    prompt: string;
    cwd: string;
    policy: ExecutionPolicy;
    options: TurnOptions;
    appendSystemPrompt?: string;
    schema?: OutputSchema;
    // Checked after the run is recorded and before the runtime starts; a
    // refusal is recorded as the run's outcome and nothing is spawned.
    preflight?: (event: (event: RuntimeEvent) => void) => Promise<string | undefined>;
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
    if (invocation.definition) record.definition = invocation.definition;

    return scope({ runId: record.id, process: invocation.process, agent: profile.name }, async () => {
      const handle = createRun(stateDirectory, record, now);
      const emit = (event: RuntimeEvent) => {
        handle.event(event);
        options.onEvent?.(event);
      };

      const refusal = await invocation.preflight?.(emit);
      if (refusal) return handle.finish({ outcome: "failed", reason: refusal });

      const request: TurnRequest = { prompt: invocation.prompt, cwd: invocation.cwd, policy: invocation.policy };
      if (sessionId) request.sessionId = sessionId;
      if (profile.model) request.model = profile.model;
      if (profile.effort) request.effort = profile.effort;
      if (invocation.appendSystemPrompt) request.appendSystemPrompt = invocation.appendSystemPrompt;
      if (invocation.schema) request.outputSchema = invocation.schema.jsonSchema;
      if (options.signal) request.signal = options.signal;

      let result: TurnResult = await adapter.runTurn(request, { event: emit, raw: (line) => handle.raw(line) });

      // The turn completing is not the process succeeding: the output must
      // still satisfy the process's own contract.
      let output: unknown;
      if (result.outcome === "completed" && invocation.schema) {
        try {
          output = invocation.schema.validate(result.structuredOutput);
        } catch (error) {
          result = { ...result, outcome: "failed", reason: error instanceof Error ? error.message : String(error) };
        }
      }
      return handle.finish(result, output);
    });
  }

  return {
    runtimes: () => [...runtimes.keys()],

    async init(options = {}) {
      const templates = dependencies.templatesDirectory ?? inputError("no example definitions are available");
      const created: string[] = [];
      const skipped: string[] = [];
      for (const file of await walk(templates)) {
        const target = join(stateDirectory, relative(templates, file));
        if (!options.overwrite && (await exists(target))) {
          skipped.push(target);
          continue;
        }
        await mkdir(resolve(target, ".."), { recursive: true });
        await copyFile(file, target);
        created.push(target);
      }
      return { created, skipped };
    },

    async createAgent(profile, options = {}) {
      const { efforts } = provider(profile.runtime);
      if (profile.effort && !efforts.includes(profile.effort)) {
        inputError(`unsupported ${profile.runtime} effort: ${profile.effort} (supported: ${efforts.join(", ")})`);
      }
      return saveProfile(stateDirectory, profile, vocabulary, options);
    },

    listAgents: () => listProfiles(stateDirectory, vocabulary),

    listProcesses: () => listProcesses(stateDirectory),

    async showProcess(name, agent) {
      const { definition, policy, effective, profile, adapter } = await resolveProcess(name, agent);
      const view: ProcessView = {
        definition,
        effective,
        agent: profile,
        runtimeProblems: adapter.checkPolicy({ capabilities: effective.capabilities, isolateConfig: true, timeoutMs: effective.timeoutMs }),
      };
      if (policy) view.policy = policy.name;
      return view;
    },

    async runProcess(run) {
      const { definition, policy, effective, schema, profile, adapter } = await resolveProcess(run.process, run.agent);
      const executionPolicy: ExecutionPolicy = {
        capabilities: effective.capabilities,
        isolateConfig: true,
        // A caller may shorten the effective timeout, never extend it.
        timeoutMs: Math.min(effective.timeoutMs, run.timeoutMs ?? Infinity),
      };
      enforceable(adapter, profile, executionPolicy, `process ${definition.name}'s policy`);
      for (const constraint of effective.constraints) {
        if (!profile.modelFamily) {
          inputError(`process ${definition.name} constrains ${constraint.subject}, but agent ${profile.name} declares no model_family`);
        }
      }

      // Inputs: derived from the candidate when the process needs one, plus
      // named inputs; exactly the required set, nothing missing or extra.
      const needsCandidate = effective.scope === "candidate" || definition.required.some((name) => CANDIDATE_INPUTS.includes(name));
      const candidate = needsCandidate
        ? await resolveCandidate(run.cwd, run.base ?? (await defaultBase(run.cwd)), run.candidate ?? "HEAD")
        : undefined;
      if (candidate) run.onCandidate?.(candidate, profile);

      const provided: Record<string, unknown> = candidate ? candidateInputs(candidate) : {};
      const extra = Object.keys(run.inputs ?? {}).filter((name) => !definition.required.includes(name));
      if (extra.length > 0) inputError(`process ${definition.name} does not take inputs: ${extra.join(", ")} (required: ${definition.required.join(", ") || "none"})`);
      for (const [name, value] of Object.entries(run.inputs ?? {})) {
        provided[name] = value.startsWith("@") ? await readFile(resolve(run.cwd, value.slice(1)), "utf8") : value;
      }
      const missing = definition.required.filter((name) => provided[name] === undefined);
      if (missing.length > 0) inputError(`process ${definition.name} is missing required inputs: ${missing.join(", ")} (pass --input <name>=<value|@file>)`);
      const inputs = Object.fromEntries(definition.required.map((name) => [name, provided[name]]));

      const sources = [definition.source, ...(policy ? [policy.source] : [])];
      const invocation = {
        profile, adapter, schema,
        process: definition.name,
        inputs: summarizeInputs(inputs),
        definition: {
          process: definition.name,
          policy: policy?.name,
          agent: profile.name,
          agentOverridden: run.agent !== undefined && run.agent !== definition.agent,
          outputSchema: definition.outputSchema,
          effective,
          sources,
        },
        prompt: renderInputs(inputs),
        appendSystemPrompt: renderInstruction(definition, effective),
        policy: executionPolicy,
        options: run,
        preflight: async (emit: (event: RuntimeEvent) => void) => {
          for (const constraint of effective.constraints) {
            const revision = String(inputs[constraint.candidateInput]);
            const writer = (await provenance(revision))?.writer;
            const satisfied = writer === undefined || writer.modelFamily !== profile.modelFamily;
            emit({
              source: "adapter",
              kind: "CONSTRAINT_CHECKED",
              data: {
                subject: constraint.subject,
                agentModelFamily: profile.modelFamily,
                writerModelFamily: writer?.modelFamily ?? null,
                basis: writer ? `provenance of run ${writer.runId}` : `no Agister-recorded agent provenance for ${revision}`,
                satisfied,
              },
            });
            if (!satisfied) {
              return `constraint_unsatisfied: ${constraint.subject} ${profile.modelFamily} equals the candidate writer's (run ${writer!.runId})`;
            }
          }
          return undefined;
        },
      };

      const record = effective.scope === "candidate"
        ? await withCandidateWorktree(candidate!, (workspace) => execute({ ...invocation, cwd: workspace }))
        : await execute({ ...invocation, cwd: run.cwd });
      return record.result?.outcome === "completed" ? { record, output: record.output } : { record };
    },

    async runPrompt(run) {
      const profile = await agentProfile(run.agent);
      const adapter = adapterFor(profile);
      const allow = run.allow ?? ["repository.read", "repository.search"];
      const unknown = allow.filter((capability) => !(CAPABILITIES as readonly string[]).includes(capability));
      if (unknown.length > 0) inputError(`unknown capabilities: ${unknown.join(", ")} (known: ${CAPABILITIES.join(", ")})`);
      const policy: ExecutionPolicy = {
        capabilities: allow as Capability[],
        isolateConfig: true,
        timeoutMs: Math.min(run.timeoutMs ?? ceiling.maxTimeoutMs, ceiling.maxTimeoutMs),
      };
      enforceable(adapter, profile, policy, `capabilities ${allow.join(", ")}`);
      return execute({
        profile, adapter, policy,
        process: "ad-hoc",
        inputs: { prompt: truncate(run.prompt, INLINE_INPUT_CHARS) },
        prompt: run.prompt,
        cwd: run.cwd,
        options: run,
      });
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

// ---------------------------------------------------------------------------
// Rendering a process for the agent

export function renderInstruction(definition: ProcessDefinition, effective: EffectivePolicy): string {
  const lines = [definition.instruction.trim(), ""];
  lines.push(`Permitted: ${effective.capabilities.join(", ") || "nothing beyond reading this prompt"}. Anything else is denied by policy.`);
  if (effective.access === "read-only") lines.push("The workspace is read-only; do not attempt to modify it.");
  if (effective.scope === "candidate") lines.push("The working directory is a checkout of the candidate revision.");
  lines.push(`Return the result as structured output conforming to ${definition.outputSchema}.`);
  return lines.join("\n");
}

export function renderInputs(inputs: Record<string, unknown>): string {
  return Object.entries(inputs)
    .map(([name, value]) => `## ${name}\n\n${renderValue(name, value)}`)
    .join("\n\n");
}

function renderValue(name: string, value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => `- ${String(item)}`).join("\n");
  if (typeof value === "string") return value.includes("\n") ? `\`\`\`${name === "diff" ? "diff" : ""}\n${value}\n\`\`\`` : value;
  return JSON.stringify(value, null, 2);
}

// Run records keep small inputs verbatim and large ones as a digest.
function summarizeInputs(inputs: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(inputs).map(([name, value]) => {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    if (text.length <= INLINE_INPUT_CHARS) return [name, value];
    return [name, { sha256: createHash("sha256").update(text).digest("hex"), chars: text.length }];
  }));
}

// ---------------------------------------------------------------------------

async function readProvenance(stateDirectory: string, revision: string): Promise<Provenance | undefined> {
  try {
    return JSON.parse(await readFile(join(stateDirectory, "provenance", `${revision}.json`), "utf8")) as Provenance;
  } catch {
    return undefined;
  }
}

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : Promise.resolve([path]);
  }));
  return files.flat().sort();
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(() => true, () => false);
}

function inputError(message: string): never {
  throw new InputError(message);
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}
