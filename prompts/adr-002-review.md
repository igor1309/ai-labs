Review critically, as a skeptic, a new architecture decision for Agister (a Go
CLI orchestrator of AI agent calls): `agister/docs/adr/002-verify-and-bounded-repair.md`
(new), its amendment of `agister/docs/adr/001-agister-cli-architecture.md`,
new items 13 and 14 plus a note on item 1 in `agister/docs/deferred.md`, and
the source note `research/agister/research/verify-repair-prior-art.md`.

Read ADR-001 in full and check ADR-002 against it: contradictions with its
rules and invariants (especially rules 1, 2, 3, 6, 7, 11, 12 and the
invariant list), gaps that would let a failed or unverified implementation be
reported completed, unbounded behavior, ambiguous rules an implementer would
read two ways, and claims in ADR-002 not supported by the sources.

Do not relitigate these settled choices: same-session repair inside the node;
no retry node; no verification-specific failure class or result field; a
required per-run verify timeout.

Also check against the current code where relevant (`agister/internal`:
limits, node result, failure classes, session continuation). For each
finding give the file, line, severity and a concrete fix. Be concise; no
praise.
