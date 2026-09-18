# ADR: Quota-Aware Account Selection

**Status:** Accepted

## Context

A pool of accounts is interchangeable for new sessions. All accounts have equal short-window and monthly quota capacities, independent reset times for each horizon, and equivalent per-session quota cost.

This decision applies while those assumptions hold; heterogeneous capacities or session costs require reconsideration.

## Objective

Use **linear budget pacing** to maximize the pacing ratio of the most constrained quota horizon among candidate accounts.

Among accounts with an equal bottleneck pacing ratio, prefer greater headroom on the other horizon. This avoids unnecessarily consuming an account that is equally constrained at its bottleneck but more constrained overall.

The policy therefore prioritizes preservation of the tightest horizon, while biasing toward surplus capacity as its reset approaches.

## Decision

For each quota horizon `q`:

```text
pacing_ratio(q) =
    remaining_fraction(q) /
    remaining_time_fraction(q)
```

`1` represents linear pacing; higher values indicate capacity available faster than the reference pace.

Consider only accounts with valid authoritative quota state and sufficient quota on every constrained horizon.

Rank each account lexicographically by:

```text
(min(short_ratio, monthly_ratio),
 max(short_ratio, monthly_ratio))
```

The first value maximizes bottleneck sustainability. The second prefers greater overall headroom when bottleneck sustainability is equal. Otherwise-equal accounts use an independent deterministic tie-breaker.

A reset crossing requires reselection because the pacing ratios—and therefore the basis of the ranking—belong to the quota intervals in which they were calculated.

## Alternatives Considered

- **Round-robin/random:** ignores quota pressure and reset timing.
- **Most quota remaining:** ignores how soon capacity resets.
- **Expiry-first:** can spend an account whose other horizon is critically constrained.
- **Bottleneck only:** leaves materially different secondary headroom indistinguishable.
- **Weighted combined score:** allows surplus in one horizon to compensate for scarcity in the other, contrary to bottleneck priority.

## Consequences

The policy favors sustainable bottleneck pacing over immediate utilization. It is a scheduling heuristic and makes no claim of globally optimal throughput.

Concurrency, persistence, arithmetic, retry behavior, and tie-break mechanics are implementation concerns governed separately.
