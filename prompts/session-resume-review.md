Review critically, as a skeptic, a code change in Agister (a Go CLI
orchestrator of AI agent calls, module `agister/`): the diff from the base
to the candidate. It removes Agister-chosen ("preset") session IDs and
makes continuation resume the provider session the runtime reported, in
place, on both Claude Code (`claude -p --resume <id>`, no `--fork-session`,
no `--session-id`) and Codex (new contract `codex/2`: `codex exec resume
<thread_id>`, sandbox set with `-c`/`--config sandbox_mode=...` because
`exec resume` has no `--sandbox`). It adds a refusal when the continued run
is not the latest in its session's chain (`laterInChain` in
`agister/internal/app/calls.go`).

The decision is in `agister/docs/adr/001-agister-cli-architecture.md` rule
12 and invariant 12; live CLI behaviour is recorded in
`research/agister/research/session-resume-observations.md`. Do not
relitigate: in-place resume on both runtimes, no preset ID, no fork.

Look for:
- ways a continuation can append to a session from a stale point, or two
  continuations can both proceed; states `laterInChain` misclassifies
  (refused, failed before start, abandoned, lost, cancelled runs; runs
  on another adapter; cycles in `Request.Continue`);
- Codex resume command lines that drop or change a setting a fresh turn
  applies (sandbox, approval, config isolation, model, effort, schema,
  prompt on stdin), or flags `exec resume` does not accept;
- session-mismatch handling on either runtime that lets a turn complete
  in the wrong session, or rejects a valid one;
- whether keeping the contract name `claude-code/1` while its continuation
  flags changed is sound under ADR-001 rule 4, given `codex` was bumped;
- ADR-001 rule 13 (narrow component interfaces) and rule 7 (refusals
  before the turn);
- tests or revert-check mutations
  (`agister/testdata/revert-checks/session-resume.spec`) that do not prove
  what they claim.

For each finding give the file, candidate line, severity and a concrete
fix. Material findings only; be concise; no praise.
