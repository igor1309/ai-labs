/// Picks exactly one scope to audit: the least-recently-audited scope in the
/// registry. A scope with no recorded audit is treated as the oldest (stale);
/// ties are broken by registry order. Returns null when there are no scopes.
export function selectScope({ scopeIds, state }) {
  let chosen = null;
  let chosenAt = null;
  for (const id of scopeIds) {
    const auditedAt = state[id]?.lastAuditedAt ?? null;
    if (chosen === null || isOlder(auditedAt, chosenAt)) {
      chosen = id;
      chosenAt = auditedAt;
    }
  }
  return chosen;
}

/// True when `a` represents an older (or never) audit than `b`. A null audit
/// time is the oldest possible value.
function isOlder(a, b) {
  if (a === null) return b !== null;
  if (b === null) return false;
  return a < b;
}
