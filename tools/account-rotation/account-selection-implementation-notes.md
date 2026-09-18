# Quota-Aware Account Selection: Implementation Notes

These notes operationalize the policy in [account-selection-adr.md](./account-selection-adr.md). They do not change the decision recorded in the ADR.

- **Ranking direction:** select the lexicographic maximum of `(min(short_ratio, weekly_ratio), max(short_ratio, weekly_ratio))`; both components are ordered descending. Apply the deterministic tie-breaker only after both ratio components are equal.
- **Quota state:** use one authoritative snapshot per selection. The snapshot should include remaining quota, capacity, reset time, and the timestamp at which the state was observed for each horizon.
- **Fractions:** calculate `remaining_fraction` as remaining quota divided by total interval capacity, and `remaining_time_fraction` as time until reset divided by the interval duration. Clamp minor floating-point excursions to the valid range.
- **Reset boundaries:** process a reset before calculating ratios. A horizon whose reset is due has a new interval, rather than a zero denominator. Recompute selection after any horizon reset crossing.
- **Eligibility:** an account is eligible only when its snapshot is authoritative and it has enough quota for the requested session on every applicable horizon. If no account is eligible, refresh authoritative state before failing or applying the caller’s retry policy.
- **Recomputation:** evaluate the ranking for each new session (or another explicitly bounded selection interval), and invalidate cached rankings after quota consumption or a reset. Do not assume that a ranking remains valid for the whole quota interval.
- **Concurrency:** reserve or otherwise serialize quota consumption with selection so concurrent sessions cannot all act on the same unconsumed quota. Re-read authoritative state after a rejected reservation and retry according to the caller’s retry policy.
- **Arithmetic and clocks:** use a monotonic clock for elapsed-time calculations where available, handle reset timestamps in a consistent time basis, and use sufficient precision to avoid changing the ordering near ties.
- **Observability:** record the selected account, both ratios, eligibility exclusions, snapshot age, and tie-break outcome so pacing decisions can be diagnosed without exposing credentials.
