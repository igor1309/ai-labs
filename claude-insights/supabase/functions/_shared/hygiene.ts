/** Explicit export contract: unknown analyzer fields never reach messages or the LLM. */
const COUNTERS = [
  "sessions", "score", "tool_calls", "full_reads", "repeated_reads", "builds",
  "unfiltered_builds", "polling_candidates", "repeated_checks", "skill_loads",
  "duplicate_skill_loads", "subagents", "large_results", "result_chars", "parse_errors",
] as const;
const TOKENS = ["input", "cached", "cache_creation", "output", "reasoning"] as const;

type AgentHygiene = {
  counters: Record<string, number>;
  tokens: Record<string, number>;
};

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function numbers(value: unknown, keys: readonly string[]): Record<string, number> {
  const source = object(value);
  return Object.fromEntries(keys.flatMap((key) => {
    const n = source[key];
    return typeof n === "number" && Number.isFinite(n) ? [[key, n]] : [];
  }));
}

/** Missing data stays absent, rather than implying a week with zero activity. */
export function contextHygiene(value: unknown): Record<string, AgentHygiene> {
  const source = object(value);
  const agents: Record<string, AgentHygiene> = {};
  for (const agent of ["claude", "codex"]) {
    const block = object(source[agent]);
    const counters = numbers(block, COUNTERS);
    const tokens = numbers(block.tokens, TOKENS);
    if (Object.keys(counters).length || Object.keys(tokens).length) {
      agents[agent] = { counters, tokens };
    }
  }
  return agents;
}

/** Match the stored JSON shape while filtering it at the remote-data boundary. */
export function hygieneSnapshot(value: unknown): Record<string, unknown> | null {
  const agents = contextHygiene(value);
  if (!Object.keys(agents).length) return null;
  return Object.fromEntries(Object.entries(agents).map(([agent, data]) => [
    agent, { ...data.counters, tokens: data.tokens },
  ]));
}
