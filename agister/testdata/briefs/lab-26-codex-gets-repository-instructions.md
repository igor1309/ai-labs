# LAB-26: a Codex call gets its repository's instruction files

ADR-006 and ADR-007 (`agister/docs/adr/`): every call gets each
`AGENTS.md` and `CLAUDE.md` from the repository root down to its working
directory, root first, read from a commit pinned once per call (its
checkout's commit, else `HEAD` when the call starts), and the run records
the commit and each file's path and digest. The Claude Code adapter does
this already (`agister/internal/adapters/runtime/claudecode`, event
`INSTRUCTION_FILES`).

The Codex adapter (`agister/internal/adapters/runtime/codex`) does not.
Codex loads `AGENTS.md` files itself, from the working tree, but not
`CLAUDE.md`, only up to its own size limit, and Agister records none of
it.

Make the Codex adapter follow ADR-006 and ADR-007 the way the Claude
adapter does: the same files from the same pinned commit, put in the
prompt's instructions ahead of the process's instruction, the same
`INSTRUCTION_FILES` event, the same failures. Codex's own loading of
`AGENTS.md` is turned off, so the model gets each file once and what the
run records is exactly what it got. Find the Codex setting that turns its
loading off in the installed `codex` (codex-cli 0.159.2) and say how you
confirmed it. Share the file reading with the Claude adapter if both need
exactly the same thing; do not make one adapter depend on the other's
package.

Tests as for the Claude adapter, with a `t.TempDir()` repository, plus the
argument that turns Codex's own loading off, on a fresh and on a resumed
turn. Update the package comment's contract text. Do not change ADR files.
Skills are out of scope.

Use the quiet test commands from `agister/AGENTS.md`; report each with its
exit code and final line, and list every file you changed.
