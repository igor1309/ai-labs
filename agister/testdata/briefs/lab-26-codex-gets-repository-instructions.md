# LAB-26: a Codex call loads the repository's instructions and skills

ADR-006 (`agister/docs/adr/006-a-call-gets-its-repository-instructions.md`):
a call runs its runtime so that it loads the repository's instruction
files and skills as it would for a person working in the same directory;
Agister passes no flag that turns that loading off, and gives the agent
the tool it needs to use a skill.

The Codex adapter (`agister/internal/adapters/runtime/codex`) starts
`codex exec` with flags of its own, among them `--ignore-user-config` and
`--ignore-rules`. Find out, with the installed `codex` (codex-cli 0.159.2)
in a `t.TempDir()` repository holding an `AGENTS.md`, a nested
`AGENTS.md` and a skill, what a turn started with the adapter's arguments
loads, and what a plain `codex exec` in the same directory loads. Where
the adapter's flags turn off loading of instruction files or skills,
change them so they do not, keeping whatever else those flags are there
for. Say how you confirmed each point.

Regular tests prove the arguments on a fresh and a resumed turn. Update
the package comment's contract text, and the contract version and
anything keyed to it, as the code base does for a contract change. Do not
change ADR files. If nothing needs to change, change nothing and report
what you found.

Use the quiet test commands from `agister/AGENTS.md`; report each with its
exit code and final line, and list every file you changed.
