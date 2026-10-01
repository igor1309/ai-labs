# Codex agents are named after their model version

The repository's Codex agents `codex-sol` and `codex-implementer-sol`
(`.agister/agents/`) run `gpt-6.1-sol`. "Sol" is a line of models across
versions (GPT-6.1 Sol, GPT-6 Sol, GPT-5.6 Sol), so the names hide which
model runs. Agent names allow `^[a-z][a-z0-9_-]*$`, no period: rename them
to `codex-sol-61` and `codex-implementer-sol-61`.

Rename the files and their `name`, and update every reference in the
repository's settings (`.agister/processes/*.yaml`), tests, docs and
examples. Leave dated records (run logs, research notes, briefs under
`agister/testdata/briefs/`) as they are. `agister check` and the
repository-settings test must pass.

Use the quiet test commands from `agister/AGENTS.md`; report each with its
exit code and final line, and list every file you changed.
