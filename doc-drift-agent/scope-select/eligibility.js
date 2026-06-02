/// Whether a scope is change-eligible for this run, from injected git facts.
/// A scope qualifies when it was never audited (no prior commit), when its
/// last-audited commit is unreachable (e.g. history rewrite ⇒ `changedPaths`
/// is null), or when its paths changed since that commit.
/// The scope's files that changed between `commit` and `HEAD`, via the injected
/// `runGit(args) -> { status, stdout }`. Returns null when git fails (e.g. the
/// commit is unreachable after a history rewrite), which callers treat as
/// change-eligible.
/// The set of change-eligible scope ids. For each scope, derives its changed
/// paths from its last-audited commit via the injected `runGit` and applies
/// `isChangedEligible`. Scope paths are passed as git `:(glob)` pathspecs so the
/// registry's `**` globs match.
export function eligibleScopes({ scopeIds, registry, state, runGit }) {
  const eligible = new Set();
  for (const id of scopeIds) {
    const lastAuditedCommit = state[id]?.lastAuditedCommit ?? null;
    const changedPaths =
      lastAuditedCommit == null
        ? null
        : changedPathsSince({
            commit: lastAuditedCommit,
            paths: (registry.scopes[id].docs ?? []).map((path) => `:(glob)${path}`),
            runGit,
          });
    if (isChangedEligible({ lastAuditedCommit, changedPaths })) eligible.add(id);
  }
  return eligible;
}

export function changedPathsSince({ commit, paths, runGit }) {
  const result = runGit(['diff', '--name-only', commit, 'HEAD', '--', ...paths]);
  if (result.status !== 0) return null;
  return result.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
}

export function isChangedEligible({ lastAuditedCommit, changedPaths }) {
  if (lastAuditedCommit == null) return true;
  if (changedPaths == null) return true;
  return changedPaths.length > 0;
}
