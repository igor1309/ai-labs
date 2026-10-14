# A Claude call gets the repository's instruction files

The Claude Code adapter (`agister/internal/adapters/runtime/claudecode`)
starts `claude -p` with `--restricted`, which ignores project settings, and
with them the repository's instruction files. So every Agister Claude call
has run without the repository's `AGENTS.md`: asked, two implementers said
they saw none, and one broke its fixes by hand to watch tests fail, which
the root `AGENTS.md` forbids. Without `--restricted`, from the repository
root, Claude Code loads the root `AGENTS.md`.

Keep `--restricted` and `--strict-mcp-config`. Instead, for every turn, the
adapter gives the model the instruction files Claude Code would load for
the turn's working directory: each `AGENTS.md` and `CLAUDE.md` from the
repository root (the git top-level of the working directory; the working
directory itself if it is in no repository) down to the working directory,
root first. They go in the appended system prompt, before the process's
instruction, each introduced by its path relative to the root. A file that
cannot be read fails the turn before it starts, naming the file; a missing
file is simply absent.

The run records which files the turn received: each path and its sha256,
as an event of the turn (or wherever the adapter already records what a
turn was given, if there is such a place).

Reading the files happens behind a seam the tests can supply, so a regular
test with a `t.TempDir()` repository proves: the order root first; both
names; a working directory below the root gets the files along its path
and not those of sibling directories; no repository means the working
directory alone; an unreadable file fails the turn; the recorded paths and
digests. Update the package comment's contract text accordingly. Do not
change ADR files.

Use the quiet test commands from `agister/AGENTS.md`; report each with its
exit code and final line, and list every file you changed.
