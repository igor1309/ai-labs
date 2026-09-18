# ADR: Quota-Aware Account Selection

**Status:** Accepted

## Context

A pool of accounts is interchangeable for new sessions. All accounts have equal short-window and weekly quota capacities, independent reset times for each horizon, and equivalent per-session quota cost.

This decision applies while those assumptions hold; heterogeneous capacities or session costs require reconsideration.

## Objective

Use linear budget pacing to maximize the pacing ratio of the most constrained quota horizon among candidate accounts.

## Decision

For each quota horizon `q`:

```text
pacing_ratio(q) =
    remaining_fraction(q) /
    remaining_time_fraction(q)
```

`remaining_fraction` is the fraction of that horizon's quota capacity still available. `remaining_time_fraction` is the fraction of its current reset interval still remaining.

A ratio of `1` represents linear pacing. As a reset approaches, unused capacity raises the ratio, naturally biasing selection toward capacity that is becoming more perishable.

Consider only accounts with valid authoritative quota state and sufficient quota on both horizons.

Rank each account by the **descending lexicographic maximum** of:

```text
(min(short_ratio, weekly_ratio),
 max(short_ratio, weekly_ratio))
```

The primary rule maximizes the bottleneck pacing ratio. Only when primary ratios are exactly equal does the second value prefer the account with greater headroom on its other horizon. Any remaining equality uses an independent deterministic tie-breaker.

If any candidate's quota resets while a selection is pending, reselect against the new candidate states. A reset causes a discontinuous score change that can reorder candidates. Existing assigned sessions are unaffected.

## Alternatives Considered

- **Round-robin/random:** ignores quota pressure and reset timing.
- **Most quota remaining:** ignores how soon capacity resets.
- **Expiry-first:** can spend an account whose other horizon is critically constrained.
- **Bottleneck only:** equivalent for ordinary selections, but leaves exact bottleneck ties unordered.
- **Weighted combined score:** allows surplus in one horizon to compensate for scarcity in the other, contrary to bottleneck priority.

## Consequences

The policy favors sustainable bottleneck pacing over immediate utilization. It is greedy and uses current quota state rather than forecasting future demand; assignments may therefore concentrate temporarily on the current highest-ranked account.

It is a scheduling heuristic and makes no claim of globally optimal throughput.

Concurrency, persistence, arithmetic, retry behavior, and tie-break mechanics are implementation concerns governed separately.
