# LAB-122: settings newer than the binary that develops them

## Intent

Multica LAB-122. The installed binary reads the project's `.agister/`
from the worktree it works in. A branch that adds a settings field and
uses it there in the same branch makes that binary refuse every later
run on the branch: `--continue`, `code_review`, everything. In LAB-119,
implement run `20261007T103130Z-66a352` added `form: [goal, step]` to
`.agister/processes/implement.yaml`, and its `--continue`
(`20261007T111309Z-c1d3e2`) was refused with
`input.values.brief.form: must be a scalar` and no hint at the cause.

The owner chose option C (LAB-122 question 1): a rule that prevents it,
and a refusal that says what happened when it does.

## Done when

1. **The rule.** `agister/AGENTS.md` says: a change that adds a settings
   field, or a value a field did not accept before, adopts it in this
   repository's `.agister/` only in the change's last commit, after its
   reviews, or in a later change after the deploy. Until then the
   change's tests use the field in their own temp settings, not through
   the repository's `.agister/`. The rule names the refusal (Done when 2)
   as the sign that it was broken.
2. **The refusal.** A settings problem that comes from a field or a
   field's shape this binary does not know is marked unknown, so it
   carries the existing hint `the settings may need one newer than
   agister <version>`. This covers LAB-119's case: a field under
   `input.values.<name>` whose value is not a scalar, where this binary
   reads only scalars. A known field with a wrong value, such as a list
   of sources or a null, stays an ordinary problem without the hint. (An
   unknown source name keeps its hint, as today: this binary cannot tell
   a misspelt source from a newer one.)
3. **Every refusal shows it.** The hint appears both on `agister check`
   and on a command refused for its settings, such as `agister run`.
   Tested through the CLI with settings in `t.TempDir()`, including the
   LAB-119 document shape.
4. The done gates where the refusal is described: the caller skill
   (`agister/skills/agister/SKILL.md`) and `agister/README.md`. Say in
   the notes which needed no change and why
   (`docs/settings-architecture/`, `pages/`).

## Out of scope

- Reading project settings from another directory or revision (option
  B).
- Relaxing strict settings reading: an unknown field still refuses
  what uses it (ADR-015).

## Sources

- Multica LAB-122; LAB-119's runs named above.
- `agister/internal/domain/definition/documents.go` (`parseInputs`),
  `definition.go` (`problems.unknown`), `internal/cli/cli.go`
  (`printCheck`).
- ADR-015.

## Decisions

- 2026-10-07, owner: take LAB-122, option C of LAB-122 question 1.
  This goal expressly directs the edit to `agister/AGENTS.md`.
- 2026-10-07: Done when 2's example corrected. It named a misspelt
  source as an ordinary problem; an unknown source is already marked
  unknown (`TestCheckMarksWhatThisBinaryDoesNotKnow`), and stays so.

## Open

None.
