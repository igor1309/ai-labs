import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { parseFlatToml, stringifyFlatToml, type FlatTable } from "./toml.js";

// An agent profile holds reusable runtime configuration only: which runtime,
// which model and how sessions may be used. It carries no task prompt, tools
// or policy; those belong to the process that uses the profile.

export const AGENT_SCHEMA = "agister.agent/v1alpha1";
export const RUNTIMES = ["claude-code", "codex"] as const;
export type Runtime = (typeof RUNTIMES)[number];

// Effort levels are runtime vocabulary, validated per runtime rather than
// mapped onto a shared scale.
export const EFFORTS: Record<Runtime, readonly string[]> = {
  "claude-code": ["low", "medium", "high", "xhigh", "max"],
  codex: ["minimal", "low", "medium", "high", "xhigh"],
};

export interface AgentProfile {
  name: string;
  runtime: Runtime;
  model?: string;
  effort?: string;
  session: "fresh-only";
  command?: string;
}

const NAME = /^[a-z][a-z0-9-]*$/;

export function agentsDirectory(stateDirectory: string): string {
  return join(stateDirectory, "agents");
}

export function validateProfile(table: FlatTable, source: string): AgentProfile {
  const fail = (message: string): never => {
    throw new Error(`${source}: ${message}`);
  };
  const optionalString = (key: string): string | undefined => {
    const value = table[key];
    if (value === undefined) return undefined;
    if (typeof value !== "string" || value === "") fail(`${key} must be a non-empty string`);
    return value as string;
  };

  const known = new Set(["schema", "name", "runtime", "model", "effort", "session", "command"]);
  for (const key of Object.keys(table)) {
    if (!known.has(key)) fail(`unknown field: ${key}`);
  }

  if (table["schema"] !== AGENT_SCHEMA) fail(`schema must be "${AGENT_SCHEMA}"`);

  const name = optionalString("name") ?? fail("name is required");
  if (!NAME.test(name)) fail(`invalid name: ${name}`);

  const runtime = optionalString("runtime") ?? fail("runtime is required");
  if (!(RUNTIMES as readonly string[]).includes(runtime)) {
    fail(`unsupported runtime: ${runtime} (supported: ${RUNTIMES.join(", ")})`);
  }

  const effort = optionalString("effort");
  const efforts = EFFORTS[runtime as Runtime];
  if (effort !== undefined && !efforts.includes(effort)) {
    fail(`unsupported ${runtime} effort: ${effort} (supported: ${efforts.join(", ")})`);
  }

  const session = optionalString("session") ?? "fresh-only";
  if (session !== "fresh-only") fail(`unsupported session mode: ${session}`);

  const profile: AgentProfile = { name, runtime: runtime as Runtime, session: "fresh-only" };
  const model = optionalString("model");
  const command = optionalString("command");
  if (model !== undefined) profile.model = model;
  if (effort !== undefined) profile.effort = effort;
  if (command !== undefined) profile.command = command;
  return profile;
}

export async function loadProfile(stateDirectory: string, name: string): Promise<AgentProfile> {
  const path = join(agentsDirectory(stateDirectory), `${name}.toml`);
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    throw new Error(`agent not found: ${name} (expected ${path}; create it with \`agister agent create ${name}\`)`);
  }
  const profile = validateProfile(parseFlatToml(text, path), path);
  if (profile.name !== name) throw new Error(`${path}: name "${profile.name}" does not match file name`);
  return profile;
}

export async function saveProfile(
  stateDirectory: string,
  profile: AgentProfile,
  options: { overwrite?: boolean } = {},
): Promise<string> {
  const table: FlatTable = { schema: AGENT_SCHEMA, name: profile.name, runtime: profile.runtime };
  if (profile.model) table["model"] = profile.model;
  if (profile.effort) table["effort"] = profile.effort;
  table["session"] = profile.session;
  if (profile.command) table["command"] = profile.command;

  const directory = agentsDirectory(stateDirectory);
  const path = join(directory, `${profile.name}.toml`);
  validateProfile(table, path);

  await mkdir(directory, { recursive: true });
  await writeFile(path, stringifyFlatToml(table), { flag: options.overwrite ? "w" : "wx" }).catch((error) => {
    if (error.code === "EEXIST") throw new Error(`agent already exists: ${path} (use --force to replace it)`);
    throw error;
  });
  return path;
}

export async function listProfiles(stateDirectory: string): Promise<AgentProfile[]> {
  let entries: string[];
  try {
    entries = await readdir(agentsDirectory(stateDirectory));
  } catch {
    return [];
  }
  const names = entries.filter((entry) => entry.endsWith(".toml")).map((entry) => entry.slice(0, -5)).sort();
  return Promise.all(names.map((name) => loadProfile(stateDirectory, name)));
}
