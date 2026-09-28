import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import yaml from "js-yaml";

import { parseDuration } from "./duration.js";
import { InputError } from "./errors.js";
import { CAPABILITIES, type Capability } from "./runtime.js";

// Process and process-policy definitions (YAML) and their composition.
//
//   service ceiling  hard limits; a policy outside them is invalid, not clamped
//   process policy   reusable execution defaults (`.agister/policies/*.yaml`)
//   process          work and data contract; may only narrow its policy
//                    (`.agister/processes/*.yaml`)
//
// Narrowing, field by field:
//   timeout, retry.max_attempts   decrease
//   tools.allow                   remove capabilities
//   workspace.access              read-write -> read-only only
//   workspace.scope               no order: restate the same value or leave unset
//   isolation.deny, resources,
//   artifacts.retain              add
//   constraints                   add; the same subject twice is invalid
// Tool permission and isolation are separate layers; the effective
// capability set is their intersection (allowed minus denied).

export const PROCESS_SCHEMA = "agister.process/v1alpha1";
export const POLICY_SCHEMA = "agister.process-policy/v1alpha1";

export type WorkspaceAccess = "read-only" | "read-write";
export type WorkspaceScope = "candidate" | "repository";

// The only constraint Agister can evaluate so far: the worker's model family
// must differ from the family of the agent that wrote the candidate, taken
// from provenance Agister recorded itself, never from an editable claim.
export interface ModelFamilyConstraint {
  subject: "agent.model_family";
  notEqual: "candidate.writer.model_family";
  candidateInput: string;
  onUnsatisfied: "fail";
}

export interface PolicyFields {
  timeoutMs?: number;
  maxAttempts?: number;
  allow?: Capability[];
  deny?: Capability[];
  access?: WorkspaceAccess;
  scope?: WorkspaceScope;
  resources?: string[];
  retain?: string[];
  constraints?: ModelFamilyConstraint[];
}

export interface Source {
  path: string;
  sha256: string;
}

export interface PolicyDefinition extends PolicyFields {
  name: string;
  source: Source;
}

export interface ProcessDefinition {
  name: string;
  agent: string;
  policy?: string;
  instruction: string;
  required: string[];
  outputSchema: string;
  overrides: PolicyFields;
  source: Source;
}

export interface ServiceCeiling {
  maxTimeoutMs: number;
  maxAttempts: number;
}

export interface EffectivePolicy {
  timeoutMs: number;
  maxAttempts: number;
  allow: Capability[];
  deny: Capability[];
  capabilities: Capability[];
  access: WorkspaceAccess;
  scope: WorkspaceScope;
  resources: string[];
  retain: string[];
  constraints: ModelFamilyConstraint[];
}

const NAME = /^[a-z][a-z0-9_-]*$/;
const POLICY_KEYS = ["timeout", "retry", "tools", "workspace", "isolation", "resources", "artifacts", "constraints"];

// ---------------------------------------------------------------------------
// Loading

export function processesDirectory(stateDirectory: string): string {
  return join(stateDirectory, "processes");
}

export function policiesDirectory(stateDirectory: string): string {
  return join(stateDirectory, "policies");
}

export async function loadProcess(stateDirectory: string, name: string): Promise<ProcessDefinition> {
  const { document, source } = await loadYaml(processesDirectory(stateDirectory), name, "process");
  return parseProcess(document, source, name);
}

export async function loadPolicy(stateDirectory: string, name: string): Promise<PolicyDefinition> {
  const { document, source } = await loadYaml(policiesDirectory(stateDirectory), name, "process policy");
  return parsePolicy(document, source, name);
}

export async function listProcesses(stateDirectory: string): Promise<ProcessDefinition[]> {
  let entries: string[];
  try {
    entries = await readdir(processesDirectory(stateDirectory));
  } catch {
    return [];
  }
  const names = entries.filter((entry) => entry.endsWith(".yaml")).map((entry) => entry.slice(0, -5)).sort();
  return Promise.all(names.map((name) => loadProcess(stateDirectory, name)));
}

