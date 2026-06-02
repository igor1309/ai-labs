/// Picks exactly one scope to audit: the least-recently-audited scope among the
/// eligible ones. A scope with no recorded audit is treated as the oldest
/// (stale); ties are broken by registry order. When an `eligible` set is given,
/// scopes outside it are skipped (an absent set means all scopes are eligible,
/// the Phase-1 behaviour). Returns null when no eligible scope remains.
export function selectScope({ scopeIds, state, eligible }) {
  let chosen = null;
  let chosenTime = Infinity;
  for (const id of scopeIds) {
    if (eligible && !eligible.has(id)) continue;
    const time = auditTime(state[id]?.lastAuditedAt);
    if (chosen === null || time < chosenTime) {
      chosen = id;
      chosenTime = time;
    }
  }
  return chosen;
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
