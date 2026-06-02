/// The complete eligible-set selector. Eligibility is `changed ∪ stale`; the
/// `changed` class is drained before the `stale` class, and within each class
/// the least-recently-audited scope comes first. The result is capped at
/// `budget` (default 1) — scopes beyond the cap simply remain eligible next run,
/// since selection is pure and commits nothing. Returns [] when none eligible.
export function selectScopes({ scopeIds, state, changed, stale, budget = 1 }) {
  const changedIds = scopeIds.filter((id) => changed?.has(id));
  const staleIds = scopeIds.filter((id) => stale?.has(id) && !changed?.has(id));
  const ordered = [
    ...orderByAudit(changedIds, state),
    ...orderByAudit(staleIds, state),
  ];
  return ordered.slice(0, Math.max(0, budget));
}

/// Stable ordering of scope ids by audit instant, least-recently-audited first.
/// Equal instants (including two never-audited scopes) keep their input order.
function orderByAudit(ids, state) {
  return [...ids].sort((a, b) => {
    const timeA = auditTime(state[a]?.lastAuditedAt);
    const timeB = auditTime(state[b]?.lastAuditedAt);
    if (timeA < timeB) return -1;
    if (timeA > timeB) return 1;
    return 0;
  });
}

/// The audit instant for ordering, in epoch milliseconds. A missing or
/// unparseable timestamp is the oldest possible value, so it sorts first.
/// Comparing parsed instants (not raw strings) keeps ordering correct across
/// valid ISO 8601 forms such as `…Z` and `…+09:00`.
function auditTime(at) {
  if (at == null) return -Infinity;
  const time = Date.parse(at);
  return Number.isNaN(time) ? -Infinity : time;
}
