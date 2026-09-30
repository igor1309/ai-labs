# Instruction files come from a pinned commit (ADR-007)

The Claude Code adapter (`agister/internal/adapters/runtime/claudecode`)
gives each turn the repository's `AGENTS.md` and `CLAUDE.md` files
(ADR-006), read from the working tree. ADR-007
(`agister/docs/adr/007-instruction-files-from-a-pinned-commit.md`) changes
where they come from: read them from a commit, pinned once per call.

- A call with a checkout reads them from its checkout's commit; a call
  without one reads them from the repository's `HEAD`, resolved when the
  call starts. Every turn of a call, repair and resumed turns included,
  gets the files of that same commit, whatever the agent commits or edits
  meanwhile. Resolve the commit where the call starts (the core, if the
  adapter cannot know it), and pass it with the turn.
- The set is unchanged: each `AGENTS.md` and `CLAUDE.md` from the
  repository root down to the working directory, root first, as the commit
  has them; a file the commit lacks is absent. A working directory in no
  repository gets none.
- The `INSTRUCTION_FILES` event records the commit besides each path and
  digest.
- A git failure other than "not a repository" fails the turn before it
  starts, naming the cause; it is not taken as "no repository". A relative
  or empty working directory resolves as the process's directory does.
- A join (e.g. `review_judge` in `.agister/workflows/code_review.yaml`)
  gets the files too. Check that it does and add what is missing.

Reading goes through git behind a seam the tests can supply. Regular tests
with a `t.TempDir()` repository prove: files come from the commit, not an
uncommitted edit; a later commit made during the call does not change what
a later turn gets; a call without a checkout reads `HEAD` at its start;
root first, both names, not a sibling's files; no repository; a git
failure fails the turn; relative and empty working directory; the recorded
commit, paths and digests. Update the package comment's contract text. Do
not change ADR files. Codex is out of scope (LAB-26).

Use the quiet test commands from `agister/AGENTS.md`; report each with its
exit code and final line, and list every file you changed.
