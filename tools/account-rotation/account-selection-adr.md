# ADR: Quota-Aware Account Selection

**Status:** Accepted

## Context

- All accounts have equal short-window and monthly quota capacities.
- Each account has independent reset schedules for both horizons.
- Each admitted session has the same known quota cost.
- Reset schedules and quota counters are authoritative, versioned state.
- Linear consumption across each current reset interval is the pacing reference.

## Objective

Keep each account’s **tighter quota horizon** sustainably paced. Only when that constraint is equal should we prefer more abundant / sooner-expiring capacity. This is a pacing policy, not a claim of globally optimal throughput.

## Decision

For each selection attempt:

1. Capture one authoritative `score_time` and read all candidate accounts from one consistent snapshot.
2. Evaluate all resets due at `score_time`; `now >= reset_at` belongs to the new window.
3. An account is eligible when both quotas can admit one session.
4. For each quota `q`, compute the **pre-reservation pacing ratio**:

```text
ratio_q =
  (remaining_q * window_length_q) /
  (capacity_q * time_to_reset_q)
```

`ratio = 1` is exactly on linear pace; larger values indicate more capacity available relative to remaining time.

Score each account as:

```text
(min(short_ratio, monthly_ratio),
 max(short_ratio, monthly_ratio))
```

Choose the lexicographically largest score. Therefore the tighter horizon has absolute priority; the second value affects only an exact primary tie.

Compare ratios exactly by rational cross-multiplication using checked wide integers. `window_length_q` is the authoritative duration of the current reset interval.

For an exact top-score tie, use rendezvous hashing over `(session_id, account_id)` to distribute selections without shared tie-break state.

## Concurrency Contract

Selection is **snapshot-optimal at `score_time`**, not globally maximal at commit time.

Reservation is one atomic transition on the chosen account:

```text
apply commit-time due resets
verify scored version/window identity
re-check both quotas
decrement both quotas
increment version
```

Any version or reset-boundary conflict retries the full selection from a fresh snapshot, using jittered backoff until the request deadline.

## Consequences

Pre-reservation scoring can consume the final admissible slot before reset. Atomic reservation prevents over-admission. Concurrent selectors may contend on the same maximum account; retry/backoff bounds that cost.
