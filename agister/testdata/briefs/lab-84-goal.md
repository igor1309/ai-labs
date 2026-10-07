# LAB-84: home's settings have one source in git, installed with `agister install`

## Intent

Multica LAB-84. Home's settings (`~/.agister`) are made by hand from this
repository, and the copies drift unseen:

- `agister install <dir>` reports a folder's `skills/` as not settings
  (ADR-016 rule 1; ADR-021 non-decisions), so a settings skill reaches
  `~/.agister/skills` only by hand.
- `~/.agister/prompts/*.md` are hand copies of `ai-labs/prompts/`; on
  2026-10-07 `advisor.md` and `code-review-clarity.md` differ from it.
- `~/.agister/processes/*review*.yaml` and `advisor.yaml` are hand-edited
  copies of `.agister/processes/`, reading their prompts by absolute path
  (`{source: file, path: /Users/.../.agister/prompts/<name>.md}`).

The owner chose one source folder in git for home's global settings,
installed with `agister install`, which learns skills; `ai-labs/prompts/`
stops being the source of home's copies. Any later difference between
home and the folder then shows as a replace, with its diff, in the next
install's plan.

## Done when

1. An ADR (the next number, `agister/docs/adr/`) decides it: where the
   home folder lives, what it holds and what it leaves to home alone (live
   state, machine-local documents such as `service.toml` or agents whose
   commands are paths, as the ADR finds), how its processes read their
   prompts without absolute paths (for example as settings prompts,
   ADR-014), what happens to the duplicated `ai-labs/prompts/` files and
   the repository's own `.agister/` copies, and how `install` takes a
   skill (`skills/<name>/SKILL.md`, ADR-021 rule 1). It amends ADR-016
   rule 1 and ADR-021's non-decision, and is accepted after
   `adr_review`.
2. `agister install` plans, checks, backs up, writes and restores a
   skill as it does any settings document, and reports a skill folder
   that is not a skill as ADR-021 rule 1 has it; tests say so.
3. The home folder exists in git as the ADR decides, passes `agister
   check` as global settings, and a repository test keeps it passing.
   Where it holds a document that `.agister/` also holds, the test or the
   ADR says how the two cannot differ unseen.
4. The done gates: the caller skill (`agister/skills/agister/SKILL.md`),
   `agister/README.md`, `agister/docs/settings-architecture/` and
   `agister/pages/` say the same where they describe install, skills or
   home's settings. Say in the notes which needed no change and why.

## Out of scope

- Installing into home: the owner runs `agister install` on the folder
  after the merge.
- Pruning documents only home has (ADR-016 non-decision).
- Skills with files beside `SKILL.md` (ADR-021 non-decision).

## Sources

- Multica LAB-84; ADR-014, ADR-016, ADR-021.
- Advisor run `20261007T182802Z-562aca` (`agister/testdata/briefs/lab-84-question-1.md`): the choice is the owner's.

## Decisions

- 2026-10-07, owner: option (a), one home settings folder in git,
  installed with `agister install`, which learns skills; `ai-labs/prompts/`
  stops being the source of home's copies.
- 2026-10-07, owner, on ADR-027 as proposed (adr_review
  `20261007T183934Z-6c7c05`, approved): first chose to keep the
  `.agister/` copies, then, on reflection, one copy: each shared document
  lives only in `agister/home/`, and `.agister/` keeps only what is the
  repository's own. The reason: the repository already depends on home
  (runs live there; only home has `runtimes/claude-code.yaml`), so
  copies would buy little and make every change twice.

## Open

None.
