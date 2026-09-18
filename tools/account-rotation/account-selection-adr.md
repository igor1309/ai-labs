# ADR: Quota-Aware Account Selection

**Status:** Accepted

## Context

A pool of equivalent accounts is available for new sessions. Each account has:

- the same short-window quota capacity;
- the same monthly quota capacity;
- independent reset times for each quota horizon.

A session has a known, equivalent quota cost across accounts. Quota state and reset boundaries are authoritative. Window duration means the elapsed time between the actual boundaries of that account's current quota interval.

## Objective

Allocate sessions so that the **most constrained quota horizon remains sustainably paced**, while using capacity that would otherwise expire.

Protecting the tighter horizon takes priority over exploiting surplus in the looser horizon.

## Decision

Use **bottleneck-aware linear budget pacing**.

For each eligible account and quota horizon `q`, define:

```text
pacing_ratio(q) =
    remaining_fraction(q) /
    remaining_time_fraction(q)
```

A ratio of `1` represents linear pacing. Higher values indicate capacity that can be consumed faster than the reference pace; lower values indicate a tighter budget.

Rank each account by:

```text
(min(short_ratio, monthly_ratio),
 max(short_ratio, monthly_ratio))
```

and prefer the lexicographically largest value.

Thus:

1. the tighter quota horizon determines the primary ranking;
2. the looser horizon breaks equal primary rankings;
3. an independent deterministic tie-breaker resolves otherwise equal accounts.

Selection uses the current quota interval. A reset crossing invalidates a decision based on the previous interval and requires selection against the new state.

An account is eligible only when both quota horizons can cover the session cost and their state satisfies the quota model invariants: positive capacity and interval duration, valid reset boundary, and remaining quota within capacity.

## Consequences

This policy explicitly favors sustainable pacing of the bottleneck over maximizing immediate quota utilization. It accounts for staggered resets and can consume capacity approaching expiry without sacrificing the tighter horizon's priority.

It is a scheduling heuristic; it does not claim globally optimal throughput.

Concurrency control, state storage, arithmetic representation, reset advancement, retry policy, tie-break implementation, and operational failure handling are implementation concerns governed separately.
