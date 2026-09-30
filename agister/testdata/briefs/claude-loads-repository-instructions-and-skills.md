# A Claude call loads the repository's instructions and skills (ADR-006)

ADR-006 (`agister/docs/adr/006-a-call-gets-its-repository-instructions.md`):
a call runs its runtime so that it loads the repository's instruction
files and skills as it would for a person working in the same directory;
Agister passes no flag that turns that loading off, and gives the agent
the tool it needs to use a skill.

The Claude Code adapter (`agister/internal/adapters/runtime/claudecode`)
breaks both: it passes `--restricted`, which drops `AGENTS.md`,
`CLAUDE.md` and the skills, and its `--tools`/`--allowedTools` never
include `Skill`, so no skill can be used.

- Stop passing `--restricted`.
- Every turn gets the `Skill` tool, in both `--tools` and `--allowedTools`,
  whatever primitives the plan grants.
- Update the package comment's contract text, and the contract version
  and anything keyed to it (permission mappings, verified versions) as the
  code base does for a contract change.

Regular tests prove the arguments: no `--restricted`, and `Skill` present
on a fresh and a resumed turn, with and without granted primitives. Then,
in a `t.TempDir()`, confirm once with the installed `claude` that a turn
started with the adapter's arguments loads the directory's `AGENTS.md`
and offers the `Skill` tool, and say how you confirmed it; do not commit
that check as a test if it needs the real `claude`. Do not change ADR
files.

Use the quiet test commands from `agister/AGENTS.md`; report each with its
exit code and final line, and list every file you changed.
