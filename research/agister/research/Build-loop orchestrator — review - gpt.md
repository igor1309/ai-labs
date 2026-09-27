Build-loop orchestrator — review - gpt

## Critical review

The proposal has a strong control-loop architecture: small work units, externalized state, deterministic gates, fresh agents, bounded execution, and separation between builder/reviewer/judge roles. Build\-loop orchestrator.md The main weaknesses sit at the boundaries between those mechanisms.

### Critical issues

**1. The verdict ledger is keyed too weakly.**  
The proposal records verdicts “keyed by SHA,” and `accept` trusts that lookup without rerunning verification. [oai_citation:1‡Build-loop orchestrator.md](sediment://file_000000009be0820e9b97adb5e6edc7ad)

A SHA identifies source content. A valid verdict also depends on:

- base/target commit
- gate script version
- test suite version
- plant definitions
- toolchain/environment
- relevant spec/decision revision

Otherwise, a previously green SHA can inherit a stale verdict after verification infrastructure changes.

**Recommendation:** make the ledger key an attestation tuple such as:

`(candidate_sha, base_sha, gate_revision, environment_fingerprint)`

This is probably the most important correctness change.

---

**2. Verification before merge does not establish integration correctness.**  
`accept` merges a previously verified commit and reruns nothing. Build\-loop orchestrator.md With parallel work, the target branch can advance between verification and merge.

The candidate can therefore pass against base **A**, then merge onto base **B**, creating an integration state that was never gated.

**Recommendation:** either:

- accept only an exact verified tree/resulting merge SHA, or
- require the target base to equal the base recorded in the verdict.

This can remain lookup-based without sacrificing the “accept reruns nothing” property.

---

**3. Reviews occur after code has entered the main build stream.**  
Accepted commits immediately enter the review queue, while building continues regardless of review latency. [oai_citation:4‡Build-loop orchestrator.md](sediment://file_000000009be0820e9b97adb5e6edc7ad)

That creates a potentially long speculative dependency chain:

`bad commit → several dependent commits → review finding → remediation row`

The later the finding arrives, the larger the repair surface.

**Recommendation:** preserve asynchronous reviews, but add a dependency barrier for consequential findings. For example, dependent rows may continue until a reviewer/judge marks a finding as architecture-, spec-, or interface-affecting; then descendants become provisional until resolution.

---

**4. Milestone completion and review completion are disconnected.**  
A milestone is declared complete solely when its gate passes. [oai_citation:6‡Build-loop orchestrator.md](sediment://file_000000009be0820e9b97adb5e6edc7ad) Reviews can still be queued at that point. Build\-loop orchestrator.md

That permits a milestone to be “done” while undiscovered or unjudged review findings remain.

**Recommendation:** define two explicit states:

- **gate-complete**
- **closed**

“Closed” should require the milestone gate plus review coverage through a defined commit boundary.

---

**5. The execution isolation model is underspecified.**  
Throwaway worktrees and `/tmp` copies isolate repository state, while builders and test processes can still affect the host environment. [oai_citation:9‡Build-loop orchestrator.md](sediment://file_000000009be0820e9b97adb5e6edc7ad)

For autonomous software-building agents, this is a major operational boundary. Process cleanup catches leftovers; it does not establish filesystem, network, credential, or process isolation.

**Recommendation:** specify an execution sandbox with explicit policies for filesystem mounts, network access, credentials, subprocess trees, CPU/memory, and host tools.

---

### High-priority design problems

**Reviewer context is probably too sparse.** The reviewer receives “only the commits: no focus, no tests.” Build\-loop orchestrator.md This helps avoid steering, but also deprives the reviewer of the normative contract needed to identify requirement violations.

A better input is:

`commit/diff + immutable relevant spec/contracts`

while continuing to exclude builder commentary and suggested review targets.

**“Only a test can prove a finding false” is overly restrictive.** Build\-loop orchestrator.md Some findings concern static properties, specification interpretation, dead code, API compatibility, documentation semantics, or build configuration. Forcing all disputes through runtime tests can manufacture low-value tests and consume builder runs.

Use explicit admissible evidence classes: executable test, compiler/static proof, spec citation, reproducible command, or inspected artifact.

**The global machine lock may become the throughput ceiling.** All deterministic scripts run under a machine-wide lock. Build\-loop orchestrator.md This gives excellent reproducibility but serializes verification even while builders and reviews run concurrently.

Keep serialization initially, but instrument lock utilization and queue time. The architecture should permit later partitioning by resource class.

**Tracker serialization can become a control-plane bottleneck.** `tracker.tsv` has one writer, and judges serialize because they modify it. [oai_citation:14‡Build-loop orchestrator.md](sediment://file_000000009be0820e9b97adb5e6edc7ad) The simplicity is valuable; atomic update/crash-recovery semantics should be specified before scaling concurrency.

---

### Internal inconsistencies

The invariant **“Nothing blocks the build: not a decision, not a review, not a quota”** conflicts with several explicit blocking conditions:

- `start` refuses after an unaccepted merge. Build\-loop orchestrator.md
- baseline failure “stops everything.” Build\-loop orchestrator.md
- a second usage-limit hit stops spawning builders. Build\-loop orchestrator.md

Rewrite the invariant around the intended distinction:

> Administrative and asynchronous dependencies never block progress; integrity and safety gates may.

That matches the actual design much more precisely.

### Process incentives worth reconsidering

The hard limit of **7 scenarios / 10 cases** is operationally simple but makes count the proxy for complexity. Build\-loop orchestrator.md A step with ten trivial cases and a step changing a core concurrency abstraction can have radically different risk.

Keep the limits as backstops, then add decomposition triggers based on changed modules, dependency surface, interface changes, or expected gate duration.

Likewise, turning essentially every surviving review finding into a tracker row encourages review-volume amplification. Build\-loop orchestrator.md Add finding class/severity and a defined disposition for informational findings so the tracker remains a work queue rather than a transcript.

### Strong parts worth preserving

The proposal's strongest elements are:

- repository state as resumable process memory Build\-loop orchestrator.md
- small steps with fresh builders Build\-loop orchestrator.md
- bounded execution with externally observed liveness Build\-loop orchestrator.md
- baseline-aware timeouts and explicit environment-failure treatment Build\-loop orchestrator.md
- provisional decisions separated from owner ratification Build\-loop orchestrator.md
- explicit pinning and re-pin procedure for external binaries Build\-loop orchestrator.md

### Priority order

I would fix these before implementing the full loop:

1. **Verdict identity and merge-base correctness**
2. **Milestone/review completion semantics**
3. **Execution sandbox**
4. **Reviewer access to normative specs**
5. **Evidence rules for rejecting review findings**
6. **Concurrency/lock model**

The core design is coherent enough to build on. Its principal risk is that it currently treats several *local* proofs—SHA verdicts, step gates, and milestone gates—as though they automatically compose into a *global* proof of correctness. The architecture needs explicit composition rules at merge, review, and milestone boundaries.