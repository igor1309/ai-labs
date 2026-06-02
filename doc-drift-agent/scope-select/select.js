/// Picks exactly one scope to audit: the least-recently-audited scope in the
/// registry. A scope with no recorded audit is treated as the oldest (stale);
/// ties are broken by registry order. Returns null when there are no scopes.
export function selectScope({ scopeIds, state }) {
  let chosen = null;
  let chosenTime = Infinity;
  for (const id of scopeIds) {
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
