/// Records that a scope was audited at `commit`/`at`, returning a new state.
/// The per-scope entry holds only the last-audited commit and timestamp — it is
/// not Lobster's in-flight resume state.
import { readFile, rename, writeFile } from 'node:fs/promises';

export function commitScope(state, { scopeId, commit, at }) {
  return {
    ...state,
    [scopeId]: { lastAuditedCommit: commit, lastAuditedAt: at },
  };
}

/// Drops state entries whose scope is no longer in the registry, so a removed
/// scope is neither audited nor carried forever.
export function pruneState(state, scopeIds) {
  const keep = new Set(scopeIds);
  return Object.fromEntries(
    Object.entries(state).filter(([scopeId]) => keep.has(scopeId)),
  );
}

/// Reads the per-scope last-audited state from `path`. An absent file yields an
/// empty state, so a fresh install treats every scope as stale.
export async function readState(path) {
  let raw;
  try {
    raw = await readFile(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
  return JSON.parse(raw);
}

/// Writes `state` to `path` atomically: serialize to a sibling temp file, then
/// rename over the target so a crash mid-write never leaves a partial file.
export async function writeStateAtomic(path, state) {
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`);
  await rename(tmp, path);
}