async function loadYaml(directory: string, name: string, kind: string): Promise<{ document: unknown; source: Source }> {
  if (!NAME.test(name)) throw new InputError(`invalid ${kind} name: ${name}`);
  const path = join(directory, `${name}.yaml`);
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    throw new InputError(`${kind} not found: ${name} (expected ${path})`);
  }
  let document: unknown;
  try {
    document = yaml.load(text, { schema: yaml.CORE_SCHEMA, filename: path });
  } catch (error) {
    throw new InputError(`${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return { document, source: { path, sha256: createHash("sha256").update(text).digest("hex") } };
}

// ---------------------------------------------------------------------------
// Parsing (strict: unknown fields and unsupported values are errors)

class Reader {
  readonly problems: string[] = [];
  constructor(readonly source: string) {}

  fail(field: string, message: string): undefined {
    this.problems.push(`${field}: ${message}`);
    return undefined;
  }

  object(value: unknown, field: string): Record<string, unknown> | undefined {
    if (typeof value === "object" && value !== null && !Array.isArray(value)) return value as Record<string, unknown>;
    return this.fail(field, "must be a mapping");
  }

  keys(value: Record<string, unknown>, field: string, allowed: string[]): void {
    for (const key of Object.keys(value)) {
      if (!allowed.includes(key)) this.fail(field ? `${field}.${key}` : key, "unknown field");
    }
  }

  string(value: unknown, field: string): string | undefined {
    if (typeof value === "string" && value.trim() !== "") return value;
    return this.fail(field, "must be a non-empty string");
  }

  strings(value: unknown, field: string): string[] | undefined {
    if (Array.isArray(value) && value.every((item) => typeof item === "string" && item !== "")) return value as string[];
    return this.fail(field, "must be a list of strings");
  }

  capabilities(value: unknown, field: string): Capability[] | undefined {
    const items = this.strings(value, field);
    if (!items) return undefined;
    const unknown = items.filter((item) => !(CAPABILITIES as readonly string[]).includes(item));
    if (unknown.length > 0) return this.fail(field, `unknown capabilities: ${unknown.join(", ")} (known: ${CAPABILITIES.join(", ")})`);
    return items as Capability[];
  }

  finish(): void {
    if (this.problems.length > 0) {
      throw new InputError(`${this.source}:\n  ${this.problems.join("\n  ")}`);
    }
  }
}

export function parsePolicy(document: unknown, source: Source, expectedName: string): PolicyDefinition {
  const read = new Reader(source.path);
  const root = read.object(document, "(document)") ?? {};
  read.keys(root, "", ["schema", "name", "status", ...POLICY_KEYS]);
  if (root["schema"] !== POLICY_SCHEMA) read.fail("schema", `must be "${POLICY_SCHEMA}"`);
  const name = read.string(root["name"], "name");
  if (name !== undefined && name !== expectedName) read.fail("name", `"${name}" does not match file name "${expectedName}"`);

  const fields = parsePolicyFields(read, root);
  read.finish();
  return { ...fields, name: expectedName, source };
}

export function parseProcess(document: unknown, source: Source, expectedName: string): ProcessDefinition {
  const read = new Reader(source.path);
  const root = read.object(document, "(document)") ?? {};
  read.keys(root, "", ["schema", "name", "status", "type", "uses", "policy", "input", "output", ...POLICY_KEYS]);
  if (root["schema"] !== PROCESS_SCHEMA) read.fail("schema", `must be "${PROCESS_SCHEMA}"`);
  const name = read.string(root["name"], "name");
  if (name !== undefined && name !== expectedName) read.fail("name", `"${name}" does not match file name "${expectedName}"`);
  if (root["type"] !== "process") read.fail("type", 'must be "process"');

  const uses = read.string(root["uses"], "uses");
  const agent = uses?.startsWith("agent:") ? uses.slice("agent:".length) : read.fail("uses", 'must be "agent:<name>"');

  let policy: string | undefined;
  if (root["policy"] !== undefined) {
    const reference = read.string(root["policy"], "policy");
    policy = reference?.startsWith("process-policy:") ? reference.slice("process-policy:".length) : read.fail("policy", 'must be "process-policy:<name>"');
  }

  const input = read.object(root["input"], "input") ?? {};
  read.keys(input, "input", ["instruction", "required"]);
  const instruction = read.string(input["instruction"], "input.instruction");
  const required = input["required"] === undefined ? [] : read.strings(input["required"], "input.required") ?? [];

  const output = read.object(root["output"], "output") ?? {};
  read.keys(output, "output", ["format", "schema", "require_valid"]);
  if (output["format"] !== "json") read.fail("output.format", 'must be "json"');
  const outputSchema = read.string(output["schema"], "output.schema");
  if (output["require_valid"] !== true) read.fail("output.require_valid", "must be true (accepting invalid output is not supported)");

  const overrides = parsePolicyFields(read, root);
  read.finish();

  const definition: ProcessDefinition = {
    name: expectedName,
    agent: agent!,
    instruction: instruction!,
    required,
    outputSchema: outputSchema!,
    overrides,
    source,
  };
  if (policy) definition.policy = policy;
  return definition;
}

function parsePolicyFields(read: Reader, root: Record<string, unknown>): PolicyFields {
  const fields: PolicyFields = {};

  if (root["timeout"] !== undefined) {
    try {
      fields.timeoutMs = parseDuration(String(root["timeout"]));
    } catch (error) {
      read.fail("timeout", (error as Error).message);
    }
  }

  if (root["retry"] !== undefined) {
    const retry = read.object(root["retry"], "retry");
    if (retry) {
      read.keys(retry, "retry", ["max_attempts"]);
      const attempts = retry["max_attempts"];
      if (Number.isInteger(attempts) && (attempts as number) >= 1) fields.maxAttempts = attempts as number;
      else read.fail("retry.max_attempts", "must be a positive integer");
    }
  }

  if (root["tools"] !== undefined) {
    const tools = read.object(root["tools"], "tools");
    if (tools) {
      read.keys(tools, "tools", ["allow"]);
      const allow = read.capabilities(tools["allow"], "tools.allow");
      if (allow) fields.allow = allow;
    }
  }

  if (root["isolation"] !== undefined) {
    const isolation = read.object(root["isolation"], "isolation");
    if (isolation) {
      read.keys(isolation, "isolation", ["deny"]);
      const deny = read.capabilities(isolation["deny"], "isolation.deny");
      if (deny) fields.deny = deny;
    }
  }

  if (root["workspace"] !== undefined) {
    const workspace = read.object(root["workspace"], "workspace");
    if (workspace) {
      read.keys(workspace, "workspace", ["access", "scope"]);
      const access = workspace["access"];
      if (access === "read-only" || access === "read-write") fields.access = access;
      else if (access !== undefined) read.fail("workspace.access", 'must be "read-only" or "read-write"');
      const scope = workspace["scope"];
      if (scope === "candidate" || scope === "repository") fields.scope = scope;
      else if (scope !== undefined) read.fail("workspace.scope", 'must be "candidate" or "repository"');
    }
  }

  if (root["resources"] !== undefined) {
    const resources = read.strings(root["resources"], "resources");
    if (resources) fields.resources = resources;
  }

  if (root["artifacts"] !== undefined) {
    const artifacts = read.object(root["artifacts"], "artifacts");
    if (artifacts) {
      read.keys(artifacts, "artifacts", ["retain"]);
      const retain = read.strings(artifacts["retain"], "artifacts.retain");
      if (retain) fields.retain = retain;
    }
  }

  if (root["constraints"] !== undefined) {
    const constraints = read.object(root["constraints"], "constraints");
    if (constraints) {
      fields.constraints = Object.entries(constraints).flatMap(([subject, body]) => {
        const constraint = parseConstraint(read, subject, body);
        return constraint ? [constraint] : [];
      });
    }
  }

  return fields;
}

const PROVENANCE_EXPRESSION = /^evidence\.candidate\(input\.([a-z_][a-z0-9_]*)\)\.provenance\.writer\.model_family$/;

function parseConstraint(read: Reader, subject: string, body: unknown): ModelFamilyConstraint | undefined {
  const field = `constraints.${subject}`;
  if (subject !== "agent.model_family") return read.fail(field, "unsupported constraint subject (supported: agent.model_family)");
  const rule = read.object(body, field);
  if (!rule) return undefined;
  read.keys(rule, field, ["not_equal", "on_unsatisfied"]);
  const expression = typeof rule["not_equal"] === "string" ? rule["not_equal"].trim() : "";
  const match = PROVENANCE_EXPRESSION.exec(expression);
  if (!match) {
    return read.fail(`${field}.not_equal`, "supported form: evidence.candidate(input.<name>).provenance.writer.model_family");
  }
  if (rule["on_unsatisfied"] !== "fail") return read.fail(`${field}.on_unsatisfied`, 'must be "fail"');
  return { subject: "agent.model_family", notEqual: "candidate.writer.model_family", candidateInput: match[1]!, onUnsatisfied: "fail" };
}

// ---------------------------------------------------------------------------
// Composition

export function composePolicy(
  process: ProcessDefinition,
  policy: PolicyDefinition | undefined,
  ceiling: ServiceCeiling,
): EffectivePolicy {
  const problems: string[] = [];
  const base: PolicyFields = policy ?? {};
  const over = process.overrides;
  const origin = policy ? `policy ${policy.name}` : "service defaults";

  // The policy itself must sit inside the service ceiling.
  if (base.timeoutMs !== undefined && base.timeoutMs > ceiling.maxTimeoutMs) {
    problems.push(`${origin}: timeout ${formatMs(base.timeoutMs)} exceeds the service ceiling ${formatMs(ceiling.maxTimeoutMs)}`);
  }
  if (base.maxAttempts !== undefined && base.maxAttempts > ceiling.maxAttempts) {
    problems.push(`${origin}: retry.max_attempts ${base.maxAttempts} exceeds the service ceiling ${ceiling.maxAttempts} (retries are not implemented)`);
  }

  const timeoutMs = narrowNumber(problems, "timeout", base.timeoutMs, over.timeoutMs, formatMs) ?? ceiling.maxTimeoutMs;
  if (base.timeoutMs === undefined && over.timeoutMs === undefined) {
    problems.push("timeout: neither the process nor its policy sets one");
  } else if (timeoutMs > ceiling.maxTimeoutMs) {
    problems.push(`timeout ${formatMs(timeoutMs)} exceeds the service ceiling ${formatMs(ceiling.maxTimeoutMs)}`);
  }
  const maxAttempts = narrowNumber(problems, "retry.max_attempts", base.maxAttempts, over.maxAttempts, String) ?? 1;
  if (maxAttempts > ceiling.maxAttempts) {
    problems.push(`retry.max_attempts ${maxAttempts} exceeds the service ceiling ${ceiling.maxAttempts} (retries are not implemented)`);
  }

  let allow = base.allow ?? [];
  if (over.allow) {
    const widened = over.allow.filter((capability) => !allow.includes(capability));
    if (policy && widened.length > 0) problems.push(`tools.allow: adds ${widened.join(", ")}, which ${origin} does not allow`);
    allow = policy ? over.allow.filter((capability) => allow.includes(capability)) : over.allow;
  }

  let access: WorkspaceAccess = base.access ?? "read-only";
  if (over.access) {
    if (base.access === "read-only" && over.access === "read-write") problems.push(`workspace.access: read-write widens ${origin}'s read-only`);
    else access = over.access;
  }

  let scope: WorkspaceScope = base.scope ?? "repository";
  if (over.scope) {
    if (base.scope !== undefined && over.scope !== base.scope) {
      problems.push(`workspace.scope: ${over.scope} differs from ${origin}'s ${base.scope}; scope cannot be overridden`);
    } else {
      scope = over.scope;
    }
  }

  const constraints = [...(base.constraints ?? [])];
  for (const constraint of over.constraints ?? []) {
    if (constraints.some((existing) => existing.subject === constraint.subject)) {
      problems.push(`constraints.${constraint.subject}: already set by ${origin}; constraints can only be added`);
    } else {
      constraints.push(constraint);
    }
  }
  for (const constraint of constraints) {
    if (!process.required.includes(constraint.candidateInput)) {
      problems.push(`constraints.${constraint.subject}: refers to input.${constraint.candidateInput}, which ${process.name} does not require`);
    }
  }

  // A read-only workspace is an isolation denial of writes.
  const readOnlyDenials: Capability[] = access === "read-only" ? ["repository.write", "repository.history.write"] : [];
  const deny = union<Capability>(base.deny ?? [], over.deny ?? [], readOnlyDenials);
  const capabilities = allow.filter((capability) => !deny.includes(capability));

  if (problems.length > 0) {
    throw new InputError(`process ${process.name} is invalid:\n  ${problems.join("\n  ")}`);
  }
  return {
    timeoutMs,
    maxAttempts,
    allow,
    deny,
    capabilities,
    access,
    scope,
    resources: union(base.resources ?? [], over.resources ?? []),
    retain: union(base.retain ?? [], over.retain ?? []),
    constraints,
  };
}

function narrowNumber(
  problems: string[],
  field: string,
  base: number | undefined,
  override: number | undefined,
  format: (value: number) => string,
): number | undefined {
  if (override === undefined) return base;
  if (base !== undefined && override > base) {
    problems.push(`${field}: ${format(override)} widens the policy's ${format(base)}`);
    return base;
  }
  return override;
}

function union<T>(...lists: T[][]): T[] {
  return [...new Set(lists.flat())];
}

export function formatMs(ms: number): string {
  if (ms % 3_600_000 === 0) return `${ms / 3_600_000}h`;
  if (ms % 60_000 === 0) return `${ms / 60_000}m`;
  if (ms % 1_000 === 0) return `${ms / 1_000}s`;
  return `${ms}ms`;
}
